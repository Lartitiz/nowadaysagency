-- Rendez-vous hebdo : email récurrent « tes idées de la semaine » (rétention).
-- Envoyé en direct par email-trigger (event weekly_digest), pas via la file one-shot.
-- {{ideas}} = liste HTML des 5 idées de la semaine, injectée au moment de l'envoi.

INSERT INTO public.email_templates (name, subject, html_body, category, variables) VALUES
(
  'Rendez-vous hebdo - idées de la semaine',
  '{{prenom}}, tes 5 idées de contenu pour la semaine 🌸',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FFF4F8;padding:40px 20px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;">
      <div style="text-align:center;padding:32px 40px 16px;">
        <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#91014b;">Nowadays</h1>
      </div>
      <div style="padding:0 40px;"><div style="height:2px;background:#FB3D80;border-radius:1px;"></div></div>
      <div style="padding:28px 40px 36px;">
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Hey {{prenom}} 👋</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">C''est ton rendez-vous de la semaine. Voici <strong>5 idées de contenu</strong> à piocher — choisis-en une, l''IA la transforme en post avec ta voix en deux minutes.</p>
        {{ideas}}
        <div style="text-align:center;padding:24px 0 8px;">
          <a href="{{app_url}}/creer" style="display:inline-block;background:#FB3D80;color:#fff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:999px;">✨ Créer un contenu</a>
        </div>
        <p style="font-size:14px;color:#6B6B6B;line-height:1.6;text-align:center;">Une idée par semaine suffit pour rester visible. À toi de jouer 💪</p>
      </div>
    </div>
  </div>',
  'retention',
  ARRAY['prenom', 'ideas', 'app_url']
);

INSERT INTO public.email_sequences (name, trigger_event, is_active) VALUES
('Rendez-vous hebdo', 'weekly_digest', true);

INSERT INTO public.email_sequence_steps (sequence_id, step_number, delay_hours, template_id) VALUES
(
  (SELECT id FROM public.email_sequences WHERE trigger_event = 'weekly_digest' LIMIT 1),
  1,
  0,
  (SELECT id FROM public.email_templates WHERE name = 'Rendez-vous hebdo - idées de la semaine' LIMIT 1)
);
