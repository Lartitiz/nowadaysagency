// Analyse IA des stats. Deux modes :
// - "monthly_stats" (page Mes stats) : analyse du MOIS sélectionné avec les vraies
//   colonnes de monthly_stats, comparé aux mois PRÉCÉDENTS (jamais à lui-même —
//   l'ancien code lisait des champs hebdo inexistants et comparait le mois courant
//   à history[0] = lui-même, d'où des « stagnation » systématiques et faux).
// - défaut (legacy hebdo) : conservé à l'identique par prudence.
// Gratuit (non décompté du quota), rate-limité. Gate rédactionnel : chiffres du
// texte ⊆ chiffres des données (liste blanche), une passe corrective si besoin.
import { getCorsHeaders } from "../_shared/cors.ts";
import { validateInput, ValidationError, EngagementInsightSchema } from "../_shared/input-validators.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { numbersIn, analyzeTextRedac, buildTextFixInstructions } from "../_shared/redac-gate.ts";

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function monthLabel(dateStr: unknown): string {
  const d = new Date(String(dateStr || ""));
  if (isNaN(d.getTime())) return "ce mois";
  return `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// "+12 %" / "-8 %" / "stable" ; null si pas comparable.
function variation(cur: number | null, prev: number | null): string | null {
  if (cur == null || prev == null || prev === 0) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (Math.abs(pct) <= 2) return "stable";
  return pct > 0 ? `+${pct} %` : `${pct} %`;
}

// Une ligne de métrique mensuelle avec variation vs mois précédent, ou null si absente.
function line(label: string, cur: number | null, prev: number | null): string | null {
  if (cur == null) return null;
  const v = variation(cur, prev);
  return `${label} : ${cur}${v ? ` (${v} vs mois précédent)` : ""}`;
}

async function callGateway(system: string, prompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!aiResponse.ok) {
    const status = aiResponse.status;
    if (status === 429) throw new Error("Trop de requêtes, réessaie dans un moment.");
    if (status === 402) throw new Error("Crédits IA insuffisants.");
    throw new Error(`AI gateway error: ${status}`);
  }
  const aiData = await aiResponse.json();
  return (aiData.choices?.[0]?.message?.content || "").trim();
}

// ── Mode mensuel (page Mes stats) ─────────────────────────────────────────────
async function monthlyInsight(current: Record<string, unknown>, history: Record<string, unknown>[]): Promise<string> {
  // Jamais comparer le mois à lui-même : on ne garde que les mois STRICTEMENT
  // antérieurs, du plus récent au plus ancien (défense en profondeur, le front
  // filtre déjà).
  const curDate = String(current.month_date || "");
  const prevMonths = (history || [])
    .filter((h) => h && typeof h.month_date === "string" && (!curDate || (h.month_date as string) < curDate))
    .sort((a, b) => String(b.month_date).localeCompare(String(a.month_date)))
    .slice(0, 6);
  const prev = prevMonths[0] ?? null;

  const g = (row: Record<string, unknown> | null, k: string) => (row ? num(row[k]) : null);

  const engRate = (row: Record<string, unknown> | null): number | null => {
    const engaged = g(row, "accounts_engaged") ?? g(row, "interactions");
    const reach = g(row, "reach");
    if (engaged == null || reach == null || reach === 0) return null;
    return Math.round((engaged / reach) * 1000) / 10;
  };

  const lines = [
    line("Abonné·es", g(current, "followers"), g(prev, "followers")),
    line("Abonné·es gagné·es", g(current, "followers_gained"), g(prev, "followers_gained")),
    line("Abonné·es perdu·es", g(current, "followers_lost"), g(prev, "followers_lost")),
    line("Portée (comptes touchés)", g(current, "reach"), g(prev, "reach")),
    line("Vues", g(current, "views"), g(prev, "views")),
    line("Interactions", g(current, "interactions"), g(prev, "interactions")),
    line("Comptes ayant interagi", g(current, "accounts_engaged"), g(prev, "accounts_engaged")),
    line("Taux d'engagement (comptes engagés ÷ portée, en %)", engRate(current), engRate(prev)),
    line("Visites du profil", g(current, "profile_visits"), g(prev, "profile_visits")),
    line("Clics vers le site", g(current, "website_clicks"), g(prev, "website_clicks")),
    line("Nouveaux inscrits email", g(current, "email_signups"), g(prev, "email_signups")),
  ].filter(Boolean) as string[];

  if (!lines.length) {
    return "Il n'y a pas encore assez de chiffres remplis ce mois-ci pour une analyse fiable. Renseigne au moins ta portée et tes interactions, puis relance l'analyse.";
  }

  // Tendance de fond sur l'historique (du plus ancien au plus récent).
  const trendParts: string[] = [];
  if (prevMonths.length >= 2) {
    const oldest = prevMonths[prevMonths.length - 1];
    const f0 = g(oldest, "followers"), f1 = g(current, "followers");
    if (f0 != null && f1 != null) {
      trendParts.push(`abonné·es ${f0} → ${f1} entre ${monthLabel(oldest.month_date)} et ${monthLabel(curDate)}`);
    }
    const r0 = g(oldest, "reach"), r1 = g(current, "reach");
    if (r0 != null && r1 != null) trendParts.push(`portée ${r0} → ${r1}`);
  }

  const objective = typeof current.objective === "string" && current.objective.trim()
    ? `\nOBJECTIF DÉCLARÉ DU MOIS : ${current.objective.trim()}` : "";

  const metricsText =
    `MOIS ANALYSÉ : ${monthLabel(curDate)}${prev ? ` (comparé à ${monthLabel(prev.month_date)})` : " (premier mois suivi : pas de comparaison possible)"}\n` +
    lines.join("\n") +
    (trendParts.length ? `\nTENDANCE DE FOND (${prevMonths.length + 1} mois) : ${trendParts.join(" ; ")}` : "") +
    objective;

  const system =
    "Tu es experte en stratégie Instagram pour des solopreneuses créatives. Tu réponds en français, tutoiement, direct et concret, sans jargon ni emphase.";

  const basePrompt = `Voici les statistiques Instagram mensuelles d'une utilisatrice :

${metricsText}

Écris une courte analyse (3 à 5 phrases, un seul paragraphe) :
- commence par LA tendance la plus significative du mois (appuie-toi sur les variations fournies : ne dis jamais « stable » si les chiffres montrent une hausse ou une baisse)
- donne une explication plausible, formulée comme une hypothèse
- termine par UNE action concrète et précise pour le mois prochain
- cite au maximum 2 chiffres, uniquement ceux fournis ci-dessus (jamais de chiffre inventé)
- interdit : « Spoiler », « Ce n'est pas X, c'est Y », listes à puces, hashtags, questions rhétoriques en série`;

  let insight = await callGateway(system, basePrompt);

  // Gate rédactionnel : chiffres du texte ⊆ chiffres des données (+ arrondis),
  // tics bannis. Une seule passe corrective, puis on rend tel quel.
  const allowed = numbersIn(metricsText);
  for (const v of [...allowed]) {
    const f = parseFloat(v);
    if (Number.isFinite(f)) allowed.add(String(Math.round(f)));
  }
  const analysis = analyzeTextRedac(insight, allowed);
  const fix = buildTextFixInstructions(analysis);
  if (fix) {
    insight = await callGateway(
      system,
      `${basePrompt}\n\nTa première version comportait ces problèmes, corrige-les en réécrivant l'analyse complète :\n${fix}\n\nPremière version :\n${insight}`,
    );
  }
  return insight;
}

