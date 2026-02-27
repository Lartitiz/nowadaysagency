import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropic, getModelForAction } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const ICON_MAP: Record<string, string> = {
  branding: "Palette",
  persona: "Users",
  story: "PenLine",
  proposition: "Target",
  calendar: "CalendarDays",
  calendrier: "CalendarDays",
  post: "PenLine",
  instagram: "PenLine",
  linkedin: "PenLine",
  carrousel: "Layers",
  carousel: "Layers",
  reels: "Film",
  newsletter: "Mail",
  audit: "Search",
  idées: "Lightbulb",
  idees: "Lightbulb",
  contenu: "Sparkles",
  créer: "Sparkles",
  creer: "Sparkles",
  site: "Globe",
  pinterest: "Pin",
  ton: "MessageCircle",
  offres: "ShoppingBag",
  charte: "Palette",
};

function guessIcon(route: string, label: string): string {
  const text = (route + " " + label).toLowerCase();
  for (const [key, icon] of Object.entries(ICON_MAP)) {
    if (text.includes(key)) return icon;
  }
  return "ArrowRight";
}

/** Parse [ACTION_LINK:/route|Label] from AI text */
function parseActionLinks(text: string): { cleanText: string; actions: Array<{ route: string; label: string; icon: string }> } {
  const actions: Array<{ route: string; label: string; icon: string }> = [];
  const regex = /\[ACTION_LINK:([^\]|]+)\|([^\]]+)\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const route = match[1].trim();
    const label = match[2].trim();
    actions.push({ route, label, icon: guessIcon(route, label) });
  }
  const cleanText = text.replace(regex, "").replace(/\n{3,}/g, "\n\n").trim();
  return { cleanText, actions };
}

/** Parse [SUGGESTION:...] from AI text */
function parseSuggestions(text: string): { cleanText: string; suggestions: string[] } {
  const suggestions: string[] = [];
  const regex = /\[SUGGESTION:([^\]]+)\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    suggestions.push(match[1].trim());
  }
  const cleanText = text.replace(regex, "").replace(/\n{3,}/g, "\n\n").trim();
  return { cleanText, suggestions };
}

