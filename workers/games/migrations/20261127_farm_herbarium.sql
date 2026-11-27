CREATE TABLE IF NOT EXISTS f_strain_origin (
  strain TEXT PRIMARY KEY, breeder INTEGER, mutation TEXT, parent_a TEXT, parent_b TEXT
);
CREATE INDEX IF NOT EXISTS f_strains_created ON f_strains (created DESC, id DESC);

-- Старому сорту присваиваем автора, только если есть ровно один записанный первый дроп в секунду создания.
INSERT OR IGNORE INTO f_strain_origin (strain, breeder)
SELECT s.id, MIN(e.user)
FROM f_evlog e JOIN f_strains s ON s.id = substr(e.kind, length('seed:hybrid:') + 1) AND s.created = e.at
WHERE e.kind >= 'seed:hybrid:' AND e.kind < 'seed:hybrid;'
GROUP BY s.id
HAVING COUNT(DISTINCT e.user) = 1;
