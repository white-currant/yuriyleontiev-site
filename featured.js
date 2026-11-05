// Релиз на первом экране — закреплён вручную, не берётся «самый новый» из releases.js.
// Так другие релизы (например, вышедший раньше сингл) спокойно уходят в списки, а здесь остаётся этот.
//
// Пока links пустой — «Скоро» и отсчёт до date, без кнопки «Слушать»; с ссылками — «Новый релиз» и шторка со стримингами.
// Когда скрипт обновления добавит его в releases.js (совпадение по title), ссылки и дата возьмутся оттуда,
// а обложка останется эта — она крупнее, чем 640px из Apple Music.
// Сменить релиз на главной — поменять этот файл и картинку в covers/.
window.FEATURED = {
  title: "Workshop 47, Vol. 3",
  sub: "Original Series Soundtrack",
  cover: "covers/workshop-47-vol-3.jpg",
  date: "2026-11-06", // дата выхода — пока релиз не вышел, стоит над обложкой вместо «Скоро»
  year: "2026",
  // ссылки, которых нет (или ещё нет) в releases.js; когда альбом найдёт скрипт обновления,
  // его ссылки встанут первыми, а отсюда добавятся только сервисы, которых там нет
  links: [
    { name: "Spotify", url: "https://open.spotify.com/album/4epchM1hB0r7LQvyzT4IUD" },
    { name: "Apple Music", url: "https://geo.music.apple.com/album/6830542805" }, // geo — открывает магазин страны слушателя
    { name: "YouTube Music", url: "https://music.youtube.com/search?q=Yuriy%20Leontiev%20Workshop%2047%2C%20Vol.%203" },
    { name: "YouTube", url: "https://www.youtube.com/watch?v=zf96bI-HJZg&list=PL4fdtXKg_aGe9d036xPAcmlBCRUBDK1IT&index=9&t=2802s" }
  ]
};
