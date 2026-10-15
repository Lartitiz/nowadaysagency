-- Rattrapage automatique des images Studio interrompues (cron studio-reconcile-images).
--
-- Pourquoi : depuis la migration 20261002090000, studio_complete_generation
-- refusait tout appel qui n'était pas « service_role ». Or le cron pg_cron
-- (toutes les 5 min, studio_reconcile_stale_images) tourne SANS jeton :
-- auth.role() y vaut NULL, donc l'appel était refusé ('forbidden'), l'erreur
-- avalée en simple WARNING, et les images déjà rangées dans le bucket restaient
-- bloquées « en cours » pour toujours.
--
-- Correctif : on laisse passer les appels SANS rôle (pg_cron, ou une fonction
-- de la base qui l'appelle), et on refuse toujours anon / authenticated. Ces
-- deux rôles n'ont de toute façon pas le droit EXECUTE (REVOKE ci-dessous) ;
-- la vérification est une deuxième ceinture.
--
-- Corps recopié À L'IDENTIQUE de 20261002090000_purchase_delivery_and_usage.sql,
-- seule la première ligne (le garde) change.
-- Lock the workspace before the version, like confirmation, to avoid inversions.
CREATE OR REPLACE FUNCTION public.studio_complete_generation(p_version uuid)
RETURNS public.visual_studio_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v visual_studio_versions; used integer;
BEGIN
 IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO v FROM visual_studio_versions WHERE id=p_version;
 IF v.id IS NULL THEN RAISE EXCEPTION 'studio_missing'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v.workspace_id::text,282026));
 SELECT * INTO v FROM visual_studio_versions WHERE id=p_version FOR UPDATE;
 IF v.status='ready' THEN RETURN v; END IF;
 IF v.status NOT IN ('processing','uncertain') THEN RAISE EXCEPTION 'studio_not_processing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='visual-studio' AND name=v.result_path) THEN RAISE EXCEPTION 'studio_result_not_stored'; END IF;
 IF v.charge_usage THEN
   -- Authorization was checked at confirmation. A revocation during provider
   -- processing must not strand an already stored result or replay its charge.
   PERFORM 1 FROM profiles WHERE user_id=v.user_id FOR UPDATE;
   SELECT count(*) INTO used FROM ai_usage WHERE workspace_id=v.workspace_id
    AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
   INSERT INTO ai_usage(user_id,workspace_id,category,action_type,model_used)
    VALUES(v.user_id,v.workspace_id,'photo_retouch','studio_'||(v.proposal->>'operation'),coalesce(v.proposal->>'model','photoroom-v2'));
   IF used>=v.base_total_limit THEN
     UPDATE profiles SET bonus_credits=bonus_credits-1 WHERE user_id=v.user_id AND bonus_credits>0;
   END IF;
 END IF;
 UPDATE visual_studio_versions SET status='ready',completed_at=now(),error_message=NULL WHERE id=v.id RETURNING * INTO v;
 UPDATE visual_studio_sessions SET updated_at=now() WHERE id=v.session_id;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.studio_complete_generation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.studio_complete_generation(uuid) TO service_role;
