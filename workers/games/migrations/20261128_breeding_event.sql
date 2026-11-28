-- У каждого садовода свой запас стартовых удобрений и список зачисленных сортов.
CREATE TABLE IF NOT EXISTS f_breeding_player (
  user INTEGER NOT NULL,
  started INTEGER NOT NULL,
  starter INTEGER NOT NULL,
  hybrids INTEGER NOT NULL DEFAULT 0,
  intro_seen INTEGER NOT NULL DEFAULT 0,
  goal INTEGER NOT NULL,
  reward INTEGER NOT NULL,
  PRIMARY KEY (user, started)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS f_breeding_hybrid (
  user INTEGER NOT NULL,
  started INTEGER NOT NULL,
  strain TEXT NOT NULL,
  PRIMARY KEY (user, started, strain)
) WITHOUT ROWID;
CREATE TRIGGER IF NOT EXISTS f_breeding_award AFTER INSERT ON f_breeding_hybrid
BEGIN
  UPDATE f_breeding_player SET hybrids = hybrids + 1
    WHERE user = NEW.user AND started = NEW.started AND hybrids < goal;
  INSERT INTO f_barn (user, strain, count)
    SELECT user, 'p:fert', reward FROM f_breeding_player
    WHERE user = NEW.user AND started = NEW.started AND hybrids = goal AND changes() = 1
    ON CONFLICT(user, strain) DO UPDATE SET count = count + excluded.count;
END;
