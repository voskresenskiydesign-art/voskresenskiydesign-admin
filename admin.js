import { LANGS, loadContent, tr, esc, hasBackend, DEMO_KEY, parseEmbed } from "./assets/js/core.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const cfg = window.VD_CONFIG || {};
// где лежит сайт: локально админка в /admin/, на отдельном домене — по адресу из config.siteUrl
const SITE = cfg.siteUrl ? cfg.siteUrl.replace(/\/?$/, "/") : "../";
const LANG_NAMES = { uz: "UZ", ru: "RU", en: "EN" };
const RATIOS = ["1/1", "4/5", "3/4", "2/3", "9/16", "16/9", "4/3", "3/2"];

let sb = null;          // Supabase client (null → демо-режим)
let data = null;        // редактируемый контент
let savedJSON = "";     // последнее сохранённое состояние
let tab = "works";
let workFilter = "all";
let pending = 0;        // активные загрузки
let drawerIndex = -1;

/* =========================================================
   Boot / auth
   ========================================================= */
boot();

async function boot() {
  if (hasBackend()) {
    await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js");
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const { data: s } = await sb.auth.getSession();
    if (!s.session) return showLogin();
  }
  start();
}

function loadScript(src) {
  return new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
}

function showLogin() {
  const box = $("[data-login]");
  box.hidden = false;
  $("[data-login-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const err = $("[data-login-err]");
    err.hidden = true;
    const btn = $("button[type=submit]", e.target);
    btn.disabled = true; btn.textContent = "Входим…";
    const { error } = await sb.auth.signInWithPassword({ email: f.get("email"), password: f.get("password") });
    btn.disabled = false; btn.textContent = "Войти";
    if (error) { err.textContent = "Неверный email или пароль"; err.hidden = false; return; }
    box.hidden = true;
    start();
  });
}

async function start() {
  data = normalize(await loadContent(SITE));
  savedJSON = JSON.stringify(data);
  // первый запуск с базой: контента в ней ещё нет — предлагаем перенести текущий одной кнопкой «Сохранить»
  if (sb) {
    const { data: row } = await sb.from("content").select("id").eq("id", cfg.contentId || "main").maybeSingle();
    if (!row) { savedJSON = ""; setTimeout(() => { changed(); toast("Контента ещё нет в базе — нажмите «Сохранить», чтобы перенести его", "ok"); }, 600); }
  }
  $("[data-app]").hidden = false;

  const mode = $("[data-mode]");
  if (sb) {
    mode.textContent = "Подключено к Supabase"; mode.classList.add("is-live");
    const lo = $("[data-logout]"); lo.hidden = false;
    lo.onclick = async () => { if (isDirty() && !confirm("Есть несохранённые изменения. Выйти?")) return; await sb.auth.signOut(); location.reload(); };
  } else {
    mode.textContent = "Демо-режим";
    const b = $("[data-banner]");
    b.hidden = false;
    b.innerHTML = `<b>Демо-режим.</b> Изменения сохраняются только в этом браузере — так можно примерить контент. Чтобы правки увидели все посетители, подключите бесплатную базу Supabase: заполните <code>config.js</code> по инструкции в <code>DEPLOY.md</code>.`;
  }

  $("[data-nav]").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) go(b.dataset.tab); });
  $("[data-save]").addEventListener("click", save);
  $("[data-panel]").addEventListener("click", panelClick);
  addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    if (e.key === "Escape" && !$("[data-drawer]").hidden) closeDrawer();
  });
  addEventListener("beforeunload", (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("input", onField);
  document.addEventListener("change", onField);
  $$("[data-drawer-close]").forEach((b) => b.addEventListener("click", closeDrawer));

  go(location.hash.slice(1) || "works");
}

function normalize(d) {
  d.settings ||= {}; d.settings.cover ||= { type: "gradient", url: "" }; d.settings.seo ||= {};
  d.contacts ||= {}; d.hero ||= {}; d.about ||= {};
  for (const k of ["works", "skills", "roles", "clients", "categories", "stats"]) d[k] = Array.isArray(d[k]) ? d[k] : [];
  return d;
}

/* =========================================================
   State helpers
   ========================================================= */
function get(path) { return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), data); }
function set(path, value) {
  const keys = path.split(".");
  let o = data;
  keys.slice(0, -1).forEach((k, i) => { if (o[k] == null) o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {}; o = o[k]; });
  o[keys.at(-1)] = value;
}
function isDirty() { return JSON.stringify(data) !== savedJSON; }
function changed() {
  const d = isDirty();
  $("[data-dirty]").hidden = !d;
  $("[data-save]").disabled = !d || pending > 0;
  const ds = $("[data-drawer-save]");
  if (ds) { ds.disabled = !d || pending > 0; ds.textContent = d ? "Сохранить" : "Сохранено"; }
}

function onField(e) {
  const el = e.target;
  if (!el.dataset || !el.dataset.path) return;
  if (e.type === "change" && el.type !== "checkbox" && el.tagName !== "SELECT" && el.type !== "color") return;
  let v = el.type === "checkbox" ? el.checked : el.value;
  if (el.dataset.kind === "list") v = v.split(",").map((s) => s.trim()).filter(Boolean);
  set(el.dataset.path, v);
  $$(`[data-path="${CSS.escape(el.dataset.path)}"]`).forEach((o) => { if (o !== el && o.type !== "checkbox") o.value = el.value; });
  changed();
  if (el.dataset.rerender === "drawer") renderDrawer();
  else if (el.dataset.rerender === "panel") render();
}

/* =========================================================
   Field builders
   ========================================================= */
const val = (p) => esc(get(p) ?? "");
const F = {
  text: (label, path, o = {}) => `<label class="fld"><span>${label}</span><input type="text" data-path="${path}" value="${val(path)}" placeholder="${esc(o.ph || "")}" ${o.rr ? `data-rerender="${o.rr}"` : ""}>${o.hint ? `<small>${o.hint}</small>` : ""}</label>`,
  area: (label, path, o = {}) => `<label class="fld"><span>${label}</span><textarea data-path="${path}" rows="${o.rows || 3}">${val(path)}</textarea></label>`,
  i18n: (label, path, o = {}) => `<div class="fld"><span>${label}</span><div class="i18n">${LANGS.map((l) => `<div class="i18n__row"><b>${LANG_NAMES[l]}</b>${o.area
      ? `<textarea data-path="${path}.${l}" rows="${o.rows || 3}">${val(`${path}.${l}`)}</textarea>`
      : `<input type="text" data-path="${path}.${l}" value="${val(`${path}.${l}`)}">`}</div>`).join("")}</div>${o.hint ? `<small>${o.hint}</small>` : ""}</div>`,
  color: (label, path) => `<label class="fld"><span>${label}</span><div class="color-row"><input type="color" data-path="${path}" value="${val(path) || "#ffffff"}"><input type="text" data-path="${path}" value="${val(path)}"></div></label>`,
  select: (label, path, opts, o = {}) => `<label class="fld"><span>${label}</span><select data-path="${path}" ${o.rr ? `data-rerender="${o.rr}"` : ""}>${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(get(path) ?? "") === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`,
  toggle: (label, path, o = {}) => `<label class="switch"><input type="checkbox" data-path="${path}" ${get(path) !== false ? "checked" : ""} ${o.rr ? `data-rerender="${o.rr}"` : ""}><span>${label}</span></label>`,
};

