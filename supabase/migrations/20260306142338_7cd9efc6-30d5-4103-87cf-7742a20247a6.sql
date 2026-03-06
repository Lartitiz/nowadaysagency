-- 1. Templates
INSERT INTO public.email_templates (name, subject, html_body, category, variables) VALUES
(
  'Bienvenue',
  'Bienvenue dans L''Assistant Com'' !',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FFF4F8;padding:40px 20px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;">
      <div style="text-align:center;padding:32px 40px 16px;">
        <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#91014b;">Nowadays</h1>
      </div>
      <div style="padding:0 40px;"><div style="height:2px;background:#FB3D80;border-radius:1px;"></div></div>
      <div style="padding:28px 40px 36px;">
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Hey {{prenom}} 👋</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Bienvenue dans <strong>L''Assistant Com''</strong> ! Tu as bien fait de te lancer — c''est le premier pas pour structurer ta communication sans y passer tes nuits.</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Ton espace est prêt. Voici ce que tu peux faire dès maintenant :</p>
        <ul style="font-size:15px;color:#1A1A1A;line-height:1.8;padding-left:20px;">
          <li>🔍 <strong>Auditer ton profil Instagram</strong> pour savoir où tu en es vraiment</li>
          <li>✍️ <strong>Définir ta proposition de valeur</strong> — ce qui te différencie</li>
          <li>📝 <strong>Générer ton premier contenu</strong> avec l''IA</li>
        </ul>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Tu as <strong>10 crédits IA gratuits</strong> pour explorer. Pas de piège, pas d''engagement.</p>
        <div style="text-align:center;margin:28px 0 8px;">
          <a href="{{app_url}}/dashboard" style="display:inline-block;background:#FB3D80;color:#fff;font-size:15px;font-weight:bold;text-decoration:none;padding:12px 32px;border-radius:25px;">Découvrir mon espace</a>
        </div>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">À très vite,<br><span style="color:#91014b;font-family:Georgia,serif;">Laetitia</span></p>
      </div>
      <div style="padding:24px 40px;background:#FFF4F8;border-top:1px solid #f0e0e8;">
        <p style="font-size:12px;color:#999;text-align:center;">Tu reçois cet email car tu es inscrite sur <a href="{{app_url}}" style="color:#FB3D80;">L''Assistant Com''</a>.</p>
        <p style="font-size:11px;color:#bbb;text-align:center;">Nowadays Agency · Joigny, France · <a href="{{app_url}}/parametres" style="color:#bbb;">Se désinscrire</a></p>
      </div>
    </div>
  </div>',
  'transactional',
  ARRAY['prenom', 'app_url']
),
(
  'Tips branding J+3',
  'Le secret des comptes qui percent (indice : c''est pas l''algorithme)',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FFF4F8;padding:40px 20px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;">
      <div style="text-align:center;padding:32px 40px 16px;">
        <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#91014b;">Nowadays</h1>
      </div>
      <div style="padding:0 40px;"><div style="height:2px;background:#FB3D80;border-radius:1px;"></div></div>
      <div style="padding:28px 40px 36px;">
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Hey {{prenom}} 👋</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Ça fait 3 jours que tu es sur L''Assistant Com''. Et si je te disais que la différence entre un compte qui stagne et un compte qui décolle, c''est rarement l''algorithme ?</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">C''est la <strong>clarté de ton positionnement</strong>.</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Mon conseil du jour : va relire ta bio Instagram. Est-ce qu''elle explique en 3 secondes ce que tu fais, pour qui, et pourquoi toi ?</p>
        <div style="text-align:center;margin:28px 0 8px;">
          <a href="{{app_url}}/branding" style="display:inline-block;background:#FB3D80;color:#fff;font-size:15px;font-weight:bold;text-decoration:none;padding:12px 32px;border-radius:25px;">Travailler mon branding</a>
        </div>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Bonne exploration,<br><span style="color:#91014b;font-family:Georgia,serif;">Laetitia</span></p>
      </div>
      <div style="padding:24px 40px;background:#FFF4F8;border-top:1px solid #f0e0e8;">
        <p style="font-size:12px;color:#999;text-align:center;">Tu reçois cet email car tu es inscrite sur <a href="{{app_url}}" style="color:#FB3D80;">L''Assistant Com''</a>.</p>
        <p style="font-size:11px;color:#bbb;text-align:center;">Nowadays Agency · Joigny, France · <a href="{{app_url}}/parametres" style="color:#bbb;">Se désinscrire</a></p>
      </div>
    </div>
  </div>',
  'nurturing',
  ARRAY['prenom', 'app_url']
),
(
  'Crédits épuisés',
  'Tes 10 crédits IA sont utilisés !',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FFF4F8;padding:40px 20px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;">
      <div style="text-align:center;padding:32px 40px 16px;">
        <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#91014b;">Nowadays</h1>
      </div>
      <div style="padding:0 40px;"><div style="height:2px;background:#FB3D80;border-radius:1px;"></div></div>
      <div style="padding:28px 40px 36px;">
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Hey {{prenom}} 👋</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Tes 10 crédits gratuits sont épuisés — et franchement, bravo. Ça veut dire que tu as testé, exploré, et commencé à poser les bases de ta com''. 💪</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Pour continuer avec 300 crédits/mois, des audits illimités et un calendrier éditorial intelligent :</p>
        <div style="text-align:center;margin:28px 0 8px;">
          <a href="{{app_url}}/abonnement" style="display:inline-block;background:#FB3D80;color:#fff;font-size:15px;font-weight:bold;text-decoration:none;padding:12px 32px;border-radius:25px;">Voir les plans</a>
        </div>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Pas de pression. Ton espace reste accessible.</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">À bientôt,<br><span style="color:#91014b;font-family:Georgia,serif;">Laetitia</span></p>
      </div>
      <div style="padding:24px 40px;background:#FFF4F8;border-top:1px solid #f0e0e8;">
        <p style="font-size:12px;color:#999;text-align:center;">Tu reçois cet email car tu es inscrite sur <a href="{{app_url}}" style="color:#FB3D80;">L''Assistant Com''</a>.</p>
        <p style="font-size:11px;color:#bbb;text-align:center;">Nowadays Agency · Joigny, France · <a href="{{app_url}}/parametres" style="color:#bbb;">Se désinscrire</a></p>
      </div>
    </div>
  </div>',
  'transactional',
  ARRAY['prenom', 'app_url']
),
(
  'Relance inactive 7j',
  'Ta com'' t''attend (et elle est pas rancunière)',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FFF4F8;padding:40px 20px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;">
      <div style="text-align:center;padding:32px 40px 16px;">
        <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#91014b;">Nowadays</h1>
      </div>
      <div style="padding:0 40px;"><div style="height:2px;background:#FB3D80;border-radius:1px;"></div></div>
      <div style="padding:28px 40px 36px;">
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Hey {{prenom}} 👋</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Ça fait une semaine qu''on ne t''a pas vue. Ta communication, elle, n''a pas bougé non plus. (Mais elle est pas rancunière, promis.)</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;"><strong>10 minutes suffisent</strong> pour avancer. Mini-défi : lance un audit de ton profil Instagram. En 2 minutes, tu sauras quoi améliorer en priorité.</p>
        <div style="text-align:center;margin:28px 0 8px;">
          <a href="{{app_url}}/instagram/audit" style="display:inline-block;background:#FB3D80;color:#fff;font-size:15px;font-weight:bold;text-decoration:none;padding:12px 32px;border-radius:25px;">Relancer mon audit</a>
        </div>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">On est là si tu as besoin,<br><span style="color:#91014b;font-family:Georgia,serif;">Laetitia</span></p>
      </div>
      <div style="padding:24px 40px;background:#FFF4F8;border-top:1px solid #f0e0e8;">
        <p style="font-size:12px;color:#999;text-align:center;">Tu reçois cet email car tu es inscrite sur <a href="{{app_url}}" style="color:#FB3D80;">L''Assistant Com''</a>.</p>
        <p style="font-size:11px;color:#bbb;text-align:center;">Nowadays Agency · Joigny, France · <a href="{{app_url}}/parametres" style="color:#bbb;">Se désinscrire</a></p>
      </div>
    </div>
  </div>',
  'nurturing',
  ARRAY['prenom', 'app_url']
),
(
  'Teaser premium',
  'Et si ta com'' devenait un jeu ?',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FFF4F8;padding:40px 20px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;">
      <div style="text-align:center;padding:32px 40px 16px;">
        <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#91014b;">Nowadays</h1>
      </div>
      <div style="padding:0 40px;"><div style="height:2px;background:#FB3D80;border-radius:1px;"></div></div>
      <div style="padding:28px 40px 36px;">
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Hey {{prenom}} 👋</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Ça fait 2 semaines que tu utilises L''Assistant Com''. Tu as posé les bases. Et si tu pouvais aller plus loin, sans y passer plus de temps ?</p>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">Le plan Assistant Com'' :</p>
        <ul style="font-size:15px;color:#1A1A1A;line-height:1.8;padding-left:20px;">
          <li>📊 <strong>300 crédits IA / mois</strong></li>
          <li>📅 <strong>Calendrier éditorial intelligent</strong></li>
          <li>🤝 <strong>CRM de prospection</strong></li>
          <li>💬 <strong>Communauté privée</strong></li>
        </ul>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">À partir de 29€/mois. Sans engagement.</p>
        <div style="text-align:center;margin:28px 0 8px;">
          <a href="{{app_url}}/abonnement" style="display:inline-block;background:#FB3D80;color:#fff;font-size:15px;font-weight:bold;text-decoration:none;padding:12px 32px;border-radius:25px;">Découvrir les plans</a>
        </div>
        <p style="font-size:16px;color:#1A1A1A;line-height:1.6;">À très vite,<br><span style="color:#91014b;font-family:Georgia,serif;">Laetitia</span></p>
      </div>
      <div style="padding:24px 40px;background:#FFF4F8;border-top:1px solid #f0e0e8;">
        <p style="font-size:12px;color:#999;text-align:center;">Tu reçois cet email car tu es inscrite sur <a href="{{app_url}}" style="color:#FB3D80;">L''Assistant Com''</a>.</p>
        <p style="font-size:11px;color:#bbb;text-align:center;">Nowadays Agency · Joigny, France · <a href="{{app_url}}/parametres" style="color:#bbb;">Se désinscrire</a></p>
      </div>
    </div>
  </div>',
  'nurturing',
  ARRAY['prenom', 'app_url']
);

