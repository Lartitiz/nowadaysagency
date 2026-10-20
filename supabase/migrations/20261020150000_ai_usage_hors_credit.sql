-- 20/10/2026 : appels IA comptés SANS débiter de crédit (audit de coût API,
-- docs/audit-cout-api-anthropic-2026-10.md, paquet a).
--
-- Pourquoi une table à part et pas des lignes dans ai_usage : une ligne
-- ai_usage = un crédit pour tous les compteurs (checkQuota, record_ai_usage,
-- studio_confirm/complete_generation, check-subscription, compteur affiché,
-- e-mails de crédits). Y écrire des appels « gratuits » ferait consommer des
-- crédits et fausserait ces compteurs.
--
-- Ce qui est rangé ici (colonne `source`) :
--   * compte_test          : générations du compte de recette Camille (visite du
--                            matin, tests réels), jusqu'ici invisibles ;
--   * inscription          : diagnostic gratuit de l'inscription + enrichissement ;
--   * etape_gratuite       : étapes gratuites de creative-flow (angles, accroches,
--                            questions, dictée, suite) : sert aussi de compteur
--                            pour leur plafond quotidien ;
--   * passerelle_lovable   : fonctions Gemini via la passerelle Lovable
--                            (mini-audit Instagram, mots-clés photo, insight engagement) ;
--   * passe_interne        : appels internes d'une génération déjà facturée
--                            (ex. enrichissement Opus d'un diagnostic hors inscription).
-- Lue par cron-health (bilan du lundi) pour le coût estimé total.
-- user_id peut être NULL : le mini-audit Instagram est public (sans compte).

CREATE TABLE IF NOT EXISTS public.ai_usage_hors_credit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  workspace_id uuid,
  source text NOT NULL,
  action_type text NOT NULL,
  model_used text,
  tokens_used integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_hors_credit_created
  ON public.ai_usage_hors_credit (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_hors_credit_user_source
  ON public.ai_usage_hors_credit (user_id, source, created_at);

-- Écrite et lue uniquement par les fonctions (clé service) : aucune policy.
ALTER TABLE public.ai_usage_hors_credit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_hors_credit FROM anon, authenticated;
