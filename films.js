// Фильмы и сериалы с моей музыкой. Раздел «На экране» появляется, когда здесь есть хотя бы одна запись.
// Постеры лежат в posters/ (JPG, соотношение 2:3). Для логотипа вместо постера — поле fit: "contain".
// titleRu/roleRu — необязательные варианты подписи для русского языка; без них берётся title/role на обоих языках.
window.FILMS = [
  {
    title: "A Ballad of Cold Hearts",
    year: "2026",
    role: "Original Film Score",
    poster: "posters/a-ballad-of-cold-hearts.jpg",
    url: "https://www.imdb.com/title/tt40479470/",
  },
  {
    title: "The Altitude Limit",
    titleRu: "Предел высоты",
    year: "2025",
    role: "Climbing Everest",
    roleRu: "Восхождение на Эверест",
    poster: "posters/the-altitude-limit.jpg",
    url: "https://www.imdb.com/title/tt39158705/",
  },
  {
    title: "Workshop 47",
    titleRu: "Мастерская 47",
    year: "2025",
    role: "Original Series Score",
    poster: "posters/workshop-47-ep1.jpg",
    wide: true, // горизонтальный кадр 16:9 — карточка на две колонки, без леттербоксинга
    url: "https://lololoshka.fandom.com/ru/wiki/Мастерская_47",
  },
];
