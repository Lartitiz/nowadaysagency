-- Reconcile interrupted synchronous image jobs without a browser tab or a second provider request.
CREATE OR REPLACE FUNCTION public.studio_reconcile_stale_images()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v record; handled integer:=0;
BEGIN
 FOR v IN
   SELECT id,status,result_path FROM public.visual_studio_versions
   WHERE status IN ('processing','uncertain')
     AND coalesce(proposal->>'provider','default') <> 'higgsfield'
     AND created_at < now()-interval '20 minutes'
     AND (status='processing' OR EXISTS(
       SELECT 1 FROM storage.objects o
       WHERE o.bucket_id='visual-studio' AND o.name=result_path))
   ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED
 LOOP
   BEGIN
     IF EXISTS(SELECT 1 FROM storage.objects o
       WHERE o.bucket_id='visual-studio' AND o.name=v.result_path) THEN
       PERFORM public.studio_complete_generation(v.id);
     ELSIF v.status='processing' THEN
       UPDATE public.visual_studio_versions SET status='uncertain',
         completed_at=now(),
         error_message='La création a été interrompue et aucun résultat n’est disponible. Aucun crédit Studio n’a été décompté pour l’instant ; son issue chez le fournisseur reste inconnue.'
       WHERE id=v.id AND status='processing';
     END IF;
     handled:=handled+1;
   EXCEPTION WHEN OTHERS THEN
     RAISE WARNING 'studio image reconciliation failed for version %: %',v.id,SQLERRM;
   END;
 END LOOP;
 RETURN handled;
END $$;
REVOKE ALL ON FUNCTION public.studio_reconcile_stale_images() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.studio_reconcile_stale_images() TO service_role;

DO $schedule$
BEGIN
 IF to_regclass('cron.job') IS NOT NULL THEN
   BEGIN PERFORM cron.unschedule('studio-reconcile-images'); EXCEPTION WHEN OTHERS THEN NULL; END;
   PERFORM cron.schedule('studio-reconcile-images','*/5 * * * *',
     'SELECT public.studio_reconcile_stale_images();');
 END IF;
END $schedule$;
