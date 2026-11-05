-- Read-only: identify the foreign key and required columns before adding AR IDs.
SELECT con.conname AS constraint_name,
       con.conrelid::regclass AS source_table,
       con.confrelid::regclass AS referenced_table,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
WHERE con.contype = 'f'
  AND con.conrelid = 'public.user_stamps'::regclass;

SELECT table_schema, table_name, column_name, data_type,
       is_nullable, column_default, is_identity, is_generated
FROM information_schema.columns
WHERE (table_schema || '.' || table_name) IN (
    SELECT ns.nspname || '.' || tbl.relname
    FROM pg_constraint con
    JOIN pg_class tbl ON tbl.oid = con.confrelid
    JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
    WHERE con.contype = 'f'
      AND con.conrelid = 'public.user_stamps'::regclass
)
ORDER BY table_schema, table_name, ordinal_position;