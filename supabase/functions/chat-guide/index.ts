import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getModelForAction } from "../_shared/anthropic.ts";
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

/** Safely stringify any value */
function safeStr(val: any, maxLen = 80): string {
  if (!val) return "";
  if (typeof val === "string") return val.slice(0, maxLen);
  try { return JSON.stringify(val).slice(0, maxLen); } catch { return String(val).slice(0, maxLen); }
}

/** Build enriched context block from user account */
async function buildContext(sb: any, userId: string, workspaceId?: string): Promise<string> {
  const col = workspaceId ? "workspace_id" : "user_id";
  const val = workspaceId || userId;

  // Resolve workspace owner's user_id for tables without workspace_id (profiles)
  let profileUserId = userId;
  if (workspaceId) {
    const { data: ownerRow } = await sb
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("role", "owner")
      .maybeSingle();
    if (ownerRow?.user_id) {
      profileUserId = ownerRow.user_id;
    }
  }

  const [
    profileRes, brandRes, storyRes, personaRes, propRes, toneRes, stratRes,
    offersRes, calendarCountRes, auditRes, usageRes,
    coachingRes, contentDraftsRes, upcomingPostsRes,
  ] = await Promise.all([
    sb.from("profiles").select("prenom, activite, type_activite, channels, cible, probleme_principal, piliers, tons").eq("user_id", profileUserId).maybeSingle(),
    sb.from("brand_profile").select("mission, positioning, tone_description, content_pillars, story_origin, combats, content_editorial_line").eq(col, val).maybeSingle(),
    sb.from("storytelling").select("step_7_polished, step_6_full_story, title").eq(col, val).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("persona").select("portrait_prenom, portrait, description, frustrations_detail, desires").eq(col, val).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("brand_proposition").select("version_one_liner, version_complete").eq(col, val).maybeSingle(),
    sb.from("brand_profile").select("tone_keywords, tone_style").eq(col, val).maybeSingle(),
    sb.from("brand_strategy").select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3, creative_concept").eq(col, val).maybeSingle(),
    sb.from("offers").select("name, target_ideal, offer_type, promise").eq(col, val).limit(5),
    sb.from("calendar_posts").select("id", { count: "exact", head: true }).eq(col, val),
    sb.from("branding_audits").select("score_global, created_at").eq(col, val).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    sb.from("branding_coaching_sessions").select("section, extracted_data, completed_at").eq(col, val).order("updated_at", { ascending: false }).limit(3),
    sb.from("content_drafts").select("theme, canal, format, created_at").eq(col, val).order("created_at", { ascending: false }).limit(3),
    sb.from("calendar_posts").select("theme, date, canal, format").eq(col, val).gte("date", new Date().toISOString().slice(0, 10)).order("date", { ascending: true }).limit(5),
  ]);

  let persona = personaRes.data;
  let story = storyRes.data;
  if (!persona && workspaceId) {
    const fallback = await sb.from("persona").select("portrait_prenom, portrait, description, frustrations_detail, desires").eq("user_id", profileUserId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    persona = fallback.data;
  }
  if (!story && workspaceId) {
    const fallback = await sb.from("storytelling").select("step_7_polished, step_6_full_story, title").eq("user_id", profileUserId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    story = fallback.data;
  }

  const profile = profileRes.data;
  const brand = brandRes.data;
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

  lines.push("PROJET ET OBJECTIFS :");
  lines.push(`- Prénom : ${profile?.prenom || "?"}`);
  lines.push(`- Activité : ${profile?.activite || "Non renseigné"} (${profile?.type_activite || "?"})`);
  lines.push(`- Cible : ${profile?.cible || "Non définie"}`);
  lines.push(`- Problème principal : ${profile?.probleme_principal || "Non renseigné"}`);
  lines.push(`- Canaux : ${(profile?.channels || []).join(", ") || "Non renseignés"}`);

  const namedOffers = (offers || []).filter((o: any) => o.name && o.name.trim());
  if (namedOffers.length > 0) {
    lines.push(`- Offres : ${namedOffers.map((o: any) => `${o.name}${o.offer_type ? ` (${o.offer_type})` : ""}`).join(", ")}`);
  } else {
    lines.push("- Offres : ❌ Aucune définie");
  }

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

  if (profile?.tons && Array.isArray(profile.tons) && profile.tons.length > 0) {
    lines.push(`- Tons : ${profile.tons.join(", ")}`);
  }

  lines.push("\nÉTAT DU BRANDING :");
  const sections: Record<string, string> = {};
  const storyText = story?.step_7_polished || story?.step_6_full_story;
  sections["Histoire"] = storyText ? safeStr(storyText, 100) + "..." : "❌ Vide";
  const personaFilled = persona?.portrait_prenom || persona?.description || persona?.frustrations_detail || persona?.desires;
  sections["Persona"] = personaFilled
    ? `${persona.portrait_prenom || "Sans prénom"} : ${safeStr(persona.portrait || persona.description, 80)}...`
    : "❌ Vide";
  sections["Proposition de valeur"] = prop?.version_one_liner || "❌ Vide";
  sections["Ton & style"] = tone?.tone_style || (tone?.tone_keywords ? safeStr(tone.tone_keywords, 80) : "❌ Vide");
  sections["Stratégie contenu"] = strat?.pillar_major || "❌ Vide";
  sections["Offres"] = namedOffers.length > 0 ? namedOffers.map((o: any) => o.name).join(", ") : "❌ Vide";

  for (const [name, v] of Object.entries(sections)) {
    lines.push(`- ${name} : ${v}`);
  }

  lines.push("\nHISTORIQUE RÉCENT :");
  if (coachingSessions.length > 0) {
    lines.push("- Derniers coachings IA :");
    for (const s of coachingSessions) {
      const summary = s.extracted_data ? JSON.stringify(s.extracted_data).slice(0, 120) : "en cours";
      lines.push(`  · ${s.section} : ${summary}`);
    }
  } else {
    lines.push("- Derniers coachings IA : aucun");
  }

  if (recentDrafts.length > 0) {
    lines.push("- Derniers contenus créés :");
    for (const d of recentDrafts) {
      lines.push(`  · ${d.theme || "Sans thème"} (${d.canal || "?"}, ${d.format || "?"})`);
    }
  } else {
    lines.push("- Derniers contenus créés : aucun");
  }

  if (upcomingPosts.length > 0) {
    lines.push("- Prochains posts planifiés :");
    for (const p of upcomingPosts) {
      lines.push(`  · ${p.date} : ${p.theme} (${p.canal})`);
    }
  } else {
    lines.push("- Prochains posts planifiés : aucun (calendrier vide)");
  }

  lines.push(`\nPosts dans le calendrier : ${calCount}`);
  if (audit) {
    lines.push(`Dernier audit : score ${audit.score_global}/100 (${new Date(audit.created_at).toLocaleDateString("fr-FR")})`);
  }
  lines.push(`Générations IA ce mois : ${aiUsage}`);

  const now = new Date();
  const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  lines.push(`\nDate du jour : ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`);

  return lines.join("\n").slice(0, 2500);
}

/** Generate fallback suggestions — variées selon le contexte */
function generateFallbackSuggestions(contextBlock: string, profile: any, strat: any): string[] {
  const suggestions: string[] = [];
  const activity = profile?.activite || profile?.type_activite || "";

  // Priorité 1 : sections branding vides
  if (contextBlock.includes("Histoire : ❌")) suggestions.push("Travailler mon storytelling");
  if (contextBlock.includes("Persona : ❌") && suggestions.length < 3) suggestions.push("Définir mon client·e idéal·e");
  if (contextBlock.includes("Proposition de valeur : ❌") && suggestions.length < 3) suggestions.push("Clarifier ma proposition de valeur");
  if (contextBlock.includes("Ton et style : ❌") && suggestions.length < 3) suggestions.push("Trouver mon ton de communication");
  if (contextBlock.includes("Stratégie : ❌") && suggestions.length < 3) suggestions.push("Définir ma stratégie de contenu");

  // Priorité 2 : branding OK mais pas de contenu
  if (suggestions.length === 0 && contextBlock.includes("calendrier vide")) {
    suggestions.push(activity ? `Planifier mes posts de la semaine pour ${activity}` : "Planifier mes posts de la semaine");
  }

  // Priorité 3 : suggestions variées selon l'activité
  const varied = [
    activity ? `Trouver 3 idées de contenu pour ${activity}` : "Trouver 3 idées de contenu",
    "Faire le point sur ma com' ce mois-ci",
    "Améliorer ma bio Instagram",
    activity ? `Créer un post qui parle de mon métier` : "Créer mon premier post",
    "Préparer ma routine d'engagement",
    "Analyser ce qui fonctionne dans ma com'",
  ];

  // Ajouter des suggestions variées aléatoirement pour ne pas toujours avoir les mêmes
  const shuffled = varied.sort(() => Math.random() - 0.5);
  for (const s of shuffled) {
    if (suggestions.length >= 3) break;
    if (!suggestions.includes(s)) suggestions.push(s);
  }

  return suggestions.slice(0, 3);
}

/** Stream Anthropic response as SSE */
async function streamAnthropicSSE(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number,
): Promise<ReadableStream> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  return response.body!;
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

    // Service client
    const sbService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Quota check
    const quota = await checkQuota(userId, "coach", workspaceId);
    if (!quota.allowed) {
      return new Response(JSON.stringify({
        reply: "Tu as utilisé tous tes crédits IA ce mois-ci. Tu peux passer en premium pour en avoir 300/mois, ou attendre le mois prochain !",
        actions: [{ route: "/pricing", label: "Voir les offres", icon: "Sparkles" }],
        suggestions: [],
        creditsUsed: 0,
        quota: true,
      }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Build context
    let contextBlock = "";
    let profileData: any = null;
    let stratData: any = null;
    try {
      contextBlock = await buildContext(sbService, userId, workspaceId);
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

    // System prompt (same as before)
    const systemPrompt = `Tu es l'Assistant Com' de Nowadays Agency. Tu es la binôme de communication de l'utilisatrice. Tu la connais déjà grâce à son profil.

CONTEXTE DU COMPTE :
${contextBlock}

═══ RÈGLE N°1 (LA PLUS IMPORTANTE) ═══
Tu as accès à TOUT le branding de l'utilisatrice ci-dessus.
- Si une section est remplie (pas de ❌) : tu la CONNAIS. Tu ne la redemandes JAMAIS.
- Si l'utilisatrice te parle de sa cible, ses offres, son histoire, son ton : UTILISE ce que tu sais déjà et complète avec des questions ciblées sur ce qui manque.
- Si elle dit "tu l'as pas en mémoire ?" : montre-lui que si, tu sais. Cite ce que tu connais d'elle.

═══ RÈGLE N°2 : ORIENTE VERS L'ACTION ═══
Quand tu identifies un besoin, propose TOUJOURS une action concrète avec un lien :
[ACTION_LINK:/route|Texte du bouton]

IMPORTANT : Quand tu proposes de créer un contenu spécifique (post, carrousel, reel, story), INCLUS TOUJOURS le sujet et l'objectif dans les paramètres URL pour pré-remplir le générateur. Utilise les paramètres : sujet=..., objectif=... (valeurs objectif : visibilite, confiance, vente, credibilite)

Pour les carrousels, CHOISIS AUSSI le type le plus adapté au sujet et ajoute le paramètre carousel_type=... dans l'URL. Types disponibles : tips, tutoriel, prise_de_position, mythe_realite, storytelling, etude_de_cas, checklist, comparatif, before_after, promo, coulisses, photo_dump

Exemples de redirections intelligentes :
- "Je veux lancer une offre" → [ACTION_LINK:/branding/offres|Créer ta fiche offre]
- "Je sais pas quoi poster" → [ACTION_LINK:/atelier?canal=instagram&sujet=Mon%20parcours%20de%20créatrice&objectif=confiance|Créer un post sur ton parcours]
- "Fais un carrousel sur les erreurs en branding" → [ACTION_LINK:/instagram/carousel?sujet=Les%20erreurs%20en%20branding&objectif=credibilite&carousel_type=mythe_realite|Générer le carrousel]
- "Un reel sur mes coulisses" → [ACTION_LINK:/instagram/reels?sujet=Mes%20coulisses%20de%20créatrice&objectif=confiance|Créer le reel]
- "Mon branding est pas clair" → [ACTION_LINK:/branding/coaching?section=story|Travailler ton storytelling]
- "J'ai peur de poster" → Conseils de déblocage + [ACTION_LINK:/atelier?canal=instagram|Créer un post ensemble]
- "Je veux planifier" → [ACTION_LINK:/calendrier|Ouvrir le calendrier]

Routes valides : /creer, /calendrier, /branding, /branding/coaching?section=story, /branding/coaching?section=persona, /branding/coaching?section=tone_style, /branding/coaching?section=content_strategy, /branding/offres, /branding/charter, /branding/proposition/recap, /instagram, /instagram/audit, /instagram/carousel, /instagram/reels, /instagram/stories, /instagram/routine, /linkedin, /linkedin/post, /linkedin/audit, /atelier, /contacts, /transformer, /pricing, /mon-plan, /idees, /dashboard/guide

═══ MODULES DÉSACTIVÉS (NE JAMAIS proposer de liens vers ces routes) ═══
- Site Web (/site, /site/accueil, /site/a-propos, /site/audit, /site/optimiser) : en cours de développement
- SEO (/seo) : en cours de développement
- Pinterest (/pinterest) : en cours de développement
- Communauté (/communaute) : bientôt disponible
- Lives (/lives) : bientôt disponible

Si l'utilisatrice demande de l'aide sur son site web, son SEO, ou Pinterest, dis-lui que ces modules arrivent bientôt dans l'app. Tu peux quand même l'aider avec des conseils généraux, mais ne propose PAS de bouton d'action vers ces pages.

═══ RÈGLE N°3 : DIAGNOSTIC INTELLIGENT ═══
Quand l'utilisatrice arrive ou dit "je sais pas par où commencer", analyse son compte et propose un parcours :

Si le branding a des ❌ (sections vides) :
→ "Je vois que ta section [X] n'est pas encore remplie. C'est important parce que [raison]. On s'y met ?" + bouton

Si le branding est > 60% mais pas de contenu :
→ "Ton branding est solide ! Maintenant, faut le faire vivre. On crée ton premier post ensemble ?" + bouton

Si tout est bien rempli :
→ "Ton branding est au top. On planifie ta semaine de contenu ?" + bouton

═══ RÈGLE N°4 : DÉTECTE LE MODE ═══
Selon ce que dit l'utilisatrice, adapte-toi :

MODE STRATÉGIE (elle dit : "par où commencer", "c'est quoi la prochaine étape", "ma com' est nulle") :
→ Analyse l'état du compte, propose un plan d'action en 2-3 étapes avec boutons

MODE CONTENU (elle dit : "je sais pas quoi poster", "aide-moi à écrire", "j'ai une idée de post") :
→ Utilise ses piliers de contenu, son persona, son ton pour proposer des sujets concrets → bouton vers le bon générateur

MODE DÉBLOCAGE (elle dit : "j'ose pas", "j'ai peur", "c'est nul ce que je fais", "je me compare") :
→ Réassure avec empathie (pas de blabla positif vide), donne un conseil concret, propose une micro-action facile → bouton

═══ TON ET STYLE ═══
- Tu ne dis JAMAIS de gros mots, de jurons, ni de langage vulgaire. Tu restes toujours courtois·e et professionnel·le.
- Directe, chaleureuse, comme une pote qui va droit au but
- Tu tutoies toujours
- Expressions orales : "en vrai", "bon", "franchement", "le truc c'est que"
- Apartés en italique *(oui, même toi.)*
- Écriture inclusive point médian
- Jamais de tirets longs : utilise : ou ;
- Pour les conseils et diagnostics : réponses COURTES (max 120 mots). C'est un chat, pas un article.
- Ne commence JAMAIS par "Bien sûr !", "Absolument !" ou "Super question !"

═══ RÈGLE N°5 : RÉDACTION DE CONTENU (QUAND ON TE DEMANDE D'ÉCRIRE UN POST/TEXTE) ═══
Quand l'utilisatrice te demande explicitement de rédiger un contenu (post, légende, accroche, texte), tu passes en MODE RÉDACTION :
- Tu peux dépasser les 120 mots pour le contenu rédigé
- INTERDICTION d'utiliser des formules génériques IA : "dans un monde où", "et si je te disais que", "spoiler alert", "plot twist", "et c'est pas un hasard", "le truc c'est que" (en accroche), "tu sais quoi", "la vérité c'est que"
- Écris comme un vrai humain : phrases courtes, rythme varié, pas de structure systématique "problème → solution → CTA"
- Utilise le vocabulaire SPÉCIFIQUE à son métier et à sa cible (dispo dans le contexte)
- L'accroche doit être punchy et concrète, pas une question rhétorique vide
- Le CTA doit être naturel, pas "dis-moi en commentaire" systématiquement
- Varie les structures : parfois commence par une anecdote, parfois par un constat brut, parfois par une question directe
- Adapte le ton à CE QUE L'UTILISATRICE A DÉFINI dans son branding (ton, style, mots-clés)
- PRÉFÈRE rediriger vers les générateurs dédiés (carrousel, reels, etc.) qui produisent un contenu plus travaillé. Ne rédige directement que pour les posts texte courts ou si elle insiste.

═══ SUGGESTIONS ═══
À la fin, propose 2-3 suggestions SPÉCIFIQUES :
[SUGGESTION:texte concret basé sur son activité et ses données]

Règles pour les suggestions :
- Basées sur son activité, ses offres, ses piliers
- Jamais génériques ("Créer un post")
- Variées en format (post, carrousel, reel, newsletter)
- Adaptées à la saison si pertinent`;

    // Build messages
    const history = Array.isArray(conversationHistory) ? conversationHistory.slice(-10) : [];
    const aiMessages = [
      ...history.map((m: any) => ({ role: m.role as "user" | "assistant", content: String(m.content || "") })),
      { role: "user" as const, content: message },
    ];

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const model = getModelForAction("suggestion");

    // Stream the response as SSE
    // Detect if the user is asking for content creation to allow longer output
    const lowerMsg = message.toLowerCase();
    const isContentRequest = /r[eé]dig|[eé]cri[st]|post prévu|g[eé]n[eè]re|propose.*(post|texte|l[eé]gende|accroche)|fais.*(post|carrousel|texte)/i.test(lowerMsg);
    const maxTokens = isContentRequest ? 2000 : 1000;

    const anthropicStream = await streamAnthropicSSE(
      apiKey, model, systemPrompt, aiMessages, 0.7, maxTokens,
    );

    // Transform Anthropic SSE into our own SSE format
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    const outputStream = new ReadableStream({
      async start(controller) {
        const reader = anthropicStream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process line by line
            let newlineIdx: number;
            while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, newlineIdx).trim();
              buffer = buffer.slice(newlineIdx + 1);

              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6);
              if (jsonStr === "[DONE]") continue;

              try {
                const event = JSON.parse(jsonStr);

                // content_block_delta contains the text tokens
                if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                  const text = event.delta.text;
                  fullText += text;
                  // Send delta to client
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", text })}\n\n`));
                }

                // message_stop means we're done
                if (event.type === "message_stop") {
                  break;
                }
              } catch {
                // Ignore malformed JSON lines
              }
            }
          }

          // Parse action links and suggestions from full text
          const { cleanText: textAfterActions, actions } = parseActionLinks(fullText);
          const { cleanText, suggestions: aiSuggestions } = parseSuggestions(textAfterActions);

          let finalSuggestions: string[];
          if (aiSuggestions.length >= 2) {
            finalSuggestions = aiSuggestions.slice(0, 3);
          } else {
            finalSuggestions = generateFallbackSuggestions(contextBlock, profileData, stratData);
          }

          // Send final event with parsed data
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: "done",
            cleanText,
            actions,
            suggestions: finalSuggestions,
            creditsUsed: 1,
          })}\n\n`));

          controller.close();
        } catch (err) {
          console.error("Stream processing error:", err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: "error",
            error: "Erreur pendant la génération",
          })}\n\n`));
          controller.close();
        }
      },
    });

    // Log usage (fire and forget)
    logUsage(userId, "coach", "chat_guide", undefined, model, workspaceId).catch(console.error);

    return new Response(outputStream, {
      headers: {
        ...cors,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

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
