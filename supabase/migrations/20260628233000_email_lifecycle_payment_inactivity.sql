-- E-mails cycle de vie : paiement (activation / échec / résiliation) + escalade d'inactivité 14j/30j.
-- Déclenchés par : stripe-webhook (subscription_activated / payment_failed / subscription_cancelled)
-- et email-trigger handleCheckInactive (inactive_14d / inactive_30d).

-- Wrapper HTML commun (charte Nowadays) repris du seed existant.

-- 1) Templates
INSERT INTO public.email_templates (name, subject, html_body, category, variables) VALUES
(
  'Abonnement activé - Premium',
  '{{prenom}}, bienvenue en Premium 🎉',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FFF4F8;padding:40px 20px;"><div style="background:#fff;border-radius:12px;overflow:hidden;"><div style="text-align:center;padding:32px 40px 16px;"><h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#91014b;">Nowadays</h1></div><div style="padding:0 40px;"><div style="height:2px;background:#FB3D80;border-radius:1px;"></div></div><div style="padding:28px 40px 36px;"><p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Hey {{prenom}} 🎉</p><p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Ton abonnement <strong>Premium</strong> est actif — merci pour ta confiance. Tu débloques la création généreuse, la qualité max, la publication directe et le multi-réseaux.</p><p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Le meilleur moyen d''en profiter : créer ton prochain contenu maintenant.</p><div style="text-align:center;padding:24px 0 8px;"><a href="{{app_url}}/creer" style="display:inline-block;background:#FB3D80;color:#fff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:999px;">✍️ Créer un contenu</a></div><p style="font-size:14px;color:#6B6B6B;line-height:1.6;text-align:center;">Une question ? Réponds à cet email, je lis tout. 🌸</p></div></div></div>',
  'transactional',
  ARRAY['prenom', 'app_url']
),
(
  'Paiement échoué',
  '{{prenom}}, ton paiement n''est pas passé 💳',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FFF4F8;padding:40px 20px;"><div style="background:#fff;border-radius:12px;overflow:hidden;"><div style="text-align:center;padding:32px 40px 16px;"><h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#91014b;">Nowadays</h1></div><div style="padding:0 40px;"><div style="height:2px;background:#FB3D80;border-radius:1px;"></div></div><div style="padding:28px 40px 36px;"><p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Hey {{prenom}},</p><p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Ton dernier paiement n''a pas pu être traité (carte expirée, plafond…). Pas de panique : ton compte reste actif quelques jours. Mets à jour tes informations pour ne rien perdre.</p><div style="text-align:center;padding:24px 0 8px;"><a href="{{app_url}}/parametres" style="display:inline-block;background:#FB3D80;color:#fff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:999px;">Mettre à jour mon paiement</a></div><p style="font-size:14px;color:#6B6B6B;line-height:1.6;text-align:center;">Un souci ? Réponds à cet email, on règle ça ensemble. 🌸</p></div></div></div>',
  'transactional',
  ARRAY['prenom', 'app_url']
),
(
  'Win-back résiliation',
  '{{prenom}}, la porte reste ouverte 🌸',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FFF4F8;padding:40px 20px;"><div style="background:#fff;border-radius:12px;overflow:hidden;"><div style="text-align:center;padding:32px 40px 16px;"><h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#91014b;">Nowadays</h1></div><div style="padding:0 40px;"><div style="height:2px;background:#FB3D80;border-radius:1px;"></div></div><div style="padding:28px 40px 36px;"><p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Hey {{prenom}},</p><p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Ton abonnement est bien résilié — aucun souci, tu gardes l''accès gratuit avec tes fondations et ton calendrier. Si quelque chose n''allait pas, j''aimerais beaucoup le savoir : réponds-moi en un mot.</p><p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Et si l''envie revient, tu peux réactiver le Premium quand tu veux, en un clic.</p><div style="text-align:center;padding:24px 0 8px;"><a href="{{app_url}}/dashboard" style="display:inline-block;background:#FB3D80;color:#fff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:999px;">Revenir sur mon espace</a></div></div></div></div>',
  'retention',
  ARRAY['prenom', 'app_url']
),
(
  'Relance inactive 14j',
  '{{prenom}}, on reprend là où tu t''es arrêtée ?',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FFF4F8;padding:40px 20px;"><div style="background:#fff;border-radius:12px;overflow:hidden;"><div style="text-align:center;padding:32px 40px 16px;"><h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#91014b;">Nowadays</h1></div><div style="padding:0 40px;"><div style="height:2px;background:#FB3D80;border-radius:1px;"></div></div><div style="padding:28px 40px 36px;"><p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Hey {{prenom}},</p><p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Ça fait deux semaines — la régularité, c''est ce qui paie en com''. Bonne nouvelle : avec ton branding déjà en place, un contenu te prend deux minutes. On s''y remet ?</p><div style="text-align:center;padding:24px 0 8px;"><a href="{{app_url}}/creer" style="display:inline-block;background:#FB3D80;color:#fff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:999px;">✍️ Créer un contenu</a></div></div></div></div>',
  'retention',
  ARRAY['prenom', 'app_url']
),
(
  'Relance inactive 30j',
  '{{prenom}}, ta com'' t''attend toujours 🌸',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FFF4F8;padding:40px 20px;"><div style="background:#fff;border-radius:12px;overflow:hidden;"><div style="text-align:center;padding:32px 40px 16px;"><h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#91014b;">Nowadays</h1></div><div style="padding:0 40px;"><div style="height:2px;background:#FB3D80;border-radius:1px;"></div></div><div style="padding:28px 40px 36px;"><p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Hey {{prenom}},</p><p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Un mois sans publier, ça arrive — la vie va vite. Ton espace est intact : ton branding, tes idées, ton calendrier t''attendent. Un seul contenu suffit pour relancer la machine.</p><p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Dis-moi si je peux t''aider à débloquer quelque chose — réponds simplement à cet email.</p><div style="text-align:center;padding:24px 0 8px;"><a href="{{app_url}}/creer" style="display:inline-block;background:#FB3D80;color:#fff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:999px;">Reprendre ma com''</a></div></div></div></div>',
  'retention',
  ARRAY['prenom', 'app_url']
);

