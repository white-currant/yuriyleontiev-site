-- Подсчёт странных семян читает только подходящие записи.
CREATE INDEX IF NOT EXISTS f_inv_anomaly ON f_inv(strain, count) WHERE strain = 'anomaly';
CREATE INDEX IF NOT EXISTS f_chest_anomaly ON f_chest(strain, count) WHERE strain = 'anomaly';
CREATE INDEX IF NOT EXISTS f_plots_anomaly ON f_plots(crop) WHERE crop = 'anomaly';
CREATE INDEX IF NOT EXISTS f_inv_sale_strain ON f_inv(strain) WHERE listed > 0;

-- Строка ('*', '*') хранит ревизию каталога для кэша текстового поиска.
CREATE TABLE IF NOT EXISTS f_herbarium_counts (
  shape TEXT NOT NULL, color TEXT NOT NULL, n INTEGER NOT NULL,
  PRIMARY KEY (shape, color)
);
INSERT OR IGNORE INTO f_herbarium_counts VALUES ('*', '*', 0);
CREATE TRIGGER IF NOT EXISTS f_herbarium_counts_insert AFTER INSERT ON f_strains
WHEN COALESCE(json_extract(NEW.genes, '$.myth'), 0) = 0
BEGIN
  INSERT INTO f_herbarium_counts VALUES (
    COALESCE(json_extract(NEW.genes, '$.shape'), ''), COALESCE(json_extract(NEW.genes, '$.color'), ''), 1
  ) ON CONFLICT(shape, color) DO UPDATE SET n = n + 1;
  UPDATE f_herbarium_counts SET n = n + 1 WHERE shape = '*' AND color = '*';
END;
CREATE TRIGGER IF NOT EXISTS f_herbarium_counts_delete AFTER DELETE ON f_strains
WHEN COALESCE(json_extract(OLD.genes, '$.myth'), 0) = 0
BEGIN
  UPDATE f_herbarium_counts SET n = n - 1
    WHERE shape = COALESCE(json_extract(OLD.genes, '$.shape'), '')
      AND color = COALESCE(json_extract(OLD.genes, '$.color'), '');
  UPDATE f_herbarium_counts SET n = n + 1 WHERE shape = '*' AND color = '*';
END;
CREATE TRIGGER IF NOT EXISTS f_herbarium_counts_update AFTER UPDATE OF genes, name, id ON f_strains
WHEN COALESCE(json_extract(OLD.genes, '$.myth'), 0) = 0
  OR COALESCE(json_extract(NEW.genes, '$.myth'), 0) = 0
BEGIN
  UPDATE f_herbarium_counts SET n = n - 1
    WHERE COALESCE(json_extract(OLD.genes, '$.myth'), 0) = 0
      AND shape = COALESCE(json_extract(OLD.genes, '$.shape'), '')
      AND color = COALESCE(json_extract(OLD.genes, '$.color'), '');
  INSERT INTO f_herbarium_counts
    SELECT COALESCE(json_extract(NEW.genes, '$.shape'), ''), COALESCE(json_extract(NEW.genes, '$.color'), ''), 1
    WHERE COALESCE(json_extract(NEW.genes, '$.myth'), 0) = 0
    ON CONFLICT(shape, color) DO UPDATE SET n = n + 1;
  UPDATE f_herbarium_counts SET n = n + 1 WHERE shape = '*' AND color = '*';
END;

-- Разовая инициализация существующих сортов. Повторный запуск сверяет накопленные итоги.
DELETE FROM f_herbarium_counts WHERE shape <> '*';
INSERT INTO f_herbarium_counts
  SELECT COALESCE(json_extract(genes, '$.shape'), ''), COALESCE(json_extract(genes, '$.color'), ''), COUNT(*)
  FROM f_strains WHERE COALESCE(json_extract(genes, '$.myth'), 0) = 0 GROUP BY 1, 2;
UPDATE f_herbarium_counts SET n = n + 1 WHERE shape = '*' AND color = '*';
