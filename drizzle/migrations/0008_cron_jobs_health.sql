-- Dernier passage de chaque automate pg_cron, lu par l'edge cron-health
-- (bilan quotidien + lundi). Avant, la mort du cron de publication programmée
-- ne se voyait que par « programmés en retard » — toujours 0 quand personne
-- ne programme rien. Lecture seule, service_role uniquement.
CREATE OR REPLACE FUNCTION public.cron_jobs_health()
RETURNS TABLE (
  jobname text,
  schedule text,
  active boolean,
  last_start timestamptz,
  last_status text,
  last_message text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = cron, public
AS $$
  SELECT j.jobname::text, j.schedule::text, j.active, r.start_time, r.status::text, left(r.return_message, 200)
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT d.start_time, d.status, d.return_message
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid
    ORDER BY d.runid DESC
    LIMIT 1
  ) r ON true
  ORDER BY j.jobname;
$$;

REVOKE ALL ON FUNCTION public.cron_jobs_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_jobs_health() TO service_role;