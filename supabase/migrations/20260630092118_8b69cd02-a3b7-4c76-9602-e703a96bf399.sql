DO $$
DECLARE
  r record;
  v_action text;
  v_conname text;
BEGIN
  -- 1) Recreate every FK (col workspace_id) -> public.workspaces with proper ON DELETE
  FOR r IN
    SELECT c.conname,
           c.conrelid::regclass::text AS tbl,
           a.attname AS col,
           c.confdeltype
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.workspaces'::regclass
      AND a.attname = 'workspace_id'
      AND c.conrelid::regclass::text LIKE 'public.%'
  LOOP
    -- subscriptions and purchases keep records → SET NULL ; others CASCADE
    IF r.tbl IN ('public.subscriptions','public.purchases') THEN
      v_action := 'SET NULL';
      IF (r.confdeltype = 'n') THEN CONTINUE; END IF;
    ELSE
      v_action := 'CASCADE';
      IF (r.confdeltype = 'c') THEN CONTINUE; END IF;
    END IF;

    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I;', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE %s;',
      r.tbl, r.conname, v_action
    );
  END LOOP;

  -- 2) workspaces.created_by -> auth.users(id) ON DELETE SET NULL
  SELECT c.conname, c.confdeltype INTO v_conname, v_action
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
  WHERE c.contype='f' AND c.conrelid='public.workspaces'::regclass AND a.attname='created_by'
  LIMIT 1;

  IF v_conname IS NOT NULL AND v_action <> 'n' THEN
    EXECUTE format('ALTER TABLE public.workspaces DROP CONSTRAINT %I;', v_conname);
    v_conname := NULL;
  END IF;
  IF v_conname IS NULL THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  -- 3) subscriptions.user_id -> auth.users(id) ON DELETE CASCADE (add if missing)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attnum=ANY(c.conkey) AND a.attrelid=c.conrelid
    WHERE c.contype='f' AND c.conrelid='public.subscriptions'::regclass
      AND a.attname='user_id' AND c.confrelid='auth.users'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;