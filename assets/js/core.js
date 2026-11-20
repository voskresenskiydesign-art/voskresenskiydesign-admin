// Общие функции для сайта и админки: загрузка контента, языки, иконки.

export const LANGS = ["uz", "ru", "en"];
export const LANG_LABELS = { uz: "UZ", ru: "RU", en: "EN" };
export const DEMO_KEY = "vd-demo-content";

const cfg = () => window.VD_CONFIG || {};
export const hasBackend = () => Boolean(cfg().supabaseUrl && cfg().supabaseAnonKey);

/** Загружает контент: Supabase → (демо) черновик из localStorage → content/site.json */
export async function loadContent(base = "") {
  const c = cfg();
  if (hasBackend()) {
    try {
      const res = await fetch(
        `${c.supabaseUrl}/rest/v1/content?id=eq.${encodeURIComponent(c.contentId || "main")}&select=data`,
        { headers: { apikey: c.supabaseAnonKey, Authorization: `Bearer ${c.supabaseAnonKey}` }, cache: "no-store" }
      );
      if (res.ok) {
        const rows = await res.json();
        if (rows[0]?.data?.settings) return rows[0].data;
      }
    } catch (e) {
      console.warn("Supabase недоступен, используем site.json", e);
    }
  } else {
    try {
      const draft = localStorage.getItem(DEMO_KEY);
      if (draft) return JSON.parse(draft);
    } catch { /* приватный режим — просто идём дальше */ }
  }
  const res = await fetch(`${base}content/site.json`, { cache: "no-cache" });
  return res.json();
}

/** Достаёт строку нужного языка из объекта {ru,uz,en} с откатом на другие языки */
export function tr(value, lang) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value[lang] || value.ru || value.en || value.uz || "";
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

/** Нормализует контакты в ссылки */
export function contactLinks(contacts = {}) {
  const tg = (contacts.telegram || "").trim().replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
  const ig = (contacts.instagram || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "");
  const phone = (contacts.phone || "").trim();
  const email = (contacts.email || "").trim();
  return {
    telegram: tg ? { href: `https://t.me/${tg}`, label: `@${tg}` } : null,
    instagram: ig ? { href: `https://instagram.com/${ig}`, label: `@${ig}` } : null,
    phone: phone ? { href: `tel:${phone.replace(/[^\d+]/g, "")}`, label: phone } : null,
    email: email ? { href: `mailto:${email}`, label: email } : null,
  };
}

