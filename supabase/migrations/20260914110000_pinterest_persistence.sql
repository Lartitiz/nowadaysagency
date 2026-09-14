-- Pinterest editor persistence. No backfill, deletion or reassignment of legacy rows.
-- Existing creator-only permissive policies remain; no new cross-creator grant.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pinterest_profile','pinterest_keywords','pinterest_boards','pinterest_routine','pinterest_pins'] LOOP
    EXECUTE format('CREATE POLICY pinterest_scope_read ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (workspace_id IS NULL OR public.user_has_workspace_access(workspace_id))', t);
    EXECUTE format('CREATE POLICY pinterest_scope_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND (workspace_id IS NULL OR public.user_workspace_role(workspace_id) IN (''owner'',''manager'')))', t);
    EXECUTE format('CREATE POLICY pinterest_scope_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (user_id = auth.uid() AND (workspace_id IS NULL OR public.user_workspace_role(workspace_id) IN (''owner'',''manager''))) WITH CHECK (user_id = auth.uid() AND (workspace_id IS NULL OR public.user_workspace_role(workspace_id) IN (''owner'',''manager'')))', t);
    EXECUTE format('CREATE POLICY pinterest_scope_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (user_id = auth.uid() AND (workspace_id IS NULL OR public.user_workspace_role(workspace_id) IN (''owner'',''manager'')))', t);
  END LOOP;
END $$;

CREATE FUNCTION public.pinterest_preserve_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'La cible de cette ligne Pinterest ne peut pas être changée.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['pinterest_profile','pinterest_keywords','pinterest_boards','pinterest_routine','pinterest_pins'] LOOP
    EXECUTE format('CREATE TRIGGER pinterest_preserve_scope BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.pinterest_preserve_scope()', t);
  END LOOP;
END $$;

CREATE FUNCTION public.pinterest_check_board() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.board_id IS NOT DISTINCT FROM OLD.board_id THEN RETURN NEW; END IF;
  END IF;
  IF NEW.board_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pinterest_boards b WHERE b.id = NEW.board_id
      AND b.user_id = NEW.user_id AND b.workspace_id IS NOT DISTINCT FROM NEW.workspace_id
  ) THEN RAISE EXCEPTION 'Le tableau ne correspond pas à cet espace Pinterest.' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pinterest_check_board BEFORE INSERT OR UPDATE ON public.pinterest_pins
FOR EACH ROW EXECUTE FUNCTION public.pinterest_check_board();

