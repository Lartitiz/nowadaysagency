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

/** Build compact context block from user account (max ~1500 chars) */
async function buildContext(sb: any, userId: string, workspaceId?: string): Promise<string> {
  const col = workspaceId ? "workspace_id" : "user_id";
  const val = workspaceId || userId;

  const [profileRes, brandRes, storyRes, personaRes, propRes, toneRes, stratRes, offersRes, calendarRes, auditRes, usageRes] = await Promise.all([
    sb.from("profiles").select("prenom, activite, type_activite, channels").eq("user_id", userId).maybeSingle(),
    sb.from("brand_profile").select("mission, positioning, tone_description, content_pillars, story_origin").eq(col, val).maybeSingle(),
    sb.from("storytelling").select("story_final").eq(col, val).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("persona").select("portrait_prenom, portrait").eq(col, val).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("brand_proposition").select("version_one_liner, version_complete").eq(col, val).maybeSingle(),
    sb.from("brand_profile").select("tone_keywords, tone_style, combats").eq(col, val).maybeSingle(),
    sb.from("brand_strategy").select("pillar_major, creative_concept").eq(col, val).maybeSingle(),
    sb.from("offers").select("name").eq(col, val).limit(5),
    sb.from("calendar_posts").select("id", { count: "exact", head: true }).eq(col, val),
    sb.from("branding_audits").select("score_global, created_at").eq(col, val).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ]);

  const profile = profileRes.data;
  const brand = brandRes.data;
  const story = storyRes.data;
  const persona = personaRes.data;
  const prop = propRes.data;
  const tone = toneRes.data;
  const strat = stratRes.data;
  const offers = offersRes.data;
  const calCount = calendarRes.count || 0;
  const audit = auditRes.data;
  const aiUsage = usageRes.count || 0;

  const lines: string[] = [];
  lines.push(`PRÉNOM : ${profile?.prenom || "?"}`);
  lines.push(`ACTIVITÉ : ${profile?.activite || "Non renseigné"}`);
  lines.push(`CANAUX : ${(profile?.channels || []).join(", ") || "Non renseignés"}`);

  // Branding sections status
  const sections: Record<string, string> = {};
  sections["Histoire"] = story?.story_final ? (story.story_final as string).slice(0, 100) + "..." : "❌ Vide";
  sections["Persona"] = persona?.portrait_prenom ? `${persona.portrait_prenom} : ${(persona.portrait || "").slice(0, 80)}...` : "❌ Vide";
  sections["Proposition de valeur"] = prop?.version_one_liner || "❌ Vide";
  sections["Ton & style"] = tone?.tone_style || (tone?.tone_keywords ? JSON.stringify(tone.tone_keywords).slice(0, 80) : "❌ Vide");
  sections["Stratégie contenu"] = strat?.pillar_major || "❌ Vide";
  sections["Offres"] = offers && offers.length > 0 ? offers.map((o: any) => o.name).join(", ") : "❌ Vide";

  lines.push("\nBRANDING :");
  for (const [name, val] of Object.entries(sections)) {
    lines.push(`- ${name} : ${val}`);
  }

  lines.push(`\nPosts calendrier : ${calCount}`);
  if (audit) {
    lines.push(`Dernier audit : score ${audit.score_global}/100 (${new Date(audit.created_at).toLocaleDateString("fr-FR")})`);
  }
  lines.push(`Générations IA ce mois : ${aiUsage}`);

  return lines.join("\n").slice(0, 1500);
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

    // Quota check — use "suggestion" category (lightweight)
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
    try {
      contextBlock = await buildContext(sbService, userId, workspaceId);
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

- N'utilise pas de tirets longs (—). Utilise : ou ;`;

    // Build messages
    const history = Array.isArray(conversationHistory) ? conversationHistory.slice(-10) : [];
    const messages = [
      ...history.map((m: any) => ({ role: m.role as "user" | "assistant", content: String(m.content || "") })),
      { role: "user" as const, content: message },
    ];

    // Call Claude
    const model = getModelForAction("suggestion"); // Use sonnet for chat (fast + cheap)
    const rawReply = await callAnthropic({
      model,
      system: systemPrompt,
      messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    // Log usage
    await logUsage(userId, "suggestion", "chat_guide", undefined, model, workspaceId);

    // Parse action links
    const { cleanText, actions } = parseActionLinks(rawReply);

    // Generate follow-up suggestions based on context
    const suggestions: string[] = [];
    if (contextBlock.includes("Histoire : ❌")) suggestions.push("Raconter mon histoire");
    if (contextBlock.includes("Persona : ❌")) suggestions.push("Définir ma cliente idéale");
    if (contextBlock.includes("Proposition de valeur : ❌")) suggestions.push("Formuler ma proposition de valeur");
    if (contextBlock.includes("Posts calendrier : 0")) suggestions.push("Planifier mes posts");
    if (suggestions.length === 0) {
      suggestions.push("Créer un post", "Voir mon calendrier", "Trouver des idées");
    }

    return new Response(JSON.stringify({
      reply: cleanText,
      actions,
      suggestions: suggestions.slice(0, 3),
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
