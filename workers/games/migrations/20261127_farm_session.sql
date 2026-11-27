CREATE TABLE IF NOT EXISTS f_action_rate (
  user INTEGER PRIMARY KEY, updated_ms INTEGER NOT NULL, credit_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS f_play_session (
  user INTEGER NOT NULL, telegram TEXT NOT NULL, permit TEXT NOT NULL, expires INTEGER NOT NULL,
  PRIMARY KEY (user, telegram)
);
