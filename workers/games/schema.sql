CREATE TABLE IF NOT EXISTS g_rounds (id TEXT PRIMARY KEY, user INTEGER NOT NULL, track TEXT NOT NULL,
  options TEXT NOT NULL, started INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS g_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user INTEGER NOT NULL, name TEXT,
  delta INTEGER NOT NULL, reason TEXT, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS g_users (user INTEGER PRIMARY KEY, name TEXT, day TEXT, scored INTEGER DEFAULT 0,
  earned_today INTEGER DEFAULT 0, streak INTEGER DEFAULT 0, best_streak INTEGER DEFAULT 0,
  played INTEGER DEFAULT 0, correct INTEGER DEFAULT 0, recent TEXT DEFAULT '[]');
CREATE TABLE IF NOT EXISTS g_profiles (user INTEGER PRIMARY KEY, name TEXT, points INTEGER, karma INTEGER,
  title TEXT, next INTEGER, place INTEGER, updated INTEGER, avatar TEXT);
CREATE TABLE IF NOT EXISTS g_meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS g_links (user INTEGER PRIMARY KEY, code TEXT, expires INTEGER, title TEXT, state TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS g_avatars (key TEXT PRIMARY KEY, data BLOB NOT NULL);
-- метка игрока для профиля в «Звёздном зале»: наружу уходит она, а не номер аккаунта
CREATE TABLE IF NOT EXISTS g_refs (ref TEXT PRIMARY KEY, user INTEGER NOT NULL);
-- «Лунная ферма»
-- water — сколько поливов осталось в лейке; на грядке grown — сколько уже выросло (сек), [wet_from, water_until) — окно полива
-- (колонки water, grown, wet_from, water_until добавлены 2026-11-13 разовым ALTER на рабочей базе)
CREATE TABLE IF NOT EXISTS f_farms (user INTEGER PRIMARY KEY, pub TEXT UNIQUE NOT NULL, dust INTEGER NOT NULL DEFAULT 10,
  unlocked INTEGER NOT NULL DEFAULT 3, created INTEGER NOT NULL, water INTEGER NOT NULL DEFAULT 5);
CREATE TABLE IF NOT EXISTS f_plots (user INTEGER NOT NULL, idx INTEGER NOT NULL, crop TEXT NOT NULL, planted INTEGER NOT NULL,
  grown INTEGER NOT NULL DEFAULT 0, wet_from INTEGER NOT NULL DEFAULT 0, water_until INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user, idx));
-- сорта (общие для всех: гибрид, выведенный одним, может купить другой), семена в мешке и в лавке, продажи
CREATE TABLE IF NOT EXISTS f_strains (id TEXT PRIMARY KEY, name TEXT NOT NULL, genes TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS f_inv (user INTEGER NOT NULL, strain TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
  listed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user, strain));
-- амбар: собранный урожай (count штук сорта strain); продаётся станции или идёт на кухню
CREATE TABLE IF NOT EXISTS f_barn (user INTEGER NOT NULL, strain TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user, strain));
-- кухня: купленные строения (mill, oven) и задание в каждом (одно на строение)
CREATE TABLE IF NOT EXISTS f_builds (user INTEGER NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user, kind));
CREATE TABLE IF NOT EXISTS f_jobs (user INTEGER NOT NULL, kind TEXT NOT NULL, recipe TEXT NOT NULL, n INTEGER NOT NULL,
  started INTEGER NOT NULL, ready INTEGER NOT NULL, PRIMARY KEY (user, kind));
