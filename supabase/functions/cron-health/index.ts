// Edge « cron-health » — santé de l'app AGRÉGÉE, lisible par les crons de surveillance
// (visite-guidee-quotidienne étape 8bis en scope "daily", routine-hebdo-lundi en scope "weekly").
//
// scope "daily"  : santé des publications réelles — posts en échec, posts bloqués,
//                  programmés en retard (= cron pg de publication mort ?), tokens
//                  sociaux expirés/expirants (LinkedIn ne se refresh pas seul, ~60 j),
//                  retours bêta (beta_feedback) des 24 h, les « blocking » d'abord,
//                  et total encore en statut "new" (backstop si un run saute),
//                  crédits Photoroom restants (épuisés = 402 sur toutes les retouches),
//                  budget images Higgsfield du mois (aussi en weekly) — bloc `higgsfield`,
//                  + SANTÉ DE LA FACTURATION (incident Stripe 24-31/07) : événements que
//                  Stripe n'arrive pas à livrer, abonnements payés sans accès en base,
//                  périodes de facturation périmées — voir le bloc `facturation`.
// scope "weekly" : coûts IA (tokens par modèle, 7 j vs 7 j précédents), coûts estimés
//                  en € (texte Anthropic + images gpt-image/Photoroom/Recraft), usage
//                  (action_type), rétention par cohorte hebdo d'inscription,
//                  volume de publications, + QUALITÉ de la génération de contenu
//                  (score de gate agrégé, retravail, funnel par format, échantillon
//                  à juger) — voir le bloc `qualite`.
//
// Sécurité : lecture seule, pas de PII en sortie (compteurs, plateformes, erreurs
// tronquées ; les noms de comptes sociaux sont des handles publics ; le texte des
// feedbacks bêta est du contenu écrit POUR l'admin, tronqué, sans identité de
// l'autrice). Gardé par le même secret partagé que activation-funnel :
// `CRON_STATS_SECRET` (header x-cron-secret).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalEmail, isTestAccountEmail } from "../_shared/internal-accounts.ts";
import { fetchAllRows } from "./lecture.ts";
import { bilanQuotidien } from "./quotidien.ts";
import { bilanHebdo } from "./hebdo.ts";

// Comptes internes exclus : liste UNIQUE partagée avec activation-funnel et
// admin-users (_shared/internal-accounts.ts — avant le 05/10/2026 cette edge n'en
// excluait qu'une partie et la recette gonflait le bilan hebdo).
const isExcludedEmail = isInternalEmail;
// Le scope daily surveille les publications RÉELLES : le compte admin de Laetitia y
// reste inclus (c'est notamment SA connexion LinkedIn ~60 j qu'il faut attraper) —
// seuls les comptes de test en sortent. Le scope weekly exclut aussi l'admin (stats).
const isTestEmail = isTestAccountEmail;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const secret = Deno.env.get("CRON_STATS_SECRET");
    if (!secret || req.headers.get("x-cron-secret") !== secret) {
      return json({ error: "Unauthorized" }, 401);
    }
    const scope = (await req.json().catch(() => ({})))?.scope === "weekly" ? "weekly" : "daily";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const profiles = await fetchAllRows(supabase, "profiles", "user_id, email, created_at");
    const excludeFn = scope === "daily" ? isTestEmail : isExcludedEmail;
    const excludedIds = new Set(
      profiles.filter((p: any) => excludeFn(p.email)).map((p: any) => p.user_id),
    );
    const isClient = (userId: string) => !excludedIds.has(userId);
    const now = Date.now();
    const emailOf = new Map<string, string>(profiles.map((p: any) => [p.user_id, p.email]));

    if (scope === "daily") {
      const bilan = await bilanQuotidien({ supabase, now, isClient, emailOf });
      return json({ generated_at: new Date().toISOString(), scope, ...bilan });
    }

    const bilan = await bilanHebdo({ supabase, now, profiles, isClient, emailOf });
    return json({ generated_at: new Date().toISOString(), scope, ...bilan });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});