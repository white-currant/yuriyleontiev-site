CREATE TABLE IF NOT EXISTS f_farm_action_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user INTEGER NOT NULL, at_ms INTEGER NOT NULL,
  action TEXT NOT NULL, bed INTEGER, strain TEXT, quantity INTEGER, outcome TEXT NOT NULL, detail TEXT
);
CREATE INDEX IF NOT EXISTS f_farm_action_user_at ON f_farm_action_log (user, at_ms, id);
CREATE INDEX IF NOT EXISTS f_farm_action_verified ON f_farm_action_log (user, id) WHERE action = 'captcha';
CREATE TABLE IF NOT EXISTS f_farm_watch_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user INTEGER NOT NULL, at_ms INTEGER NOT NULL,
  route TEXT NOT NULL, http_status INTEGER NOT NULL, error TEXT
);
CREATE INDEX IF NOT EXISTS f_farm_watch_user_at ON f_farm_watch_log (user, at_ms, id);
