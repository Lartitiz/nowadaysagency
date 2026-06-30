do $$
declare
  pairs text[][] := array[
    array['process-email-queue',      'email-process-queue'],
    array['check-inactive-users',     'email-check-inactive'],
    array['check-credits-exhausted',  'email-check-credits']
  ];
  p text[];
begin
  foreach p slice 1 in array pairs loop
    if exists (select 1 from cron.job where jobname = p[2])
       and exists (select 1 from cron.job where jobname = p[1])
    then
      perform cron.unschedule(p[1]);
      raise notice 'unscheduled legacy cron: %', p[1];
    else
      raise notice 'skip % (legacy absent ou email-* maintenu manquant)', p[1];
    end if;
  end loop;
end $$;