-- 2. Séquences
INSERT INTO public.email_sequences (name, trigger_event, is_active) VALUES
('Séquence bienvenue', 'signup', true),
('Relance inactivité', 'inactive_7d', true),
('Crédits épuisés', 'credits_exhausted', true);

-- 3. Steps (sous-requêtes pour récupérer les IDs)
INSERT INTO public.email_sequence_steps (sequence_id, step_number, delay_hours, template_id) VALUES
((SELECT id FROM public.email_sequences WHERE trigger_event = 'signup' LIMIT 1), 1, 0, (SELECT id FROM public.email_templates WHERE name = 'Bienvenue' LIMIT 1)),
((SELECT id FROM public.email_sequences WHERE trigger_event = 'signup' LIMIT 1), 2, 72, (SELECT id FROM public.email_templates WHERE name = 'Tips branding J+3' LIMIT 1)),
((SELECT id FROM public.email_sequences WHERE trigger_event = 'signup' LIMIT 1), 3, 336, (SELECT id FROM public.email_templates WHERE name = 'Teaser premium' LIMIT 1)),
((SELECT id FROM public.email_sequences WHERE trigger_event = 'inactive_7d' LIMIT 1), 1, 0, (SELECT id FROM public.email_templates WHERE name = 'Relance inactive 7j' LIMIT 1)),
((SELECT id FROM public.email_sequences WHERE trigger_event = 'credits_exhausted' LIMIT 1), 1, 0, (SELECT id FROM public.email_templates WHERE name = 'Crédits épuisés' LIMIT 1));