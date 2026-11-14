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
-- амбар стал покупным (2026-11-14): у кого в амбаре уже был урожай — амбар даётся бесплатно (повтор безвреден)
INSERT OR IGNORE INTO f_builds (user, kind, at) SELECT DISTINCT user, 'barn', 0 FROM f_barn;
CREATE INDEX IF NOT EXISTS f_inv_listed ON f_inv (user, listed);
-- прилавок (2026-11-14): урожай и продукты из амбара, выставленные игрокам. Выставленное лежит тут, а не в амбаре
-- (его нельзя ни смолоть, ни распылить); сняли с продажи — вернулось в амбар.
CREATE TABLE IF NOT EXISTS f_stall (user INTEGER NOT NULL, item TEXT NOT NULL, listed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user, item));
CREATE INDEX IF NOT EXISTS f_stall_listed ON f_stall (listed);
-- своя цена продавца (2026-11-14): на семена и товары прилавка, в пределах 70–130% от цены игры; нет строки — цена игры
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