/** Build enriched context block from user account */
async function buildContext(sb: any, userId: string, workspaceId?: string): Promise<string> {
  const col = workspaceId ? "workspace_id" : "user_id";
  const val = workspaceId || userId;

  const [
    profileRes, brandRes, storyRes, personaRes, propRes, toneRes, stratRes,
    offersRes, calendarCountRes, auditRes, usageRes,
    coachingRes, contentDraftsRes, upcomingPostsRes,
  ] = await Promise.all([
    sb.from("profiles").select("prenom, activite, type_activite, channels, cible, probleme_principal, piliers, tons").eq("user_id", userId).maybeSingle(),
    sb.from("brand_profile").select("mission, positioning, tone_description, content_pillars, story_origin, combats, content_editorial_line").eq(col, val).maybeSingle(),
    sb.from("storytelling").select("story_final").eq(col, val).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("persona").select("portrait_prenom, portrait").eq(col, val).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("brand_proposition").select("version_one_liner, version_complete").eq(col, val).maybeSingle(),
    sb.from("brand_profile").select("tone_keywords, tone_style").eq(col, val).maybeSingle(),
    sb.from("brand_strategy").select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3, creative_concept").eq(col, val).maybeSingle(),
    sb.from("offers").select("name, target_audience").eq(col, val).limit(5),
    sb.from("calendar_posts").select("id", { count: "exact", head: true }).eq(col, val),
    sb.from("branding_audits").select("score_global, created_at").eq(col, val).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    // Coaching sessions (last 3)
    sb.from("branding_coaching_sessions").select("section, extracted_data, completed_at").eq(col, val).order("updated_at", { ascending: false }).limit(3),
    // Recent content drafts (last 3)
    sb.from("content_drafts").select("theme, canal, format, created_at").eq(col, val).order("created_at", { ascending: false }).limit(3),
    // Upcoming calendar posts (next 5)
    sb.from("calendar_posts").select("theme, date, canal, format").eq(col, val).gte("date", new Date().toISOString().slice(0, 10)).order("date", { ascending: true }).limit(5),
  ]);

  const profile = profileRes.data;
  const brand = brandRes.data;
  const story = storyRes.data;
  const persona = personaRes.data;
  const prop = propRes.data;
  const tone = toneRes.data;
  const strat = stratRes.data;
  const offers = offersRes.data;
  const calCount = calendarCountRes.count || 0;
  const audit = auditRes.data;
  const aiUsage = usageRes.count || 0;
  const coachingSessions = coachingRes.data || [];
  const recentDrafts = contentDraftsRes.data || [];
  const upcomingPosts = upcomingPostsRes.data || [];

  const lines: string[] = [];

  // ── Project & objectives ──
  lines.push("PROJET ET OBJECTIFS :");
  lines.push(`- Prénom : ${profile?.prenom || "?"}`);
  lines.push(`- Activité : ${profile?.activite || "Non renseigné"} (${profile?.type_activite || "?"})`);
  lines.push(`- Cible : ${profile?.cible || "Non définie"}`);
  lines.push(`- Problème principal : ${profile?.probleme_principal || "Non renseigné"}`);
  lines.push(`- Canaux : ${(profile?.channels || []).join(", ") || "Non renseignés"}`);

  // Offers
  if (offers && offers.length > 0) {
    lines.push(`- Offres : ${offers.map((o: any) => o.name).join(", ")}`);
  } else {
    lines.push("- Offres : ❌ Aucune définie");
  }

  // Content pillars
  const pillars: string[] = [];
  if (profile?.piliers && Array.isArray(profile.piliers) && profile.piliers.length > 0) {
    pillars.push(...profile.piliers);
  }
  if (strat) {
    if (strat.pillar_major) pillars.push(strat.pillar_major);
    if (strat.pillar_minor_1) pillars.push(strat.pillar_minor_1);
    if (strat.pillar_minor_2) pillars.push(strat.pillar_minor_2);
    if (strat.pillar_minor_3) pillars.push(strat.pillar_minor_3);
  }
  const uniquePillars = [...new Set(pillars)].slice(0, 5);
  lines.push(`- Piliers de contenu : ${uniquePillars.length > 0 ? uniquePillars.join(", ") : "❌ Non définis"}`);

  // Tons
  if (profile?.tons && Array.isArray(profile.tons) && profile.tons.length > 0) {
    lines.push(`- Tons : ${profile.tons.join(", ")}`);
  }

  // ── Branding status ──
  lines.push("\nÉTAT DU BRANDING :");
  const sections: Record<string, string> = {};
  sections["Histoire"] = story?.story_final ? (story.story_final as string).slice(0, 100) + "..." : "❌ Vide";
  sections["Persona"] = persona?.portrait_prenom ? `${persona.portrait_prenom} : ${(persona.portrait || "").slice(0, 80)}...` : "❌ Vide";
  sections["Proposition de valeur"] = prop?.version_one_liner || "❌ Vide";
  sections["Ton & style"] = tone?.tone_style || (tone?.tone_keywords ? JSON.stringify(tone.tone_keywords).slice(0, 80) : "❌ Vide");
  sections["Stratégie contenu"] = strat?.pillar_major || "❌ Vide";
  sections["Offres"] = offers && offers.length > 0 ? offers.map((o: any) => o.name).join(", ") : "❌ Vide";
  for (const [name, v] of Object.entries(sections)) {
    lines.push(`- ${name} : ${v}`);
  }

  // ── Recent history ──
  lines.push("\nHISTORIQUE RÉCENT :");

  // Coaching sessions
  if (coachingSessions.length > 0) {
    lines.push("- Derniers coachings IA :");
    for (const s of coachingSessions) {
      const summary = s.extracted_data ? JSON.stringify(s.extracted_data).slice(0, 120) : "en cours";
      lines.push(`  · ${s.section} : ${summary}`);
    }
  } else {
    lines.push("- Derniers coachings IA : aucun");
  }

  // Recent drafts
  if (recentDrafts.length > 0) {
    lines.push("- Derniers contenus créés :");
    for (const d of recentDrafts) {
      lines.push(`  · ${d.theme || "Sans thème"} (${d.canal || "?"}, ${d.format || "?"})`);
    }
  } else {
    lines.push("- Derniers contenus créés : aucun");
  }

  // Upcoming posts
  if (upcomingPosts.length > 0) {
    lines.push("- Prochains posts planifiés :");
    for (const p of upcomingPosts) {
      lines.push(`  · ${p.date} : ${p.theme} (${p.canal})`);
    }
  } else {
    lines.push("- Prochains posts planifiés : aucun (calendrier vide)");
  }

  // Stats
  lines.push(`\nPosts dans le calendrier : ${calCount}`);
  if (audit) {
    lines.push(`Dernier audit : score ${audit.score_global}/100 (${new Date(audit.created_at).toLocaleDateString("fr-FR")})`);
  }
  lines.push(`Générations IA ce mois : ${aiUsage}`);

  // Current month/season for seasonal suggestions
  const now = new Date();
  const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  lines.push(`\nDate du jour : ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`);

  return lines.join("\n").slice(0, 2500);
}