/* =========================================================
   Navigation & rendering
   ========================================================= */
const TABS = {
  works: ["Работы", "Галерея на главной. Перетаскивайте карточки, чтобы менять порядок."],
  hero: ["Главный экран", "Обложка, заголовок и фирменные цвета сайта."],
  about: ["Обо мне", "Текст о себе и цифры."],
  skills: ["Софт", "Инструменты и навыки с иконками."],
  roles: ["Роли", "Направления для работодателей: позиция и 4–5 задач. На сайте — пайплайн с линиями."],
  clients: ["Клиенты", "Логотипы компаний в бегущей ленте."],
  categories: ["Категории", "Фильтры над галереей."],
  contacts: ["Контакты", "Telegram, Instagram, телефон и почта — в шапке и в блоке контактов."],
  settings: ["Настройки", "Название, SEO и резервная копия."],
};

function go(t) {
  if (!TABS[t]) t = "works";
  tab = t;
  history.replaceState(null, "", `#${t}`);
  $$("[data-nav] [data-tab]").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === t));
  $("[data-title]").textContent = TABS[t][0];
  $("[data-subtitle]").textContent = TABS[t][1];
  render();
  window.scrollTo({ top: 0 });
}

function render() {
  const panel = $("[data-panel]");
  panel.innerHTML = ({ works: worksPanel, hero: heroPanel, about: aboutPanel, skills: skillsPanel, roles: rolesPanel, clients: clientsPanel, categories: categoriesPanel, contacts: contactsPanel, settings: settingsPanel })[tab]();
  bindPanel(panel);
  changed();
}

/* ——— Works ——— */
/** путь к медиа относительно сайта → ссылка из /admin/ */
function mediaUrl(u) { return !u || /^(https?:|data:|blob:|\/)/.test(u) ? u || "" : SITE + u; }
function catName(id) { return tr(data.categories.find((c) => c.id === id)?.label, "ru") || id || "—"; }
function demoArt(w) { const p = w.palette || ["#7B5CFF", "#FF5C8A", "#120A24"]; return `<div class="demo" style="--p0:${esc(p[0])};--p1:${esc(p[1])};--p2:${esc(p[2])}"></div>`; }
function thumbOf(w) {
  if (w.sensitive && !w._uploading) return thumbRaw(w) + `<span class="adult-mark">18+</span>`;
  return thumbRaw(w);
}
function thumbRaw(w) {
  if (w._uploading) return `<div class="uploading"><div>Загрузка…<i></i></div></div>`;
  if (w.type === "image" && w.src) return `<img src="${esc(mediaUrl(w.src))}" alt="" loading="lazy">`;
  if (w.type === "video") return w.poster ? `<img src="${esc(mediaUrl(w.poster))}" alt="" loading="lazy">` : w.src ? `<video src="${esc(mediaUrl(w.src))}" muted preload="metadata"></video>` : demoArt(w);
  if (w.type === "embed") { const p = w.poster || parseEmbed(w.src || "")?.thumb; return p ? `<img src="${esc(mediaUrl(p))}" alt="" loading="lazy">` : demoArt(w); }
  return demoArt(w);
}
const TYPE_LABEL = { image: "Фото", video: "Видео", embed: "YouTube/Vimeo", demo: "Демо" };

function worksPanel() {
  const cats = data.categories;
  const list = data.works.map((w, i) => [w, i]).filter(([w]) => workFilter === "all" || w.category === workFilter);
  const demoCount = data.works.filter((w) => w.type === "demo").length;
  return `
    <div class="drop" data-drop tabindex="0" role="button">
      <b>Перетащите сюда фото и видео или нажмите, чтобы выбрать</b>
      <span>JPG, PNG, WEBP, GIF, MP4, WEBM · можно сразу много файлов · фото автоматически сжимаются, у видео создаётся обложка</span>
    </div>
    <div class="toolbar">
      <div class="chips">
        <button class="chip ${workFilter === "all" ? "is-active" : ""}" data-wf="all">Все · ${data.works.length}</button>
        ${cats.map((c) => `<button class="chip ${workFilter === c.id ? "is-active" : ""}" data-wf="${esc(c.id)}">${esc(tr(c.label, "ru"))} · ${data.works.filter((w) => w.category === c.id).length}</button>`).join("")}
      </div>
      <div class="chips">
        ${demoCount ? `<button class="btn btn--ghost btn--sm" data-act="clear-demo">Удалить демо-работы (${demoCount})</button>` : ""}
        <button class="btn btn--ghost btn--sm" data-act="add-embed">+ YouTube / Vimeo</button>
      </div>
    </div>
    <div class="wgrid" data-wgrid>
      ${list.map(([w, i]) => `
        <div class="wcard" draggable="true" data-i="${i}">
          <div class="wcard__thumb" data-edit="${i}">${thumbOf(w)}<span class="wcard__type">${TYPE_LABEL[w.type] || w.type}</span>${w.published === false ? `<span class="wcard__hidden">Скрыто</span>` : ""}</div>
          <div class="wcard__body"><b>${esc(tr(w.title, "ru") || "Без названия")}</b><small>${esc(catName(w.category))}${w.year ? ` · ${esc(w.year)}` : ""}</small></div>
          <div class="wcard__ops">
            <span class="icon-btn grip" title="Перетащите, чтобы переместить">⠿</span>
            <button class="icon-btn" data-move="${i}:-1" title="Раньше">←</button>
            <button class="icon-btn" data-move="${i}:1" title="Позже">→</button>
            <button class="icon-btn" data-vis="${i}" title="${w.published === false ? "Показать" : "Скрыть"}">${w.published === false ? "◌" : "◉"}</button>
            <button class="icon-btn" data-edit="${i}" title="Редактировать">✎</button>
          </div>
        </div>`).join("")}
    </div>
    ${list.length ? "" : `<p class="muted" style="text-align:center;padding:40px 0">Здесь пока пусто — загрузите первые работы.</p>`}`;
}

