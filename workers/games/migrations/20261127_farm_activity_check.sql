CREATE INDEX IF NOT EXISTS f_dust_log_user_at ON f_dust_log (user, at);
CREATE TABLE IF NOT EXISTS f_farm_check_state (user INTEGER PRIMARY KEY, checked_dust_id INTEGER NOT NULL);