// ── Mode hebdo legacy (conservé à l'identique) ───────────────────────────────
// deno-lint-ignore no-explicit-any
async function weeklyInsight(currentWeek: Record<string, any>, history: Record<string, any>[] | null | undefined): Promise<string> {
  const prevWeek = history?.[0];

  function vari(curr: number | null, prev: number | null) {
    if (curr == null || prev == null || prev === 0) return "N/A";
    const pct = Math.round(((curr - prev) / prev) * 100);
    return pct > 0 ? `+${pct}%` : `${pct}%`;
  }

  const metricsText = `
Abonné·es : ${currentWeek.followers ?? "?"} (${prevWeek ? vari(currentWeek.followers, prevWeek.followers) : "1ère semaine"})
Reach moyen/post : ${currentWeek.avg_reach ?? "?"} (${prevWeek ? vari(currentWeek.avg_reach, prevWeek.avg_reach) : ""})
Likes moyen/post : ${currentWeek.avg_likes ?? "?"} (${prevWeek ? vari(currentWeek.avg_likes, prevWeek.avg_likes) : ""})
Saves moyen/post : ${currentWeek.avg_saves ?? "?"} (${prevWeek ? vari(currentWeek.avg_saves, prevWeek.avg_saves) : ""})
DM reçus : ${currentWeek.dm_received ?? "?"} (${prevWeek ? vari(currentWeek.dm_received, prevWeek.dm_received) : ""})
Visites profil : ${currentWeek.profile_visits ?? "?"} (${prevWeek ? vari(currentWeek.profile_visits, prevWeek.profile_visits) : ""})
Clics lien bio : ${currentWeek.link_clicks ?? "?"} (${prevWeek ? vari(currentWeek.link_clicks, prevWeek.link_clicks) : ""})
  `.trim();

  const prompt = `Tu es experte en stratégie Instagram.

MÉTRIQUES DE LA SEMAINE :
${metricsText}

Génère 1-2 phrases d'insight :
- Identifie la tendance la plus notable
- Donne une explication possible
- Suggère une action concrète
- Ton : direct, encourageant, pas de jargon
- Max 2 phrases courtes
- Ne commence PAS par "Tes" systématiquement, varie les tournures`;

  return callGateway("Tu réponds en français. Tu es directe et concrète. Max 2 phrases.", prompt);
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await authenticateRequest(req);

    // Décision produit : engagement-insight reste GRATUIT (non décompté du quota).
    // On garde un rate-limit pour empêcher le spam de l'IA, sans facturer de crédit.
    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    const { currentWeek, history, mode } = validateInput(await req.json(), EngagementInsightSchema);

    const insight = mode === "monthly_stats"
      ? await monthlyInsight(currentWeek as Record<string, unknown>, (history || []) as Record<string, unknown>[])
      : await weeklyInsight(currentWeek, history);

    if (!insight) {
      return new Response(JSON.stringify({ error: "L'IA n'a renvoyé aucun insight, réessaie." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ insight }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const status = e instanceof ValidationError ? 400 : 500;
    const msg = e instanceof ValidationError ? (e instanceof Error ? e.message : "Validation error") : "Erreur interne du serveur";
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
