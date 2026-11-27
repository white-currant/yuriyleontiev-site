-- Run once on existing databases, then apply schema.sql before deploying the Worker.
ALTER TABLE f_farms ADD COLUMN dust_context TEXT;