/** Generate fallback suggestions from context when AI doesn't return any */
function generateFallbackSuggestions(contextBlock: string, profile: any, strat: any): string[] {
  const suggestions: string[] = [];

  if (contextBlock.includes("Histoire : ❌")) {
    suggestions.push("Raconter mon histoire de marque");
  }
  if (contextBlock.includes("Persona : ❌")) {
    suggestions.push("Définir ma cliente idéale");
  }
  if (contextBlock.includes("Proposition de valeur : ❌")) {
    suggestions.push("Formuler ma proposition de valeur");
  }
  if (contextBlock.includes("calendrier vide")) {
    const activity = profile?.activite || profile?.type_activite;
    suggestions.push(activity ? `Planifier un post sur ${activity}` : "Planifier mes posts de la semaine");
  }
  if (suggestions.length < 3 && profile?.activite) {
    suggestions.push(`Créer un post sur mon métier de ${profile.activite}`);
  }
  if (suggestions.length < 3) {
    suggestions.push("J'ai une question sur ma com'");
  }

  return suggestions.slice(0, 3);
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const userId = user.id;

    const { message, conversationHistory, workspaceId } = await req.json();
    if (!message || typeof message !== "string" || message.length > 2000) {
      return new Response(JSON.stringify({ error: "Message invalide" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Service client for context & quota
    const sbService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Quota check
    const quota = await checkQuota(userId, "suggestion", workspaceId);
    if (!quota.allowed) {
      return new Response(JSON.stringify({
        reply: "Tu as utilisé tous tes crédits IA ce mois-ci. Tu peux passer en premium pour en avoir 300/mois, ou attendre le mois prochain !",
        actions: [{ route: "/pricing", label: "Voir les offres", icon: "Sparkles" }],
        suggestions: [],
        creditsUsed: 0,
        quota: true,
      }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Build context (best-effort)
    let contextBlock = "";
    let profileData: any = null;
    let stratData: any = null;
    try {
      contextBlock = await buildContext(sbService, userId, workspaceId);
      // Also fetch profile & strat for fallback suggestions
      const col = workspaceId ? "workspace_id" : "user_id";
      const val = workspaceId || userId;
      const [pRes, sRes] = await Promise.all([
        sbService.from("profiles").select("activite, type_activite, piliers").eq("user_id", userId).maybeSingle(),
        sbService.from("brand_strategy").select("pillar_major").eq(col, val).maybeSingle(),
      ]);
      profileData = pRes.data;
      stratData = sRes.data;
    } catch (e) {
      console.error("Context build failed:", e);
      contextBlock = "Contexte non disponible.";
    }

    // System prompt
    const systemPrompt = `Tu es l'Assistant Com' de Nowadays Agency, créé par Laetitia Mattioli. Tu es la binôme de communication digitale de l'utilisatrice. Ton rôle : la guider dans sa communication, l'aider à avancer, et la diriger vers les bons outils quand c'est pertinent.

CONTEXTE DU COMPTE :
${contextBlock}

TON PERSONNALITÉ :
- Tu parles comme une pote pro : directe, chaleureuse, avec une touche d'humour
- Tu tutoies toujours
- Tu utilises des expressions orales naturelles ("en vrai", "bon", "franchement", "le truc c'est que")
- Tu fais des apartés entre parenthèses en italique *(oui, même toi.)*
- Tu es encourageante sans être mielleuse
- Tu vas droit au but : pas de blabla, des réponses courtes et utiles
- Tu utilises l'écriture inclusive avec le point médian (créateur·ice, client·e)

TES CAPACITÉS :
Tu peux aider l'utilisatrice sur ces sujets, et tu connais les outils disponibles dans l'app :

1. BRANDING : histoire/storytelling, persona/client·e idéal·e, proposition de valeur, ton & style, stratégie de contenu, offres, charte graphique
   → Redirige vers : /branding ou /branding/simple/[section]

2. CRÉATION DE CONTENU : posts Instagram, carrousels, Reels (scripts), stories, newsletters, posts LinkedIn, épingles Pinterest, bio Instagram
   → Redirige vers : /creer ou /creer/[format]

3. CALENDRIER ÉDITORIAL : planifier des posts, voir le planning, organiser la semaine
   → Redirige vers : /calendrier

4. AUDITS : audit Instagram, audit site web, diagnostic
   → Redirige vers : /audit-instagram ou /audit-site

5. IDÉES : trouver des idées de contenu, stocker des idées
   → Redirige vers : /idees

6. ESPACES PAR CANAL : Instagram, LinkedIn, Pinterest, Site web, Newsletter
   → Redirige vers : /canal/[nom]

RÈGLES :
- Quand tu recommandes un outil, inclus TOUJOURS le lien sous cette forme exacte : [ACTION_LINK:/route|Texte du bouton]
  Exemple : [ACTION_LINK:/branding/simple/persona|Définir ta cliente idéale]
  Exemple : [ACTION_LINK:/creer|Créer un post Instagram]
  Exemple : [ACTION_LINK:/calendrier|Voir ton calendrier]

- Si l'utilisatrice pose une question sur la com' en général (pas liée à un outil), réponds directement avec tes conseils. Tu es aussi coach.

- Si elle ne sait pas quoi faire, propose 2-3 pistes basées sur l'état de son compte. Si son branding est vide, guide-la là-dessus d'abord. Si son branding est fait mais qu'elle ne publie pas, propose de créer du contenu.

- Si elle demande quelque chose que l'outil ne fait pas, dis-le honnêtement : "Ça, l'outil ne le fait pas encore, mais je peux quand même t'aider à réfléchir dessus."

- Garde tes réponses COURTES (max 150 mots). C'est un chat, pas un article de blog. Si un sujet nécessite plus de détail, propose d'approfondir.

- Ne commence JAMAIS par "Bien sûr !" ou "Absolument !". Commence directement par le contenu.

- N'utilise pas de tirets longs (—). Utilise : ou ;

SUGGESTIONS PERSONNALISÉES :
À la fin de chaque réponse, propose EXACTEMENT 2-3 suggestions SPÉCIFIQUES au projet de l'utilisatrice. Formate-les ainsi :
[SUGGESTION:Texte de la suggestion personnalisée]

RÈGLES pour les suggestions :
- Pas de suggestions génériques comme "Créer un post Instagram" ou "Voir mon calendrier"
- Utilise son ACTIVITÉ et ses OFFRES pour proposer des sujets concrets
- Utilise ses PILIERS DE CONTENU pour varier les angles
- Utilise ses OBJECTIFS pour orienter vers les bonnes actions
- Vérifie l'HISTORIQUE pour ne PAS reproposer ce qu'elle a déjà fait récemment
- Adapte aux SAISONS et moments de l'année (Noël, rentrée, été...)
- Varie les FORMATS suggérés (si le dernier était un post, propose carrousel/reel/newsletter)

Exemples de bonnes suggestions (adapte à son profil réel) :
[SUGGESTION:Écrire un post "coulisses" sur la fabrication de tes céramiques]
[SUGGESTION:Préparer un carrousel "3 erreurs à éviter quand on choisit un photographe"]
[SUGGESTION:Rédiger ta newsletter de mars sur les tendances du printemps]`;

    // Build messages
    const history = Array.isArray(conversationHistory) ? conversationHistory.slice(-10) : [];
    const messages = [
      ...history.map((m: any) => ({ role: m.role as "user" | "assistant", content: String(m.content || "") })),
      { role: "user" as const, content: message },
    ];

    // Call Claude
    const model = getModelForAction("suggestion");
    const rawReply = await callAnthropic({
      model,
      system: systemPrompt,
      messages,
      temperature: 0.7,
      max_tokens: 600,
    });

    // Log usage
    await logUsage(userId, "suggestion", "chat_guide", undefined, model, workspaceId);

    // Parse action links
    const { cleanText: textAfterActions, actions } = parseActionLinks(rawReply);
    
    // Parse suggestions from AI response
    const { cleanText, suggestions: aiSuggestions } = parseSuggestions(textAfterActions);

    // Use AI suggestions if available, otherwise fallback
    let finalSuggestions: string[];
    if (aiSuggestions.length >= 2) {
      finalSuggestions = aiSuggestions.slice(0, 3);
    } else {
      finalSuggestions = generateFallbackSuggestions(contextBlock, profileData, stratData);
    }

    return new Response(JSON.stringify({
      reply: cleanText,
      actions,
      suggestions: finalSuggestions,
      creditsUsed: 1,
    }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("chat-guide error:", err);
    return new Response(JSON.stringify({
      reply: "Je suis un peu dans les choux là... Réessaie dans quelques secondes !",
      actions: [],
      suggestions: [],
      creditsUsed: 0,
    }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