/** YouTube / Vimeo → id и ссылки для встраивания */
export function parseEmbed(url = "") {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return { kind: "youtube", id: yt[1], embed: `https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&rel=0`, thumb: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` };
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { kind: "vimeo", id: vm[1], embed: `https://player.vimeo.com/video/${vm[1]}?autoplay=1&dnt=1`, thumb: "" };
  return null;
}

const S = (body) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`;
/* ——— Иконки: собственная линейка, единая толщина 1.7, сетка 24 ——— */
const I = (body, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const icons = {
  telegram: S('<path d="M21.6 3.4c.8-.3 1.6.4 1.4 1.3l-3.3 15.6c-.2 1-1 1.4-1.9.9l-5-3.7-2.4 2.3c-.3.3-.6.5-1 .5l.4-5 9-8.2c.4-.4-.1-.6-.6-.2L7.1 13.9 2.3 12.4c-1-.3-1-1 .2-1.5L21.6 3.4Z"/>'),
  instagram: S('<path fill-rule="evenodd" d="M8 2.5h8A5.5 5.5 0 0 1 21.5 8v8a5.5 5.5 0 0 1-5.5 5.5H8A5.5 5.5 0 0 1 2.5 16V8A5.5 5.5 0 0 1 8 2.5Zm4 4.8a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4Zm0 2.1a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2Zm5.3-4a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"/>'),
  phone: S('<path d="M6.6 2.8h2.2c.6 0 1.1.4 1.3 1l1 3.9c.1.5 0 1-.4 1.4l-1.6 1.5a12.4 12.4 0 0 0 4.3 4.3l1.5-1.6c.4-.4.9-.5 1.4-.4l3.9 1c.6.2 1 .7 1 1.3v2.2c0 1.4-1.2 2.6-2.6 2.5C10.2 19.5 4.5 13.8 4.1 5.4 4 4 5.2 2.8 6.6 2.8Z"/>'),
  mail: S('<path d="M5 4.5h14A3 3 0 0 1 22 7.5v.3l-9.2 5.9c-.5.3-1.1.3-1.6 0L2 7.8v-.3a3 3 0 0 1 3-3Z"/><path d="M2 10.2v6.3a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-6.3l-8.1 5.2c-1.2.7-2.6.7-3.8 0L2 10.2Z"/>'),
  get email() { return this.mail; },
  download: I('<path d="M12 4v11"/><path d="m7 10.5 5 5 5-5"/><path d="M5 20h14"/>'),
  arrow: I('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
  arrowUpRight: I('<path d="M7 17 17 7"/><path d="M8 7h9v9"/>'),
  close: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  left: I('<path d="m15 5-7 7 7 7"/>'),
  right: I('<path d="m9 5 7 7-7 7"/>'),
  menu: I('<path d="M4 8h16M4 16h16"/>'),
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.6v12.8c0 .8.9 1.3 1.6.8l9.6-6.4c.6-.4.6-1.2 0-1.6L9.6 4.8C8.9 4.3 8 4.8 8 5.6Z" fill="currentColor"/></svg>',
  globe: I('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5s1.2-6.1 3.6-8.5Z"/>'),
  sparkle: I('<path d="M12 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5Z"/><path d="M18.5 15.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5Z"/>'),
};

/* ——— Строки интерфейса на трёх языках ——— */
export const UI = {
  "nav.works": { ru: "Работы", uz: "Ishlar", en: "Work" },
  "nav.about": { ru: "Обо мне", uz: "Men haqimda", en: "About" },
  "nav.roles": { ru: "Роли", uz: "Rollar", en: "Roles" },
  "roles.kicker": { ru: "Направления", uz: "Yo‘nalishlar", en: "Disciplines" },
  "roles.title": { ru: "Роли в команде", uz: "Jamoadagi rollar", en: "Roles in a team" },
  "roles.lead": { ru: "Позиции в digital, которые я закрываю, и задачи, за которые отвечаю на каждой из них.", uz: "Digital sohasida egallay oladigan lavozimlarim va har birida javob beradigan vazifalarim.", en: "Digital positions I take on and the tasks I own in each of them." },
  "roles.hub": { ru: "Digital · Motion · 3D · AI", uz: "Digital · Motion · 3D · AI", en: "Digital · Motion · 3D · AI" },
  "nav.skills": { ru: "Софт", uz: "Dasturlar", en: "Tools" },
  "nav.clients": { ru: "Клиенты", uz: "Mijozlar", en: "Clients" },
  "nav.contact": { ru: "Контакты", uz: "Aloqa", en: "Contact" },
  "cta.talk": { ru: "Связаться", uz: "Bog'lanish", en: "Contact" },
  "status.work": { ru: "Работаю — на связи", uz: "Ishlayapman — aloqadaman", en: "Working — available" },
  "status.rest": { ru: "Отдыхаю — отвечу позже", uz: "Dam olyapman — keyinroq javob beraman", en: "Resting — will reply later" },
  "cta.cv": { ru: "Скачать CV", uz: "CV yuklab olish", en: "Download CV" },
  "cta.works": { ru: "Работы", uz: "Ishlar", en: "Work" },
  "works.title": { ru: "Работы", uz: "Ishlar", en: "Work" },
  "works.lead": { ru: "Реклама, продуктовый CGI, айдентика и AI-визуал.", uz: "Reklama, mahsulot CGI, aydentika va AI-vizual.", en: "Commercials, product CGI, identity and AI visuals." },
  "works.all": { ru: "Все", uz: "Barchasi", en: "All" },
  "works.empty": { ru: "В этой категории пока нет работ", uz: "Bu toifada hozircha ishlar yo'q", en: "Nothing in this category yet" },
  "works.more": { ru: "Показать ещё", uz: "Yana ko'rsatish", en: "Show more" },
  "skills.kicker": { ru: "Стек", uz: "Stek", en: "Stack" },
  "skills.title": { ru: "Рабочие инструменты", uz: "Ish asboblari", en: "Working tools" },
  "skills.lead": { ru: "Классический продакшен и генеративные AI-инструменты.", uz: "Klassik prodakshn va generativ AI-asboblar.", en: "Classic production and generative AI tools." },
  "clients.kicker": { ru: "Клиенты", uz: "Mijozlar", en: "Clients" },
  "clients.title": { ru: "компаний-клиентов", uz: "mijoz kompaniya", en: "client companies" },
  "contact.kicker": { ru: "Контакты", uz: "Aloqa", en: "Contact" },
  "contact.title": { ru: "Обсудим проект", uz: "Loyihani muhokama qilamiz", en: "Let's discuss your project" },
  "contact.lead": { ru: "Опишите задачу и сроки — отвечу в течение рабочего дня.", uz: "Vazifa va muddatlarni yozing — ish kuni davomida javob beraman.", en: "Describe the task and timeline — I reply within one business day." },
  "contact.telegram": { ru: "Telegram", uz: "Telegram", en: "Telegram" },
  "contact.instagram": { ru: "Instagram", uz: "Instagram", en: "Instagram" },
  "contact.phone": { ru: "Позвонить", uz: "Qo'ng'iroq", en: "Call" },
  "contact.email": { ru: "Почта", uz: "Pochta", en: "Email" },
  "lb.client": { ru: "Клиент", uz: "Mijoz", en: "Client" },
  "lb.year": { ru: "Год", uz: "Yil", en: "Year" },
  "lb.category": { ru: "Категория", uz: "Toifa", en: "Category" },
  "adult.badge": { ru: "Чувствительный контент", uz: "Nozik kontent", en: "Sensitive content" },
  "adult.show": { ru: "Показать", uz: "Ko‘rsatish", en: "Show" },
  "adult.t1": { ru: "Внимание", uz: "Diqqat", en: "Content warning" },
  "adult.d1": { ru: "3D-визуализация медицинской операции: кровь и анатомические подробности. Не для слабонервных.", uz: "Tibbiy operatsiyaning 3D-vizualizatsiyasi: qon va anatomik tafsilotlar. Ta’sirchan odamlar uchun emas.", en: "3D visualization of a medical procedure with blood and anatomical detail. Not for the faint-hearted." },
  "adult.next": { ru: "Продолжить", uz: "Davom etish", en: "Continue" },
  "adult.back": { ru: "Не смотреть", uz: "Ko‘rmaslik", en: "Go back" },
  "adult.t2": { ru: "Только для 18+", uz: "Faqat 18+ uchun", en: "18+ only" },
  "adult.d2": { ru: "Подтверждая, вы заявляете, что вам исполнилось 18 лет и вы смотрите этот материал по собственному решению и под свою ответственность.", uz: "Tasdiqlash orqali siz 18 yoshga to‘lganingizni va ushbu materialni o‘z qaroringiz hamda mas’uliyatingiz bilan ko‘rayotganingizni bildirasiz.", en: "By confirming, you state that you are 18 or older and choose to view this material at your own discretion and responsibility." },
  "adult.ok": { ru: "Мне 18+, показать", uz: "Menga 18+, ko‘rsatish", en: "I’m 18+, show it" },
  "lb.close": { ru: "Закрыть", uz: "Yopish", en: "Close" },
  "footer.rights": { ru: "Все права защищены", uz: "Barcha huquqlar himoyalangan", en: "All rights reserved" },
  "footer.top": { ru: "Наверх", uz: "Yuqoriga", en: "Back to top" },
  "menu": { ru: "Меню", uz: "Menyu", en: "Menu" },
};
