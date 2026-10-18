-- 18/10/2026 — Coupure des e-mails génériques (choix de Laetitia).
-- Mesure sur 90 jours (clientes) : ~300 envois, 10 clics. Rien n'est effacé :
-- chaque e-mail est éteint par son interrupteur `is_active`, et se rallume :
--   * séquence entière → page admin, onglet E-mails (interrupteur par séquence),
--   * « Tips branding J+3 » et « Teaser premium » (étapes 2 et 3 de la séquence
--     d'inscription, dont la Bienvenue reste active) →
--     UPDATE public.email_templates SET is_active = true WHERE name IN ('Tips branding J+3', 'Teaser premium');
-- GARDÉS : Bienvenue, Paiement échoué, Abonnement activé, échec d'une publication
-- programmée, et les e-mails du système de connexion (confirmation, mot de passe).
-- Le bilan du lundi (cron-health, emails-coupes.ts) vérifie qu'ils ne repartent pas.

UPDATE public.email_sequences
SET is_active = false
WHERE trigger_event IN (
  'weekly_digest',            -- Rendez-vous hebdo - idées de la semaine
  'inactive_7d',              -- Relance inactive 7j (déjà éteinte)
  'inactive_14d',             -- Relance inactive 14j (déjà éteinte)
  'inactive_30d',             -- Relance inactive 30j
  'not_activated',            -- Relance activation - jamais généré
  'credits_exhausted',        -- Crédits épuisés
  'forgotten_draft_reminder', -- Rappel contenu jamais publié
  'monthly_stats_report',     -- Rapport mensuel - stats Instagram
  'subscription_cancelled'    -- Win-back résiliation
);

UPDATE public.email_templates
SET is_active = false, updated_at = now()
WHERE name IN ('Tips branding J+3', 'Teaser premium');

-- Ce qui attendait déjà son tour dans la file ne part plus non plus.
UPDATE public.email_queue q
SET cancelled = true
WHERE q.sent = false AND q.cancelled = false
  AND (
    q.sequence_id IN (SELECT id FROM public.email_sequences WHERE is_active = false)
    OR q.step_id IN (
      SELECT st.id FROM public.email_sequence_steps st
      JOIN public.email_templates t ON t.id = st.template_id
      WHERE t.is_active = false
    )
  );