CREATE FUNCTION public.save_pinterest_editor(p_table text, p_workspace_id uuid, p_month date, p_expected jsonb, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  fields text[]; field text; assignments text; insert_columns text; insert_values text;
  current_rows jsonb; expected_rows jsonb; row_data jsonb; old_row jsonb; patch jsonb;
  result_rows jsonb; scope_sql text; changed integer; already_saved boolean := true;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '42501'; END IF;
  IF p_workspace_id IS NOT NULL AND COALESCE(public.user_workspace_role(p_workspace_id), '') NOT IN ('owner','manager') THEN
    RAISE EXCEPTION 'Cet espace est en lecture seule ou inaccessible.' USING ERRCODE = '42501';
  END IF;
  CASE p_table
    WHEN 'pinterest_profile' THEN fields := ARRAY['pro_account_done','photo_done','display_name','name_done','bio','bio_done','website_url','url_done'];
    WHEN 'pinterest_keywords' THEN fields := ARRAY['keywords_raw','keywords_product','keywords_need','keywords_inspiration','keywords_english','checklist_titles','checklist_board_desc','checklist_pin_titles','checklist_pin_desc','checklist_profile_name','checklist_bio'];
    WHEN 'pinterest_boards' THEN fields := ARRAY['name','description','board_type','sort_order'];
    WHEN 'pinterest_routine' THEN fields := ARRAY['rhythm','current_month','pins_target','pins_done','recycled_done','links_checked','stats_checked','top_pins_noted','keywords_adjusted'];
    WHEN 'pinterest_pins' THEN fields := ARRAY['subject','board_id','link_url','title','description','variant_type'];
    ELSE RAISE EXCEPTION 'Table Pinterest inconnue' USING ERRCODE = '22023';
  END CASE;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_typeof(p_expected) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Liste attendue' USING ERRCODE = '22023'; END IF;
  IF (p_table = 'pinterest_routine') IS DISTINCT FROM (p_month IS NOT NULL) THEN RAISE EXCEPTION 'Mois invalide' USING ERRCODE = '22023'; END IF;
  IF p_table IN ('pinterest_profile','pinterest_keywords','pinterest_routine') AND (jsonb_array_length(p_rows) <> 1 OR jsonb_array_length(p_expected) > 1) THEN
    RAISE EXCEPTION 'Plusieurs fiches existent ou la fiche manque ; les originaux sont conservés.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE jsonb_typeof(r) <> 'object' OR r->>'id' IS NULL)
    OR (SELECT count(DISTINCT r->>'id') FROM jsonb_array_elements(p_rows) r) <> jsonb_array_length(p_rows) THEN RAISE EXCEPTION 'Identifiants invalides' USING ERRCODE = '22023'; END IF;
  -- Serialize first creation too, where row locks alone would not suffice.
  PERFORM pg_advisory_xact_lock(hashtextextended('pinterest:' || p_table || ':' || auth.uid()::text || ':' || coalesce(p_workspace_id::text,'personal') || ':' || coalesce(p_month::text,''), 0));
  scope_sql := 'user_id = auth.uid() AND workspace_id IS NOT DISTINCT FROM $1';
  IF p_month IS NOT NULL THEN scope_sql := scope_sql || ' AND current_month = $2'; END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id), ''[]''::jsonb) FROM (SELECT * FROM public.%I WHERE %s FOR UPDATE) t', p_table, scope_sql)
    INTO current_rows USING p_workspace_id, p_month;
  SELECT coalesce(jsonb_agg(r ORDER BY r->>'id'), '[]'::jsonb) INTO expected_rows FROM jsonb_array_elements(p_expected) r;
  -- A lost successful response can be retried with the same IDs and editable values.
  IF jsonb_array_length(current_rows) <> jsonb_array_length(p_rows) THEN already_saved := false; END IF;
  FOR row_data IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    SELECT r INTO old_row FROM jsonb_array_elements(current_rows) r WHERE r->>'id' = row_data->>'id';
    IF old_row IS NULL THEN already_saved := false; END IF;
    FOREACH field IN ARRAY fields LOOP
      IF row_data ? field AND row_data->field IS DISTINCT FROM old_row->field THEN already_saved := false; END IF;
    END LOOP;
  END LOOP;
  IF already_saved THEN
    SELECT coalesce(jsonb_agg(c ORDER BY ord), '[]'::jsonb) INTO result_rows
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY p(r,ord)
    JOIN jsonb_array_elements(current_rows) c ON c->>'id' = r->>'id';
    RETURN result_rows;
  END IF;
  IF current_rows IS DISTINCT FROM expected_rows THEN
    RAISE EXCEPTION 'Les données Pinterest ont changé. Ton brouillon est conservé ; recharge la page après en avoir gardé une copie.' USING ERRCODE = '40001';
  END IF;
  FOR row_data IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    SELECT r INTO old_row FROM jsonb_array_elements(current_rows) r WHERE r->>'id' = row_data->>'id';
    patch := '{}'::jsonb; assignments := ''; insert_columns := 'id,user_id,workspace_id'; insert_values := 'r.id,r.user_id,r.workspace_id';
    FOREACH field IN ARRAY fields LOOP
      IF row_data ? field THEN
        patch := patch || jsonb_build_object(field, row_data->field);
        assignments := assignments || CASE WHEN assignments = '' THEN '' ELSE ',' END || format('%I = r.%I', field, field);
        insert_columns := insert_columns || format(',%I', field);
        insert_values := insert_values || format(',r.%I', field);
      END IF;
    END LOOP;
    IF p_month IS NOT NULL AND (patch->>'current_month')::date IS DISTINCT FROM p_month THEN RAISE EXCEPTION 'Mois hors cible' USING ERRCODE = '22023'; END IF;
    IF old_row IS NULL THEN
      patch := patch || jsonb_build_object('id',row_data->>'id','user_id',auth.uid(),'workspace_id',p_workspace_id);
      EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) r', p_table, insert_columns, insert_values, p_table) USING patch;
    ELSIF assignments <> '' THEN
      IF p_table IN ('pinterest_profile','pinterest_keywords','pinterest_routine') THEN assignments := assignments || ',updated_at = now()'; END IF;
      EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I, $1) r WHERE t.id = $2 AND t.user_id = auth.uid() AND t.workspace_id IS NOT DISTINCT FROM $3', p_table, assignments, p_table)
        USING patch, (row_data->>'id')::uuid, p_workspace_id;
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed <> 1 THEN RAISE EXCEPTION 'Écriture Pinterest non confirmée' USING ERRCODE = '40001'; END IF;
    END IF;
  END LOOP;
  -- Only removals explicitly present in the confirmed snapshot are deleted.
  FOR old_row IN SELECT * FROM jsonb_array_elements(current_rows) LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE r->>'id' = old_row->>'id') THEN
      EXECUTE format('DELETE FROM public.%I WHERE id = $1 AND user_id = auth.uid() AND workspace_id IS NOT DISTINCT FROM $2', p_table) USING (old_row->>'id')::uuid, p_workspace_id;
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed <> 1 THEN RAISE EXCEPTION 'Suppression Pinterest non confirmée' USING ERRCODE = '40001'; END IF;
    END IF;
  END LOOP;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY %I %s, id), ''[]''::jsonb) FROM public.%I t WHERE %s', CASE WHEN p_table = 'pinterest_boards' THEN 'sort_order' ELSE 'created_at' END, CASE WHEN p_table = 'pinterest_pins' THEN 'DESC' ELSE 'ASC' END, p_table, scope_sql)
    INTO result_rows USING p_workspace_id, p_month;
  IF jsonb_array_length(result_rows) <> jsonb_array_length(p_rows) THEN RAISE EXCEPTION 'Sauvegarde Pinterest incomplète' USING ERRCODE = '40001'; END IF;
  RETURN result_rows;
END $$;
REVOKE ALL ON FUNCTION public.save_pinterest_editor(text,uuid,date,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_pinterest_editor(text,uuid,date,jsonb,jsonb) TO authenticated;