function bindWorks(panel) {
  const drop = $("[data-drop]", panel);
  drop.onclick = async () => { const files = await pickFiles("image/*,video/*", true); if (files.length) addWorksFromFiles(files); };
  drop.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); drop.click(); } };
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); drop.classList.add("is-over"); } }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("is-over")));
  drop.addEventListener("drop", (e) => { e.preventDefault(); const files = [...(e.dataTransfer?.files || [])].filter((f) => /^(image|video)\//.test(f.type)); if (files.length) addWorksFromFiles(files); });

  // drag to reorder (grid is re-created on every render, so binding here is safe)
  bindWorkDrag(panel);
}

function worksClick(e) {
  {
    const wf = e.target.closest("[data-wf]"); if (wf) { workFilter = wf.dataset.wf; render(); return; }
    const ed = e.target.closest("[data-edit]"); if (ed) { openDrawer(+ed.dataset.edit); return; }
    const mv = e.target.closest("[data-move]"); if (mv) { const [i, d] = mv.dataset.move.split(":").map(Number); moveItem(data.works, i, i + d); render(); return; }
    const vs = e.target.closest("[data-vis]"); if (vs) { const w = data.works[+vs.dataset.vis]; w.published = w.published === false; render(); return; }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "add-embed") addEmbed();
    if (act === "clear-demo" && confirm("Удалить все демо-работы? Ваши загруженные работы останутся.")) { data.works = data.works.filter((w) => w.type !== "demo"); render(); }
  }
}

function bindWorkDrag(panel) {
  let from = -1;
  const grid = $("[data-wgrid]", panel);
  grid.addEventListener("dragstart", (e) => { const c = e.target.closest(".wcard"); if (!c) return; from = +c.dataset.i; c.classList.add("is-dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(from)); });
  grid.addEventListener("dragend", () => { $$(".wcard", grid).forEach((c) => c.classList.remove("is-dragging", "is-target")); });
  grid.addEventListener("dragover", (e) => { const c = e.target.closest(".wcard"); if (!c || from < 0) return; e.preventDefault(); $$(".is-target", grid).forEach((x) => x !== c && x.classList.remove("is-target")); c.classList.add("is-target"); });
  grid.addEventListener("drop", (e) => { const c = e.target.closest(".wcard"); if (!c || from < 0) return; e.preventDefault(); const to = +c.dataset.i; if (to !== from) { moveItem(data.works, from, to); render(); } from = -1; });
}

function moveItem(arr, from, to) {
  if (to < 0 || to >= arr.length || from === to) return;
  const [x] = arr.splice(from, 1); arr.splice(to, 0, x);
}

function newId(prefix = "w") { return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
function titleFromFile(name) { const t = name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim(); return t.charAt(0).toUpperCase() + t.slice(1); }

async function addWorksFromFiles(files) {
  const cat = workFilter !== "all" ? workFilter : data.categories[0]?.id || "";
  const items = [...files].map((file) => {
    const t = titleFromFile(file.name);
    const w = { id: newId(), category: cat, type: file.type.startsWith("video/") ? "video" : "image", ratio: "4/5", src: "", title: { ru: t, uz: t, en: t }, desc: { ru: "", uz: "", en: "" }, client: "", year: String(new Date().getFullYear()), published: true, _uploading: true };
    return { file, w };
  });
  data.works.unshift(...items.map((x) => x.w));
  render();
  for (const { file, w } of items) {
    pending++; changed();
    try {
      if (w.type === "image") await fillImageWork(w, file);
      else await fillVideoWork(w, file);
    } catch (err) {
      console.error(err);
      toast(`Не удалось загрузить «${file.name}»: ${err.message || err}`, "err");
      data.works = data.works.filter((x) => x !== w);
    } finally {
      delete w._uploading; pending--;
      if (tab === "works") render(); else changed();
    }
  }
  toast(`Готово: добавлено ${items.length} — не забудьте сохранить`, "ok");
}

async function fillImageWork(w, file) {
  const { width, height } = await imageSize(file);
  w.ratio = `${width}/${height}`;
  if (/gif|svg/.test(file.type)) { w.src = await upload(file, "works"); return; }
  w.src = await upload(await resizeImage(file, 1400, 0.86), "works", "webp");
  w.full = await upload(await resizeImage(file, 2560, 0.9), "works", "webp");
}

async function fillVideoWork(w, file) {
  if (sb && file.size > 50 * 1024 * 1024) throw new Error("файл больше 50 МБ — сожмите видео (H.264, 1080p) или добавьте его как ссылку YouTube/Vimeo");
  const { width, height, poster } = await videoInfo(file);
  w.ratio = `${width}/${height}`;
  if (poster) w.poster = await upload(poster, "posters", "webp");
  w.src = await upload(file, "works");
  w.preview = ""; delete w.previewFor; delete w.loop;
}

async function addEmbed() {
  const url = prompt("Ссылка на YouTube или Vimeo:");
  if (!url) return;
  const em = parseEmbed(url);
  if (!em) { toast("Не похоже на ссылку YouTube или Vimeo", "err"); return; }
  const w = { id: newId(), category: workFilter !== "all" ? workFilter : data.categories[0]?.id || "", type: "embed", src: url.trim(), poster: "", ratio: "16/9", title: { ru: "Новое видео", uz: "Yangi video", en: "New video" }, desc: {}, client: "", year: String(new Date().getFullYear()), published: true };
  data.works.unshift(w);
  render();
  openDrawer(0);
}

/* ——— Work drawer ——— */
function openDrawer(i) {
  drawerIndex = i;
  const d = $("[data-drawer]");
  d.hidden = false;
  renderDrawer();
  requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add("is-open")));
}
function closeDrawer() {
  const d = $("[data-drawer]");
  d.classList.remove("is-open");
  setTimeout(() => { if (!d.classList.contains("is-open")) { d.hidden = true; $("[data-drawer-body]").innerHTML = ""; } }, 420);
  drawerIndex = -1;
  if (tab === "works") render();
}

function renderDrawer() {
  const i = drawerIndex, w = data.works[i];
  if (!w) return;
  const p = `works.${i}`;
  $("[data-drawer-title]").textContent = tr(w.title, "ru") || "Работа";
  const ratioOpts = [["", "—"], ...[...new Set([w.ratio, ...RATIOS].filter(Boolean))].map((r) => [r, r === w.ratio && !RATIOS.includes(r) ? `${r} (оригинал)` : r])];
  let media = "";
  if (w.type === "image") {
    media = mediaBox("Изображение", `${p}.src`, "image/*", { note: "Загрузка автоматически сжимает фото и ставит правильные пропорции." });
  } else if (w.type === "video") {
    media = mediaBox("Видео", `${p}.src`, "video/*", { video: true, note: "MP4/WEBM до 50 МБ. Для длинных роликов лучше ссылка YouTube/Vimeo." }) +
            (w.src ? loopEditorHTML() : "") +
            mediaBox("Обложка видео", `${p}.poster`, "image/*", { extra: `<button class="btn btn--ghost btn--sm" data-act="frame">Взять кадр из видео</button>` });
  } else if (w.type === "embed") {
    media = F.text("Ссылка YouTube / Vimeo", `${p}.src`, { ph: "https://youtu.be/…", rr: "drawer" }) +
            mediaBox("Обложка (необязательно)", `${p}.poster`, "image/*", { note: "Для YouTube обложка подставится автоматически." });
  } else {
    media = `<p class="muted">Демо-карточка с градиентом. Выберите тип выше и загрузите настоящую работу.</p>`;
  }
  $("[data-drawer-body]").innerHTML = `
    <div class="seg" data-type>${Object.entries(TYPE_LABEL).map(([k, t]) => `<button class="${w.type === k ? "is-active" : ""}" data-type-v="${k}">${t}</button>`).join("")}</div>
    ${media}
    <div class="grid2">
      ${F.select("Категория", `${p}.category`, data.categories.map((c) => [c.id, tr(c.label, "ru")]))}
      ${F.select("Пропорции в галерее", `${p}.ratio`, ratioOpts)}
    </div>
    ${F.i18n("Название", `${p}.title`)}
    ${F.i18n("Описание", `${p}.desc`, { area: true })}
    <div class="grid2">${F.text("Клиент", `${p}.client`)}${F.text("Год", `${p}.year`)}</div>
    ${F.toggle("Показывать на сайте", `${p}.published`)}
    <div class="sens ${w.sensitive ? "is-on" : ""}">
      <label class="switch"><input type="checkbox" data-path="${p}.sensitive" data-rerender="drawer" ${w.sensitive ? "checked" : ""}><span>18+ / чувствительный контент</span></label>
      <small class="muted">На сайте превью будет размыто, а ролик откроется только после двух подтверждений: предупреждение о содержании и «мне 18+».</small>
      ${w.sensitive ? F.i18n("Текст предупреждения (необязательно)", `${p}.warn`, { area: true, rows: 2, hint: "Если оставить пустым — «3D-визуализация медицинской операции: кровь и анатомические подробности. Не для слабонервных»." }) : ""}
    </div>
    <div class="drawer__foot">
      <button class="btn btn--danger" data-act="del">Удалить работу</button>
      <div class="chips"><button class="btn btn--ghost" data-drawer-done>Закрыть</button><button class="btn btn--primary" data-drawer-save>Сохранить</button></div>
    </div>`;
  const body = $("[data-drawer-body]");
  if (w.type === "video" && w.src) mountLoopEditor(body, w);
  body.onclick = async (e) => {
    const tv = e.target.closest("[data-type-v]");
    if (tv) { w.type = tv.dataset.typeV; if (w.type !== "demo") w.src = w.type === "embed" && !parseEmbed(w.src || "") ? "" : w.src; changed(); renderDrawer(); return; }
    if (e.target.closest("[data-drawer-done]")) { closeDrawer(); return; }
    if (e.target.closest("[data-drawer-save]")) { await save(); if (!isDirty()) closeDrawer(); return; }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "del") { if (confirm("Удалить эту работу?")) { data.works.splice(i, 1); changed(); closeDrawer(); } return; }
    if (act === "frame") { await frameFromVideo(w); return; }
    const up = e.target.closest("[data-upload]");
    if (up) { await uploadInto(up.dataset.upload, up.dataset.accept, w); return; }
    const cl = e.target.closest("[data-clear]");
    if (cl) { set(cl.dataset.clear, ""); changed(); renderDrawer(); }
  };
}

/* ——— Редактор превью: какой отрезок ролика крутится в сетке ——— */
const LOOP_MIN = 1, LOOP_MAX = 12, LOOP_DEF = 5;
const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

function loopEditorHTML() {
  return `<div class="fld"><span>Превью в сетке — цикл</span>
    <div class="loopedit" data-loopedit>
      <div class="loopedit__stage"><video muted playsinline preload="auto"></video><span class="loopedit__badge">превью · цикл</span></div>
      <div class="loopedit__track" data-track>
        <canvas class="loopedit__film"></canvas>
        <div class="loopedit__dim loopedit__dim--l"></div><div class="loopedit__dim loopedit__dim--r"></div>
        <div class="loopedit__sel" data-drag="move"><i class="loopedit__h" data-drag="start"></i><i class="loopedit__h" data-drag="end"></i></div>
        <div class="loopedit__head"></div>
      </div>
      <div class="loopedit__row">
        <b class="loopedit__time" data-time>—</b>
        <div class="media__actions">
          <button class="btn btn--ghost btn--sm" data-loop="start" title="Начало отрезка — в текущий кадр">[ Начало здесь</button>
          <button class="btn btn--ghost btn--sm" data-loop="end" title="Конец отрезка — в текущий кадр">Конец здесь ]</button>
          <button class="btn btn--ghost btn--sm" data-loop="reset">Сбросить</button>
        </div>
      </div>
      <small class="muted">Перетащите рамку или её края — в сетке будет крутиться только этот кусок (${LOOP_MIN}–${LOOP_MAX} с). Клик по шкале вне рамки — посмотреть другой момент. При клике на сайте ролик играет целиком, со звуком.</small>
    </div></div>`;
}

function mountLoopEditor(root, w) {
  const box = $("[data-loopedit]", root); if (!box) return;
  const v = $("video", box), track = $("[data-track]", box), sel = $(".loopedit__sel", box);
  const head = $(".loopedit__head", box), film = $(".loopedit__film", box), timeEl = $("[data-time]", box);
  const dimL = $(".loopedit__dim--l", box), dimR = $(".loopedit__dim--r", box);
  let D = 0, scrub = null; // scrub — «посмотреть момент» вне отрезка
  v.src = mediaUrl(w.src);

  const seg = () => {
    const s = Math.max(0, Math.min(w.loop?.start ?? 0, Math.max(0, D - LOOP_MIN)));
    const e = Math.min(D, Math.max(w.loop?.end ?? s + LOOP_DEF, s + LOOP_MIN));
    return { s, e };
  };
  const paint = () => {
    if (!D) return;
    const { s, e } = seg(), pct = (t) => `${(t / D) * 100}%`;
    sel.style.left = pct(s); sel.style.width = `${((e - s) / D) * 100}%`;
    dimL.style.width = pct(s); dimR.style.left = pct(e);
    timeEl.textContent = `${fmtT(s)} — ${fmtT(e)} · ${(e - s).toFixed(1)} с`;
  };
  const commit = (s, e) => {
    s = Math.max(0, Math.round(s * 10) / 10); e = Math.min(D, Math.round(e * 10) / 10);
    w.loop = { start: s, end: e };
    changed(); paint();
  };
  const tick = () => {
    if (!box.isConnected) return;
    if (D) {
      const { s, e } = seg();
      if (scrub == null && (v.currentTime < s - 0.05 || v.currentTime >= e)) v.currentTime = s;
      head.style.left = `${(v.currentTime / D) * 100}%`;
    }
    requestAnimationFrame(tick);
  };
  let blobbed = false;
  v.addEventListener("loadedmetadata", async () => {
    const seekable = v.seekable.length && v.seekable.end(0) > 0.5;
    if (!seekable && !blobbed && /^https?:/.test(v.currentSrc)) {
      blobbed = true;
      try { const b = await (await fetch(v.currentSrc)).blob(); v.src = URL.createObjectURL(b); return; } catch { /* остаёмся как есть */ }
    }
    if (D) return;
    D = Math.round(v.duration * 10) / 10 || 0;
    paint(); v.currentTime = seg().s; v.play().catch(() => {});
    drawFilm();
  });
  requestAnimationFrame(tick);

  // раскадровка на шкале
  async function drawFilm() {
    const r = track.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    film.width = Math.round(r.width * dpr); film.height = Math.round(r.height * dpr);
    const ctx = film.getContext("2d"), fv = document.createElement("video");
    fv.muted = true; fv.preload = "auto"; fv.src = v.src;
    await new Promise((ok) => fv.addEventListener("loadeddata", ok, { once: true }));
    const fh = film.height, fw = fh * (fv.videoWidth / fv.videoHeight || 16 / 9), n = Math.ceil(film.width / fw);
    for (let k = 0; k < n && box.isConnected; k++) {
      fv.currentTime = Math.min(D - 0.05, ((k + 0.5) / n) * D);
      await new Promise((ok) => fv.addEventListener("seeked", ok, { once: true }));
      ctx.drawImage(fv, k * fw, 0, fw, fh);
    }
    fv.removeAttribute("src"); fv.load();
  }

  const tAt = (x) => { const r = track.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)) * D; };
  track.addEventListener("pointerdown", (ev) => {
    if (!D) return;
    ev.preventDefault();
    const mode = ev.target.dataset.drag;
    const { s: s0, e: e0 } = seg(), t0 = tAt(ev.clientX);
    if (!mode) { scrub = t0; v.currentTime = t0; }
    track.setPointerCapture(ev.pointerId);
    box.classList.add("is-dragging");
    const move = (m) => {
      const t = tAt(m.clientX);
      if (mode === "start") commit(Math.min(Math.max(t, e0 - LOOP_MAX), e0 - LOOP_MIN), e0);
      else if (mode === "end") commit(s0, Math.max(Math.min(t, s0 + LOOP_MAX), s0 + LOOP_MIN));
      else if (mode === "move") { const d = Math.max(-s0, Math.min(D - e0, t - t0)); commit(s0 + d, e0 + d); }
      else { scrub = t; v.currentTime = t; return; }
      v.currentTime = mode === "end" ? Math.max(seg().s, seg().e - 0.6) : seg().s;
    };
    const up = () => {
      track.removeEventListener("pointermove", move); box.classList.remove("is-dragging");
      if (scrub != null) setTimeout(() => { scrub = null; }, 900);
    };
    track.addEventListener("pointermove", move);
    track.addEventListener("pointerup", up, { once: true });
    track.addEventListener("pointercancel", up, { once: true });
  });
  box.addEventListener("click", (ev) => {
    const a = ev.target.closest("[data-loop]")?.dataset.loop; if (!a || !D) return;
    ev.stopPropagation();
    const now = scrub ?? v.currentTime, { s, e } = seg();
    if (a === "start") commit(Math.min(now, D - LOOP_MIN), Math.min(D, Math.max(e, now + LOOP_MIN), now + LOOP_MAX));
    if (a === "end") commit(Math.max(0, Math.min(s, now - LOOP_MIN), now - LOOP_MAX), Math.max(now, LOOP_MIN));
    if (a === "reset") { delete w.loop; changed(); paint(); }
    scrub = null; v.currentTime = seg().s;
  });
}

