-- Rappel J+1 pour les contenus posés au calendrier dont la date est passée
-- sans jamais être publiés. Avant cette migration, seul le bandeau dashboard
-- (AdaptiveHome) le signalait — donc rien ne le disait tant que l'autrice ne
-- rouvrait pas l'app (audit du 14/08 : jusqu'à 3 semaines de délai constaté).
-- Déclenché par l'event email-trigger "check_forgotten_drafts", programmé
-- quotidien pour ne regarder QUE la date qui vient de passer (hier).

-- 1. Template de l'email de rappel
INSERT INTO public.email_templates (name, subject, html_body, category, variables) VALUES
(
  'Rappel contenu jamais publié',
  '{{prenom}}, un contenu attend toujours de partir 👀',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FFF4F8;padding:40px 20px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;">
      <div style="text-align:center;padding:32px 40px 16px;">
        <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#91014b;">Nowadays</h1>
      </div>
      <div style="padding:0 40px;"><div style="height:2px;background:#FB3D80;border-radius:1px;"></div></div>
      <div style="padding:28px 40px 36px;">
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Hey {{prenom}} 👋</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Un contenu que tu avais préparé et posé au calendrier a passé sa date sans partir. Ça arrive à tout le monde — pas de souci, il est toujours prêt, il attend juste que tu le publies (ou que tu déplaces sa date).</p>
        <div style="text-align:center;padding:24px 0 8px;">
          <a href="{{app_url}}/calendrier" style="display:inline-block;background:#FB3D80;color:#fff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:999px;">📅 Retrouver mon calendrier</a>
        </div>
        <p style="font-size:14px;color:#6B6B6B;line-height:1.6;text-align:center;">Ton tableau de bord te montrera directement lequel. 🌸</p>
      </div>
    </div>
  </div>',
  'engagement',
  ARRAY['prenom', 'app_url']
);

-- 2. La séquence (1 trigger -> 1 séquence)
INSERT INTO public.email_sequences (name, trigger_event, is_active) VALUES
('Rappel contenu jamais publié', 'forgotten_draft_reminder', true);

-- 3. L'étape unique (envoi immédiat à la mise en file)
INSERT INTO public.email_sequence_steps (sequence_id, step_number, delay_hours, template_id) VALUES
(
  (SELECT id FROM public.email_sequences WHERE trigger_event = 'forgotten_draft_reminder' LIMIT 1),
  1,
  0,
  (SELECT id FROM public.email_templates WHERE name = 'Rappel contenu jamais publié' LIMIT 1)
);

-- 4. Cron quotidien — après check-inactive/check-credits (8h/8h30), avant que
-- la journée ne commence pour de bon. process_queue (*/15 min) livre ensuite.
do $do$
begin
  begin perform cron.unschedule('email-check-forgotten-drafts'); exception when others then null; end;
  perform cron.schedule('email-check-forgotten-drafts', '0 9 * * *', $c$select public.trigger_email_event('check_forgotten_drafts');$c$);
exception when others then raise warning 'pg_cron scheduling unavailable in migration: %', sqlerrm;
end $do$;