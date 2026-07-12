-- Rapport mensuel stats Instagram : envoyé par email-trigger (event
-- monthly_stats_report), déclenché automatiquement par l'edge
-- stats-monthly-snapshot le 1er du mois, juste après le gel des chiffres.
-- {{stats}} = tableau HTML des métriques du mois (avec variations),
-- {{analyse}} = analyse IA du mois si présente, {{mois}} = « juillet 2026 ».

INSERT INTO public.email_templates (name, subject, html_body, category, variables) VALUES
(
  'Rapport mensuel - stats Instagram',
  '{{prenom}}, ton mois Instagram de {{mois}} en un coup d''œil 📊',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FFF4F8;padding:40px 20px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;">
      <div style="text-align:center;padding:32px 40px 16px;">
        <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#91014b;">Nowadays</h1>
      </div>
      <div style="padding:0 40px;"><div style="height:2px;background:#FB3D80;border-radius:1px;"></div></div>
      <div style="padding:28px 40px 36px;">
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Hey {{prenom}} 👋</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Ton mois de <strong>{{mois}}</strong> sur Instagram vient d''être figé automatiquement. Le voici en un coup d''œil :</p>
        {{stats}}
        {{analyse}}
        <div style="text-align:center;padding:24px 0 8px;">
          <a href="{{app_url}}/instagram/stats" style="display:inline-block;background:#FB3D80;color:#fff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:999px;">📊 Voir mes stats en détail</a>
        </div>
        <p style="font-size:14px;color:#6B6B6B;line-height:1.6;text-align:center;">Repère ce qui a marché, et repars créer — un contenu recyclé d''un top post, c''est le plus court chemin. ♻️</p>
      </div>
    </div>
  </div>',
  'retention',
  ARRAY['prenom', 'mois', 'stats', 'analyse', 'app_url']
);

INSERT INTO public.email_sequences (name, trigger_event, is_active) VALUES
('Rapport mensuel stats Instagram', 'monthly_stats_report', true);

INSERT INTO public.email_sequence_steps (sequence_id, step_number, delay_hours, template_id) VALUES
(
  (SELECT id FROM public.email_sequences WHERE trigger_event = 'monthly_stats_report' LIMIT 1),
  1,
  0,
  (SELECT id FROM public.email_templates WHERE name = 'Rapport mensuel - stats Instagram' LIMIT 1)
);