function mediaBox(label, path, accept, o = {}) {
  const v = get(path) || "";
  const isVid = o.video;
  const prev = v ? (isVid ? `<video src="${esc(mediaUrl(v))}" muted preload="metadata" controls></video>` : `<img src="${esc(mediaUrl(v))}" alt="">`) : "нет файла";
  return `<div class="fld"><span>${label}</span><div class="media">
    <div class="media__preview ${o.contain ? "media__preview--contain" : ""}">${prev}</div>
    <div class="stack" style="gap:10px">
      <div class="media__actions">
        <button class="btn btn--accent btn--sm" data-upload="${path}" data-accept="${accept}">${v ? "Заменить" : "Загрузить"} файл</button>
        ${v ? `<button class="btn btn--ghost btn--sm" data-clear="${path}">Убрать</button>` : ""}
        ${o.extra || ""}
      </div>
      <input type="url" data-path="${path}" value="${esc(v)}" placeholder="или вставьте ссылку https://…">
      ${o.note ? `<small class="muted">${o.note}</small>` : ""}
    </div></div></div>`;
}

async function uploadInto(path, accept, work) {
  const [file] = await pickFiles(accept, false);
  if (!file) return;
  pending++; changed();
  toast("Загружаем файл…");
  try {
    if (work && path.endsWith(".src")) {
      if (file.type.startsWith("video/")) await fillVideoWork(work, file);
      else { work.full = ""; await fillImageWork(work, file); }
    } else {
      const isImg = file.type.startsWith("image/") && !/gif|svg/.test(file.type);
      const max = path.includes("cover") ? 2880 : path.includes("poster") ? 1400 : 600;
      set(path, isImg ? await upload(await resizeImage(file, max, 0.88), "media", "webp") : await upload(file, "media"));
    }
    toast("Файл загружен", "ok");
  } catch (err) { toast(`Ошибка загрузки: ${err.message || err}`, "err"); }
  finally { pending--; changed(); drawerIndex >= 0 ? renderDrawer() : render(); }
}

