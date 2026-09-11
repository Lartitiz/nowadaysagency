CREATE TABLE public.client_error_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  route text NOT NULL,
  asset text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.client_error_events(created_at);
CREATE INDEX ON public.client_error_events(user_id, created_at);
ALTER TABLE public.client_error_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_error_events FROM anon, authenticated;
GRANT SELECT ON public.client_error_events TO authenticated;
GRANT ALL ON public.client_error_events TO service_role;
CREATE POLICY "admins read technical errors" ON public.client_error_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Rien de libre n'est enregistré : ni message d'erreur, ni URL complète,
-- ni stack, ni texte saisi. Le compte est uniquement l'auteur authentifié.
CREATE OR REPLACE FUNCTION public.report_client_error(p_kind text, p_route text, p_asset text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_kind NOT IN ('render', 'runtime', 'promise', 'operation')
    OR p_route NOT IN ('creer', 'calendrier', 'dashboard', 'onboarding', 'parametres', 'idees', 'photos', 'other')
    OR (p_asset IS NOT NULL AND p_asset !~ '^[A-Za-z0-9_-]{1,120}\.js$') THEN
    RAISE EXCEPTION 'invalid_error_metadata';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('client-error-' || auth.uid()::text, 0));
  IF (SELECT count(*) FROM public.client_error_events WHERE user_id = auth.uid()
      AND created_at > now() - interval '1 hour') >= 20 THEN RETURN false; END IF;
  INSERT INTO public.client_error_events(user_id, kind, route, asset) VALUES(auth.uid(), p_kind, p_route, p_asset);
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.report_client_error(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_client_error(text,text,text) TO authenticated;
SELECT cron.schedule('purge-client-error-events', '25 3 * * *',
  $$DELETE FROM public.client_error_events WHERE created_at < now() - interval '30 days'$$);