-- 2) Séquences (1 trigger -> 1 séquence)
INSERT INTO public.email_sequences (name, trigger_event, is_active) VALUES
('Abonnement activé', 'subscription_activated', true),
('Paiement échoué', 'payment_failed', true),
('Win-back résiliation', 'subscription_cancelled', true),
('Inactivité 14 jours', 'inactive_14d', true),
('Inactivité 30 jours', 'inactive_30d', true);

-- 3) Étapes (1 email immédiat par séquence)
INSERT INTO public.email_sequence_steps (sequence_id, step_number, delay_hours, template_id) VALUES
((SELECT id FROM public.email_sequences WHERE trigger_event = 'subscription_activated' LIMIT 1), 1, 0, (SELECT id FROM public.email_templates WHERE name = 'Abonnement activé - Premium' LIMIT 1)),
((SELECT id FROM public.email_sequences WHERE trigger_event = 'payment_failed' LIMIT 1), 1, 0, (SELECT id FROM public.email_templates WHERE name = 'Paiement échoué' LIMIT 1)),
((SELECT id FROM public.email_sequences WHERE trigger_event = 'subscription_cancelled' LIMIT 1), 1, 0, (SELECT id FROM public.email_templates WHERE name = 'Win-back résiliation' LIMIT 1)),
((SELECT id FROM public.email_sequences WHERE trigger_event = 'inactive_14d' LIMIT 1), 1, 0, (SELECT id FROM public.email_templates WHERE name = 'Relance inactive 14j' LIMIT 1)),
((SELECT id FROM public.email_sequences WHERE trigger_event = 'inactive_30d' LIMIT 1), 1, 0, (SELECT id FROM public.email_templates WHERE name = 'Relance inactive 30j' LIMIT 1));