async function frameFromVideo(w) {
  if (!w.src) return toast("Сначала загрузите видео", "err");
  pending++; changed();
  try {
    const { poster } = await videoInfo(mediaUrl(w.src));
    if (!poster) throw new Error("браузер не дал снять кадр (видео с другого домена?)");
    w.poster = await upload(poster, "posters", "webp");
    toast("Обложка обновлена", "ok");
  } catch (err) { toast(`Не получилось: ${err.message || err}`, "err"); }
  finally { pending--; changed(); renderDrawer(); }
}

/* ——— Hero ——— */
function heroPanel() {
  const c = data.settings.cover;
  const types = [["video", "Видео"], ["image", "Фото"], ["gradient", "Без медиа (заглушка)"]];
  return `
    <div class="card">
      <div class="card__head"><div><h3>Обложка</h3><p>Фон главного экрана. Видео MP4 (H.264) до 50 МБ, 10–20 секунд, без звука, зациклено. Пока видео нет — показывается строгая заглушка.</p></div></div>
      <div class="stack">
        <div class="seg">${types.map(([k, t]) => `<button class="${(c.type || "gradient") === k ? "is-active" : ""}" data-cover="${k}">${t}</button>`).join("")}</div>
        ${c.type === "image" ? mediaBox("Фото обложки", "settings.cover.url", "image/*") : ""}
        ${c.type === "video" ? mediaBox("Видео обложки", "settings.cover.url", "video/*", { video: true }) + mediaBox("Постер (пока видео грузится)", "settings.cover.poster", "image/*") : ""}
      </div>
    </div>
    <div class="card">
      <div class="card__head"><div><h3>Фирменные цвета</h3><p>A — акцент (Scarlet), B — светлые блоки и кнопки (Creme), C — фон (Black).</p></div></div>
      <div class="grid3">${F.color("Акцент", "settings.accentA")}${F.color("Светлый", "settings.accentB")}${F.color("Фон", "settings.accentC")}</div>
    </div>
    <div class="card">
      <div class="card__head"><div><h3>Статус в шапке</h3><p>Анимированная иконка над заголовком. «Авто» — работаю пн–сб 10:00–20:00 по Ташкенту, в остальное время отдыхаю.</p></div></div>
      ${F.select("Режим", "hero.mode", [["work", "Работаю — Online"], ["rest", "Отдыхаю — Offline"], ["auto", "Авто по времени"]])}
    </div>
    <div class="card">
      <div class="card__head"><div><h3>Тексты</h3></div></div>
      <div class="stack">
        ${F.i18n("Подзаголовок над заголовком", "hero.eyebrow")}
        ${F.i18n("Заголовок", "hero.title", { area: true, rows: 2, hint: "Enter — перенос строки на сайте." })}
        ${F.i18n("Слово с градиентом", "hero.highlight", { hint: "Одно или несколько слов из заголовка — они будут переливаться градиентом." })}
        ${F.i18n("Описание", "hero.subtitle", { area: true, rows: 2 })}
      </div>
    </div>`;
}

