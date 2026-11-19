/*
  Подключение к Supabase (бесплатная база + хранилище файлов для админки).
  Заполните после создания проекта на supabase.com — см. DEPLOY.md.
  Оба значения публичные (anon key защищён правилами RLS), их можно хранить в коде.

  Пока поля пустые, сайт работает в демо-режиме: контент берётся из content/site.json,
  а админка сохраняет изменения только в этом браузере (для предпросмотра).
*/
window.VD_CONFIG = {
  supabaseUrl: "https://ntlctwfuleeffkpkrash.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bGN0d2Z1bGVlZmZrcGtyYXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5OTI5NjAsImV4cCI6MjExMDU2ODk2MH0.rDN9KQ8uV99kUNxqy_Xwj6KGwRPpWjTWNLsPhssDMMs",
  storageBucket: "media",
  contentId: "main",
  siteUrl: "https://voskresenskiydesign.com"             // адрес основного сайта — заполняется только в сборке админки на отдельном домене
};