-- прокачка мельницы и печи (2026-11-16): уровень = число ячеек (нет строки — одна); что списано в ячейку — для отмены
CREATE TABLE IF NOT EXISTS f_levels (user INTEGER NOT NULL, kind TEXT NOT NULL, level INTEGER NOT NULL, PRIMARY KEY (user, kind));
CREATE TABLE IF NOT EXISTS f_jobtake (user INTEGER NOT NULL, slot TEXT NOT NULL, strain TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (user, slot, strain));
-- амбар стал покупным (2026-11-14): у кого в амбаре уже был урожай — амбар даётся бесплатно (повтор безвреден)
INSERT OR IGNORE INTO f_builds (user, kind, at) SELECT DISTINCT user, 'barn', 0 FROM f_barn;
CREATE INDEX IF NOT EXISTS f_inv_listed ON f_inv (user, listed);
-- рынок читает только выставленные семена, а не инвентари всех игроков (экономия чтений, 2026-11-16)
CREATE INDEX IF NOT EXISTS f_inv_sale ON f_inv (listed) WHERE listed > 0;
-- прилавок (2026-11-14): урожай и продукты из амбара, выставленные игрокам. Выставленное лежит тут, а не в амбаре
-- (его нельзя ни смолоть, ни распылить); сняли с продажи — вернулось в амбар.
CREATE TABLE IF NOT EXISTS f_stall (user INTEGER NOT NULL, item TEXT NOT NULL, listed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user, item));
CREATE INDEX IF NOT EXISTS f_stall_listed ON f_stall (listed);
-- своя цена продавца (2026-11-14): на семена и товары прилавка, в пределах 70–130% от цены игры; нет строки — цена игры
-- сундук (2026-11-14): лишние семена из инвентаря; в сундуке их не посадить и не продать, пока не достанешь
CREATE TABLE IF NOT EXISTS f_chest (user INTEGER NOT NULL, strain TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user, strain));
-- события расцветок (2026-11-15): на грядке — уголь (огненный сгорел), комета (кометный созрел с прибавкой), иней (ледяной заморозил пустую грядку)
CREATE TABLE IF NOT EXISTS f_plotev (user INTEGER NOT NULL, idx INTEGER NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, until INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user, idx));
CREATE TABLE IF NOT EXISTS f_evlog (user INTEGER NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS f_evlog_u ON f_evlog (user, kind, at);
-- звёздочки от упавшей кометы: лежат на ферме, игрок собирает нажатием (x, y — точка на картинке фермы)
CREATE TABLE IF NOT EXISTS f_stars (id INTEGER PRIMARY KEY AUTOINCREMENT, user INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, dust INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS f_stars_u ON f_stars (user);
CREATE TABLE IF NOT EXISTS f_cratercrop (user INTEGER NOT NULL, idx INTEGER NOT NULL, crop TEXT NOT NULL, PRIMARY KEY (user, idx));
CREATE TABLE IF NOT EXISTS f_prices (user INTEGER NOT NULL, item TEXT NOT NULL, price INTEGER NOT NULL, PRIMARY KEY (user, item));
CREATE TABLE IF NOT EXISTS f_sales (id INTEGER PRIMARY KEY AUTOINCREMENT, seller INTEGER NOT NULL, buyer_name TEXT, strain TEXT NOT NULL,
  price INTEGER NOT NULL, at INTEGER NOT NULL, seen INTEGER NOT NULL DEFAULT 0);
-- коллекционные предметы всех игр (показываются и в игре, и в профиле гильдии).
-- «Лунная ферма»: kind = vinyl, item = трек; у любого трека любая редкость (tier) и отделка (finish: plain / foil / star)
CREATE TABLE IF NOT EXISTS g_items (user INTEGER NOT NULL, game TEXT NOT NULL, kind TEXT NOT NULL, item TEXT NOT NULL,
  tier TEXT NOT NULL, finish TEXT NOT NULL DEFAULT 'plain', count INTEGER NOT NULL DEFAULT 1, first_at INTEGER NOT NULL,
  PRIMARY KEY (user, game, kind, item, tier, finish));
DROP TABLE IF EXISTS f_vinyls;
CREATE TABLE IF NOT EXISTS f_gifts (id INTEGER PRIMARY KEY AUTOINCREMENT, to_user INTEGER NOT NULL, from_name TEXT,
  dust INTEGER NOT NULL, at INTEGER NOT NULL, opened INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS f_gifts_to ON f_gifts (to_user, opened);
CREATE TABLE IF NOT EXISTS f_given (from_user INTEGER NOT NULL, to_user INTEGER NOT NULL, day TEXT NOT NULL,
  PRIMARY KEY (from_user, to_user, day));
CREATE TABLE IF NOT EXISTS f_daily (user INTEGER NOT NULL, day TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user, day));
-- события моно-фермы (2026-11-15): вся открытая ферма одной расцветки → крупное событие; отметки на грядках (созвездие, мифическое соседство)
CREATE TABLE IF NOT EXISTS f_mono (user INTEGER NOT NULL, kind TEXT NOT NULL, started INTEGER NOT NULL, until INTEGER NOT NULL, PRIMARY KEY (user, started));
CREATE TABLE IF NOT EXISTS f_monomark (user INTEGER NOT NULL, idx INTEGER NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL DEFAULT 0, until INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user, idx, kind));
-- мшистые комочки (2026-11-15): после события «Мох захватил ферму» раскатываются по ферме с пылью, как звёздочки кометы
CREATE TABLE IF NOT EXISTS f_clumps (id INTEGER PRIMARY KEY AUTOINCREMENT, user INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, dust INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS f_clumps_u ON f_clumps (user);
-- лента «Новости фермы» (2026-11-15): кто что выставил, купил, подарил, у кого началось большое событие
CREATE TABLE IF NOT EXISTS f_feed (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, kind TEXT NOT NULL, actor INTEGER NOT NULL, target INTEGER, item TEXT, n INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS f_feed_at ON f_feed (at);
-- игрок разрешил боту писать ему в личку о событиях своей фермы
CREATE TABLE IF NOT EXISTS f_notify (user INTEGER PRIMARY KEY, on_ INTEGER NOT NULL DEFAULT 1, at INTEGER NOT NULL);
-- магазин станции (2026-11-15): у каждого игрока своя доска из трёх заказов на блюда; slot 0 — простой, 1 — сложный, 2 — особый
CREATE TABLE IF NOT EXISTS f_orders (user INTEGER NOT NULL, slot INTEGER NOT NULL, items TEXT NOT NULL, reward INTEGER NOT NULL, until INTEGER NOT NULL, ready INTEGER NOT NULL, PRIMARY KEY (user, slot));
-- индексы против полного перебора (2026-11-15: 92% чтения базы давали рейтинг «Сегодня» и чистки без индекса)
CREATE INDEX IF NOT EXISTS g_events_at ON g_events (at);
CREATE INDEX IF NOT EXISTS g_events_user ON g_events (user, id);
CREATE INDEX IF NOT EXISTS g_rounds_started ON g_rounds (started);
CREATE INDEX IF NOT EXISTS f_sales_seller ON f_sales (seller, seen);
-- вид фермы (2026-11-15): купленные цвета крыш и выбранный цвет
CREATE TABLE IF NOT EXISTS f_decor (user INTEGER NOT NULL, kind TEXT NOT NULL, item TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user, kind, item));
CREATE TABLE IF NOT EXISTS f_style (user INTEGER PRIMARY KEY, roof TEXT);
-- украшения двора (2026-11-19): что стоит на каждом месте (fence, path, plaza) и какие мелочи спрятаны (bit:<id> = off); купленное — в f_decor
CREATE TABLE IF NOT EXISTS f_yard (user INTEGER NOT NULL, slot TEXT NOT NULL, item TEXT NOT NULL, PRIMARY KEY (user, slot));
-- скорлупа пропавших странных семян (2026-11-19): лежит в инвентаре, распыляется за 1 пыль
CREATE TABLE IF NOT EXISTS f_shell (user INTEGER PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0);
-- очки за сутки по Минску (2026-11-15: рейтинг «Сегодня» читал все сегодняшние события — тысячи строк на открытие).
-- Каждое начисление само прибавляется сюда триггером; рейтинг читает по строке на игрока.
CREATE TABLE IF NOT EXISTS g_daypts (day INTEGER NOT NULL, user INTEGER NOT NULL, pts INTEGER NOT NULL DEFAULT 0, name TEXT, PRIMARY KEY (day, user));
-- индекс g_daypts_top убран (2026-11-16): за день в таблице десятки строк, а индекс переписывался на каждое начисление очков —
-- лишняя запись из пяти. Данные не трогает.
DROP INDEX IF EXISTS g_daypts_top;
-- суммы за день больше не копятся: вкладка «Сегодня» убрана (2026-11-16). Триггер снимаем — это минус строка записи с каждого начисления.
-- Таблица g_daypts остаётся пустой, на случай возврата вкладки.
DROP TRIGGER IF EXISTS g_events_daypts;
-- накопленное время в играх (2026-11-18, строчка «всего в игре» на карточке бота /gametime): действия старше 30 дней удаляются,
-- поэтому завершённые сутки складываются сюда. sec — секунды за сутки до upto (номер суток по Минску, не включая), since — первое действие.
CREATE TABLE IF NOT EXISTS g_playtime (user INTEGER PRIMARY KEY, sec INTEGER NOT NULL DEFAULT 0, upto INTEGER NOT NULL DEFAULT 0, since INTEGER NOT NULL DEFAULT 0);
-- улей (2026-11-18): таймер мёда созревшего растения (planted — какая посадка, got — баночка уже в улье) и мёд, ждущий в улье
CREATE TABLE IF NOT EXISTS f_honey (user INTEGER NOT NULL, idx INTEGER NOT NULL, planted INTEGER NOT NULL, item TEXT NOT NULL, until INTEGER NOT NULL, got INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user, idx));
CREATE TABLE IF NOT EXISTS f_hive (user INTEGER NOT NULL, item TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user, item));
-- мокрые колосья (2026-11-19): собранные в лунный ливень сохнут в амбаре до dry_at, мельница их до того не мелет
CREATE TABLE IF NOT EXISTS f_wet (user INTEGER NOT NULL, strain TEXT NOT NULL, n INTEGER NOT NULL, dry_at INTEGER NOT NULL);
-- подземелье (2026-11-19): кости и текущий поход героя, рюкзак еды (ячейка — одно блюдо), очередь котла удобрений
CREATE TABLE IF NOT EXISTS d_hero (user INTEGER PRIMARY KEY, bones INTEGER NOT NULL DEFAULT 0, run TEXT, size TEXT, started INTEGER, hp INTEGER NOT NULL DEFAULT 100);
CREATE TABLE IF NOT EXISTS d_pack (user INTEGER NOT NULL, slot INTEGER NOT NULL, item TEXT NOT NULL, PRIMARY KEY (user, slot));
CREATE TABLE IF NOT EXISTS d_brew (user INTEGER PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, started INTEGER NOT NULL DEFAULT 0);
-- тайная комната (2026-11-19): поход со Странной похлёбкой и легендарные карты для будущей карточной игры (пока скрыты)
CREATE TABLE IF NOT EXISTS d_secret (user INTEGER PRIMARY KEY, run TEXT NOT NULL);
-- находка алтаря странной комнаты: card / coal / seed; выдаётся на ферму при итоге похода, погиб — пропала (2026-11-19)
CREATE TABLE IF NOT EXISTS d_altar (user INTEGER PRIMARY KEY, run TEXT NOT NULL, loot TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS d_cards (id INTEGER PRIMARY KEY AUTOINCREMENT, user INTEGER NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS d_cards_u ON d_cards (user);
-- удобрение на грядке (2026-11-19): сколько пакетиков на этой посадке и сколько секунд роста они дали (по ним урезаются очки за сбор)
CREATE TABLE IF NOT EXISTS f_fert (user INTEGER NOT NULL, idx INTEGER NOT NULL, planted INTEGER NOT NULL, n INTEGER NOT NULL, credit INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user, idx));