/* ——— About ——— */
function aboutPanel() {
  return `
    <div class="card"><div class="stack">
      ${F.i18n("Заголовок", "about.title")}
      ${F.i18n("Текст", "about.text", { area: true, rows: 4 })}
    </div></div>
    <div class="card">
      <div class="card__head"><div><h3>Цифры</h3><p>Карточки со статистикой.</p></div><button class="btn btn--ghost btn--sm" data-add="stats">+ Добавить</button></div>
      <div class="rows">${data.stats.map((s, i) => `
        <div class="row" style="grid-template-columns:1fr auto">
          <div class="grid2" style="grid-template-columns:140px 1fr">${F.text("Число", `stats.${i}.value`)}${F.i18n("Подпись", `stats.${i}.label`)}</div>
          <div class="row__ops"><button class="icon-btn" data-up="stats:${i}">↑</button><button class="icon-btn" data-down="stats:${i}">↓</button><button class="icon-btn" data-del="stats:${i}">✕</button></div>
        </div>`).join("")}</div>
    </div>`;
}

/* ——— Skills ——— */
function skillsPanel() {
  return `
    <div class="toolbar" style="margin-top:0"><p class="muted" style="margin:0">Если не загружать иконку, рисуется фирменная плашка с буквами и вашими цветами.</p><button class="btn btn--primary btn--sm" data-add="skills">+ Добавить софт</button></div>
    <div class="rows">${data.skills.map((s, i) => {
      const p = `skills.${i}`;
      return `<div class="row">
        <div class="stack" style="gap:8px;justify-items:center">
          <div class="sk-icon" style="background:${esc(s.bg || "#111")};color:${esc(s.fg || "#fff")}">${s.icon ? `<img src="${esc(s.icon)}" alt="">` : esc(s.mono || "")}</div>
          <button class="btn btn--ghost btn--sm" data-upload="${p}.icon" data-accept="image/*">Иконка</button>
          ${s.icon ? `<button class="btn btn--ghost btn--sm" data-clear="${p}.icon">Убрать</button>` : ""}
        </div>
        <div class="stack">
          <div class="grid2">${F.text("Название", `${p}.name`)}${F.text("Буквы на плашке", `${p}.mono`, { rr: "panel" })}</div>
          <div class="grid3">${F.color("Фон плашки", `${p}.bg`)}${F.color("Цвет букв", `${p}.fg`)}
            <label class="fld"><span>Градиент букв</span><input type="text" data-path="${p}.grad" data-kind="list" value="${esc((s.grad || []).join(", "))}" placeholder="#hex, #hex"><small>Необязательно</small></label></div>
          ${F.i18n("Описание", `${p}.desc`)}
        </div>
        <div class="row__ops"><button class="icon-btn" data-up="skills:${i}">↑</button><button class="icon-btn" data-down="skills:${i}">↓</button><button class="icon-btn" data-del="skills:${i}">✕</button></div>
      </div>`;
    }).join("")}</div>`;
}

/* ——— Roles ——— */
function rolesPanel() {
  return `
    <div class="toolbar" style="margin-top:0"><p class="muted" style="margin:0">Каждая роль — колонка пайплайна. Оптимально 3–5 ролей и 4–5 задач в каждой.</p><button class="btn btn--primary btn--sm" data-add="roles">+ Добавить роль</button></div>
    <div class="rows">${data.roles.map((r, i) => {
      const p = `roles.${i}`;
      r.tasks ||= [];
      return `<div class="row">
        <div class="sk-icon" style="background:#000;color:var(--b)">${esc(r.mono || "")}</div>
        <div class="stack">
          <div class="grid2">${F.text("Буквы на плашке", `${p}.mono`, { rr: "panel" })}<div></div></div>
          ${F.i18n("Позиция", `${p}.title`)}
          <div class="fld"><span>Задачи</span><div class="stack" style="gap:10px">${r.tasks.map((_, j) => `
            <div class="task-row">${F.i18n(`Задача ${j + 1}`, `${p}.tasks.${j}`)}
              <div class="row__ops"><button class="icon-btn" data-up="${p}.tasks:${j}">↑</button><button class="icon-btn" data-down="${p}.tasks:${j}">↓</button><button class="icon-btn" data-del="${p}.tasks:${j}">✕</button></div></div>`).join("")}
            <button class="btn btn--ghost btn--sm" data-add="${p}.tasks" style="justify-self:start">+ Задача</button>
          </div></div>
        </div>
        <div class="row__ops"><button class="icon-btn" data-up="roles:${i}">↑</button><button class="icon-btn" data-down="roles:${i}">↓</button><button class="icon-btn" data-del="roles:${i}">✕</button></div>
      </div>`;
    }).join("")}</div>`;
}

