-- Run in the Supabase SQL Editor. Adds character catalog entries only.
-- Does not add user_stamps or change the eight-character Stamp Rally.
BEGIN;
DO $repair$
DECLARE
    required_columns text;
    has_name boolean;
BEGIN
    SELECT string_agg(column_name, ', ') INTO required_columns
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'characters'
      AND is_nullable = 'NO' AND column_default IS NULL
      AND is_identity = 'NO' AND is_generated = 'NEVER'
      AND column_name NOT IN ('id', 'name', 'code');
    IF required_columns IS NOT NULL THEN
        RAISE EXCEPTION 'No changes made. Required characters columns need values: %', required_columns;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'characters'
          AND column_name = 'name'
    ) INTO has_name;

    IF has_name THEN
        INSERT INTO public.characters (id, code, name)
        OVERRIDING SYSTEM VALUE
        VALUES (12, 'character09', '仁科カヅキ'), (13, 'character10', '神浜コウジ'), (14, 'character11', '速水ヒロ')
        ON CONFLICT (id) DO NOTHING;
    ELSE
        INSERT INTO public.characters (id, code)
        OVERRIDING SYSTEM VALUE
        VALUES (12, 'character09'), (13, 'character10'), (14, 'character11')
        ON CONFLICT (id) DO NOTHING;
    END IF;
END
$repair$;
SELECT * FROM public.characters WHERE id IN (12, 13, 14) ORDER BY id;
COMMIT;