-- Séquence d'activation : relancer les inscrites qui ont fini l'onboarding
-- mais n'ont JAMAIS généré de contenu (déclenchée par l'event email-trigger "check_not_activated").

-- 1. Template de l'email de relance
INSERT INTO public.email_templates (name, subject, html_body, category, variables) VALUES
(
  'Relance activation - jamais généré',
  '{{prenom}}, ton premier contenu t''attend 👀',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FFF4F8;padding:40px 20px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;">
      <div style="text-align:center;padding:32px 40px 16px;">
        <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#91014b;">Nowadays</h1>
      </div>
      <div style="padding:0 40px;"><div style="height:2px;background:#FB3D80;border-radius:1px;"></div></div>
      <div style="padding:28px 40px 36px;">
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Hey {{prenom}} 👋</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Tu as pris le temps de configurer ton espace — bravo, c''est déjà le plus dur. Il ne te reste qu''une étape, et c''est la plus satisfaisante : <strong>créer ton premier contenu</strong>.</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Pas besoin d''idée toute prête : l''IA connaît déjà ta marque, ton ton et ta cible. Tu choisis un point de départ, elle écrit avec ta voix. Ça prend deux minutes.</p>
        <div style="text-align:center;padding:24px 0 8px;">
          <a href="{{app_url}}/creer" style="display:inline-block;background:#FB3D80;color:#fff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:999px;">✍️ Créer mon premier contenu</a>
        </div>
        <p style="font-size:14px;color:#6B6B6B;line-height:1.6;text-align:center;">Et si tu bloques, réponds à cet email : je lis tout. 🌸</p>
      </div>
    </div>
  </div>',
  'activation',
  ARRAY['prenom', 'app_url']
);

-- 2. La séquence (1 trigger -> 1 séquence)
INSERT INTO public.email_sequences (name, trigger_event, is_active) VALUES
('Activation - jamais généré', 'not_activated', true);

-- 3. L'étape unique (envoi immédiat à la mise en file, qui a déjà lieu 24h+ après l'inscription)
INSERT INTO public.email_sequence_steps (sequence_id, step_number, delay_hours, template_id) VALUES
(
  (SELECT id FROM public.email_sequences WHERE trigger_event = 'not_activated' LIMIT 1),
  1,
  0,
  (SELECT id FROM public.email_templates WHERE name = 'Relance activation - jamais généré' LIMIT 1)
);