/* ——— Clients ——— */
function clientsPanel() {
  return `
    <div class="card"><div class="grid2">
      ${F.text("Число на сайте", "settings.clientsCount", { ph: "150+", hint: "Крупная цифра над лентой логотипов." })}
      <div class="fld"><span>Логотипы</span><button class="btn btn--accent" data-act="logos">Загрузить логотипы (можно много сразу)</button><small>PNG/SVG с прозрачным фоном. Название берётся из имени файла.</small></div>
    </div></div>
    <div class="toolbar"><p class="muted" style="margin:0">${data.clients.length} в ленте · клик по логотипу — заменить</p>
      <div class="chips"><button class="btn btn--ghost btn--sm" data-add="clients">+ Текстовый логотип</button>${data.clients.length ? `<button class="btn btn--ghost btn--sm" data-act="clear-clients">Очистить все</button>` : ""}</div></div>
    <div class="lgrid">${data.clients.map((c, i) => `
      <div class="lcard">
        <div class="lcard__logo" data-upload="clients.${i}.logo" data-accept="image/*" title="Заменить логотип">${c.logo ? `<img src="${esc(c.logo)}" alt="">` : esc(c.name || "Logo")}</div>
        <div class="lcard__ops"><input type="text" data-path="clients.${i}.name" value="${esc(c.name || "")}" placeholder="Название"><button class="icon-btn" data-up="clients:${i}" title="Раньше">←</button><button class="icon-btn" data-del="clients:${i}" title="Удалить">✕</button></div>
      </div>`).join("")}</div>`;
}

async function addLogos() {
  const files = await pickFiles("image/*", true);
  if (!files.length) return;
  pending++; changed(); toast(`Загружаем ${files.length} логотип(ов)…`);
  let ok = 0;
  for (const f of files) {
    try {
      const url = /svg/.test(f.type) ? await upload(f, "logos") : await upload(await resizeImage(f, 480, 0.9, true), "logos", "webp");
      data.clients.push({ name: titleFromFile(f.name), logo: url }); ok++;
    } catch (err) { toast(`«${f.name}»: ${err.message || err}`, "err"); }
  }
  pending--; render(); toast(`Добавлено логотипов: ${ok}`, "ok");
}

/* ——— Categories ——— */
function categoriesPanel() {
  return `
    <div class="toolbar" style="margin-top:0"><p class="muted" style="margin:0">ID — латиницей, без пробелов. Пустые категории на сайте не показываются.</p><button class="btn btn--primary btn--sm" data-add="categories">+ Категория</button></div>
    <div class="rows">${data.categories.map((c, i) => `
      <div class="row" style="grid-template-columns:1fr auto">
        <div class="grid2" style="grid-template-columns:160px 1fr">${F.text("ID", `categories.${i}.id`)}${F.i18n("Название", `categories.${i}.label`)}</div>
        <div class="row__ops"><button class="icon-btn" data-up="categories:${i}">↑</button><button class="icon-btn" data-down="categories:${i}">↓</button><button class="icon-btn" data-del="categories:${i}">✕</button></div>
      </div>`).join("")}</div>`;
}

/* ——— Contacts ——— */
function contactsPanel() {
  const cv = data.settings.cv || "";
  const cvHref = /^(https?:|data:|blob:)/.test(cv) ? cv : SITE + cv;
  return `<div class="card"><div class="card__head"><div><h3>CV (резюме)</h3><p>Кнопки «Скачать CV» в шапке, в меню и в контактах. Пустое поле — кнопки скрыты.</p></div></div>
    <div class="stack">
      <div class="media__actions">
        <button class="btn btn--accent btn--sm" data-upload="settings.cv" data-accept="application/pdf">${cv ? "Заменить" : "Загрузить"} PDF</button>
        ${cv ? `<a class="btn btn--ghost btn--sm" href="${esc(cvHref)}" target="_blank" rel="noopener">Открыть текущий ↗</a><button class="btn btn--ghost btn--sm" data-clear="settings.cv">Убрать</button>` : ""}
      </div>
      <input type="url" data-path="settings.cv" value="${esc(cv)}" placeholder="ссылка на PDF">
    </div></div>
  <div class="card"><div class="grid2">
    ${F.text("Telegram", "contacts.telegram", { ph: "username или https://t.me/username" })}
    ${F.text("Instagram", "contacts.instagram", { ph: "username" })}
    ${F.text("Телефон", "contacts.phone", { ph: "+998 90 123 45 67" })}
    ${F.text("Email", "contacts.email", { ph: "hello@voskresenskiydesign.com" })}
  </div><p class="muted" style="margin:14px 0 0;font-size:12.5px">Пустое поле — иконка не показывается.</p></div>`;
}

/* ——— Settings ——— */
function settingsPanel() {
  return `
    <div class="card"><div class="grid3">
      ${F.text("Имя бренда", "settings.brand")}${F.text("Приписка", "settings.brandSuffix")}
      ${F.select("Язык по умолчанию", "settings.defaultLang", [["ru", "Русский"], ["uz", "Oʻzbekcha"], ["en", "English"]])}
    </div></div>
    <div class="card"><div class="card__head"><div><h3>SEO</h3><p>Как сайт выглядит в Google и в превью ссылок.</p></div></div><div class="stack">
      ${F.i18n("Заголовок страницы", "settings.seo.title")}
      ${F.i18n("Описание", "settings.seo.description", { area: true, rows: 2 })}
    </div></div>
    <div class="card"><div class="card__head"><div><h3>Резервная копия</h3><p>Скачайте весь контент одним файлом или восстановите из файла.</p></div></div>
      <div class="chips">
        <button class="btn btn--ghost" data-act="export">Скачать JSON</button>
        <button class="btn btn--ghost" data-act="import">Загрузить JSON</button>
        ${sb ? "" : `<button class="btn btn--danger" data-act="reset">Сбросить демо-черновик</button>`}
      </div>
    </div>`;
}

/* ——— shared panel bindings ——— */
const NEW = {
  stats: () => ({ value: "10+", label: { ru: "", uz: "", en: "" } }),
  skills: () => ({ id: newId("s"), name: "Новый софт", mono: "Nw", bg: "#15151c", fg: "#9f8bff", icon: "", desc: { ru: "", uz: "", en: "" } }),
  clients: () => ({ name: "Brand", logo: "" }),
  roles: () => ({ id: newId("r"), mono: "Nw", title: { ru: "Новая роль", uz: "Yangi rol", en: "New role" }, tasks: [] }),
  tasks: () => ({ ru: "", uz: "", en: "" }),
  categories: () => ({ id: `cat${data.categories.length + 1}`, label: { ru: "Новая", uz: "Yangi", en: "New" } }),
};

function bindPanel(panel) {
  if (tab === "works") bindWorks(panel);
}

