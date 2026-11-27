-- Эти пять пар сверены по журналу грядок, времени вывода и соседним сортам.
-- Все остальные старые записи остаются с доступными сведениями о происхождении.
WITH evidence(strain, parent_a_id, parent_b_id) AS (VALUES
  ('h91443deb3a', 'h88402a923e', 'h81fc58e05f'),
  ('hcc03f461c8', 'h807a598e3a', 'h7f6fbfe064'),
  ('hfd0ba60b32', 'h7f6fbfe064', 'hf5c98df5e6'),
  ('h0cc7fa0a86', 'hb2b67a70f5', 'h983ef17f79'),
  ('hdc995d564e', 'hbbe373a94d', 'hb0e71086a8')
), confirmed AS (
  SELECT e.strain, e.parent_a_id, e.parent_b_id
  FROM evidence e
  JOIN f_strain_origin saved ON saved.strain = e.strain
  JOIN f_strains child ON child.id = e.strain
  JOIN f_strains a ON a.id = e.parent_a_id
  JOIN f_strains b ON b.id = e.parent_b_id
  WHERE a.name = saved.parent_a AND b.name = saved.parent_b
    AND a.created <= child.created AND b.created <= child.created
    AND MAX(json_extract(a.genes, '$.gen'), json_extract(b.genes, '$.gen')) + 1 = json_extract(child.genes, '$.gen')
)
UPDATE f_strain_origin
SET parent_a_id = confirmed.parent_a_id, parent_b_id = confirmed.parent_b_id
FROM confirmed
WHERE f_strain_origin.strain = confirmed.strain
  AND f_strain_origin.parent_a_id IS NULL AND f_strain_origin.parent_b_id IS NULL;