// one delegated listener for the panel, registered once in start()
async function panelClick(e) {
  if (tab === "works") return worksClick(e);
  {
    const t = e.target;
    const list = (k) => { if (!get(k)) set(k, []); return get(k); }; // «roles» или вложенное «roles.0.tasks»
    const add = t.closest("[data-add]"); if (add) { const k = add.dataset.add; list(k).push(NEW[k.split(".").pop()]()); render(); return; }
    const up = t.closest("[data-up]"); if (up) { const [k, i] = up.dataset.up.split(":"); moveItem(list(k), +i, +i - 1); render(); return; }
    const dn = t.closest("[data-down]"); if (dn) { const [k, i] = dn.dataset.down.split(":"); moveItem(list(k), +i, +i + 1); render(); return; }
    const del = t.closest("[data-del]");
    if (del) {
      const [k, i] = del.dataset.del.split(":");
      if (k === "categories") { const id = data.categories[+i].id; const used = data.works.filter((w) => w.category === id).length; if (used && !confirm(`В категории ${used} работ(ы). Удалить категорию? Работы останутся без категории.`)) return; }
      list(k).splice(+i, 1); render(); return;
    }
    const cov = t.closest("[data-cover]"); if (cov) { data.settings.cover.type = cov.dataset.cover; render(); return; }
    const upl = t.closest("[data-upload]"); if (upl) { await uploadInto(upl.dataset.upload, upl.dataset.accept); return; }
    const cl = t.closest("[data-clear]"); if (cl) { set(cl.dataset.clear, ""); render(); return; }
    const act = t.closest("[data-act]")?.dataset.act;
    if (act === "logos") addLogos();
    if (act === "clear-clients" && confirm("Удалить все логотипы из ленты?")) { data.clients = []; render(); }
    if (act === "export") download(`voskresenskiy-content-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(clean(data), null, 2));
    if (act === "import") importJSON();
    if (act === "reset" && confirm("Удалить демо-черновик из браузера и вернуть исходный контент?")) { try { localStorage.removeItem(DEMO_KEY); } catch {} savedJSON = JSON.stringify(data); location.reload(); }
  }
}

/* =========================================================
   Save / import / export
   ========================================================= */
function clean(d) { return JSON.parse(JSON.stringify(d, (k, v) => (k.startsWith("_") ? undefined : v))); }

async function save() {
  if (pending > 0) { toast("Дождитесь окончания загрузки файлов", "err"); return; }
  if (!isDirty()) return;
  const btn = $("[data-save]");
  btn.disabled = true;
  const payload = clean(data);
  try {
    if (sb) {
      const { error } = await sb.from("content").upsert({ id: cfg.contentId || "main", data: payload, updated_at: new Date().toISOString() });
      if (error) throw error;
      toast("Сохранено — сайт уже обновился", "ok");
    } else {
      localStorage.setItem(DEMO_KEY, JSON.stringify(payload));
      toast("Сохранено в демо-черновик этого браузера", "ok");
    }
    savedJSON = JSON.stringify(data);
  } catch (err) {
    console.error(err);
    const quota = String(err?.name).includes("Quota");
    toast(quota ? "В демо-режиме закончилось место браузера. Подключите Supabase, чтобы хранить файлы." : `Не сохранилось: ${err.message || err}`, "err");
  }
  changed();
}

async function importJSON() {
  const [f] = await pickFiles("application/json,.json", false);
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d.settings || !Array.isArray(d.works)) throw new Error("это не файл контента сайта");
    data = normalize(d); render(); toast("Контент загружен из файла — проверьте и сохраните", "ok");
  } catch (err) { toast(`Не удалось прочитать файл: ${err.message}`, "err"); }
}

function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* =========================================================
   Files: pick, process, upload
   ========================================================= */
function pickFiles(accept, multiple) {
  return new Promise((resolve) => {
    const inp = $("[data-file]");
    inp.value = ""; inp.accept = accept; inp.multiple = multiple;
    inp.onchange = () => resolve([...inp.files]);
    inp.click();
  });
}

function slug(name) { return name.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "file"; }

async function upload(blob, folder, ext) {
  const name = blob.name || `file.${ext || (blob.type.split("/")[1] || "bin")}`;
  const e = ext || name.split(".").pop().toLowerCase();
  if (sb) {
    const path = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}-${slug(name)}.${e}`;
    const { error } = await sb.storage.from(cfg.storageBucket || "media").upload(path, blob, { cacheControl: "31536000", contentType: blob.type || undefined, upsert: false });
    if (error) throw error;
    return sb.storage.from(cfg.storageBucket || "media").getPublicUrl(path).data.publicUrl;
  }
  // демо-режим: маленькие файлы — в data URL, большие — временная ссылка до перезагрузки
  if (blob.size < 1.5 * 1024 * 1024 && blob.type.startsWith("image/")) return blobToDataURL(blob);
  toast("Демо-режим: большой файл виден только до перезагрузки страницы", "err");
  return URL.createObjectURL(blob);
}

function blobToDataURL(blob) { return new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fail; r.readAsDataURL(blob); }); }

async function imageSize(file) {
  try { const b = await createImageBitmap(file); const s = { width: b.width, height: b.height }; b.close?.(); return s; }
  catch { return new Promise((ok) => { const img = new Image(); img.onload = () => ok({ width: img.naturalWidth || 4, height: img.naturalHeight || 5 }); img.onerror = () => ok({ width: 4, height: 5 }); img.src = URL.createObjectURL(file); }); }
}

async function resizeImage(file, maxSide, quality, keepAlpha = true) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!keepAlpha) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h); }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((ok) => canvas.toBlob(ok, "image/webp", quality));
  if (!blob) return file;
  return blob.size < file.size || k < 1 ? blob : file;
}

function videoInfo(src) {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous";
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    let done = false;
    const finish = (r) => { if (done) return; done = true; if (typeof src !== "string") URL.revokeObjectURL(url); resolve(r); };
    v.onloadedmetadata = () => { v.currentTime = Math.min(0.8, (v.duration || 1) * 0.15); };
    v.onseeked = () => {
      const width = v.videoWidth || 16, height = v.videoHeight || 9;
      try {
        const k = Math.min(1, 1400 / Math.max(width, height));
        const c = document.createElement("canvas"); c.width = Math.round(width * k); c.height = Math.round(height * k);
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((poster) => finish({ width, height, poster }), "image/webp", 0.85);
      } catch { finish({ width, height, poster: null }); }
    };
    v.onerror = () => { if (!done) { done = true; reject(new Error("видео не читается этим браузером")); } };
    setTimeout(() => finish({ width: v.videoWidth || 16, height: v.videoHeight || 9, poster: null }), 15000);
    v.src = url;
  });
}

/* =========================================================
   Toasts
   ========================================================= */
function toast(msg, kind = "") {
  const box = $("[data-toasts]");
  const el = document.createElement("div");
  el.className = `toast ${kind ? `toast--${kind}` : ""}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.classList.add("is-out"); setTimeout(() => el.remove(), 320); }, kind === "err" ? 6000 : 3200);
}
