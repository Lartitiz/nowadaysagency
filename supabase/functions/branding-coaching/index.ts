import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic, callAnthropicWithMeta, getDefaultModel, getModelForAction } from "../_shared/anthropic.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";

const SECTION_CHECKLISTS: Record<string, string[]> = {
  story: ["story_origin", "story_turning_point", "story_struggles", "story_unique", "story_vision"],
  persona: ["frustrations", "transformation", "objections", "cliches", "aesthetic_world", "inspiration", "actions"],
  value_proposition: ["value_prop_problem", "value_prop_solution", "value_prop_difference", "value_prop_proof", "value_prop_sentence"],
  tone_style: ["tone_description", "tone_do", "tone_dont", "combats", "visual_style"],
  content_strategy: ["content_pillars", "content_twist", "content_formats", "content_frequency", "content_editorial_line"],
  offers: ["offer_name", "offer_price", "offer_target", "offer_promise", "offer_includes"],
};

const SECTION_NAMES: Record<string, string> = {
  story: "Mon histoire",
  persona: "Mon client·e idéal·e",
  value_proposition: "Ma proposition de valeur",
  tone_style: "Mon ton, mon style & mes combats",
  content_strategy: "Ma stratégie de contenu",
  offers: "Mes offres",
};

const TOPIC_LABELS: Record<string, string> = {
  story_origin: "Comment tout a commencé",
  story_turning_point: "Le déclic",
  story_struggles: "Les galères",
  story_unique: "Ce qui te rend unique",
  story_vision: "Ta vision",
  frustrations: "Ses frustrations",
  transformation: "Sa transformation rêvée",
  objections: "Ses objections et croyances",
  cliches: "Les clichés à déconstruire",
  aesthetic_world: "Son univers esthétique",
  inspiration: "Ce qui l'inspire et la rebute",
  actions: "Ses premières actions",
  value_prop_problem: "Le problème que tu résous",
  value_prop_solution: "Ta solution",
  value_prop_difference: "Ce qui te différencie",
  value_prop_proof: "Tes preuves",
  value_prop_sentence: "La phrase qui résume tout",
  tone_description: "Comment tu parles",
  tone_do: "Ce que tu fais",
  tone_dont: "Ce que tu ne fais jamais",
  combats: "Tes combats",
  visual_style: "Ton style visuel",
  content_pillars: "Tes piliers de contenu",
  content_twist: "Ton twist créatif",
  content_formats: "Tes formats préférés",
  content_frequency: "Ton rythme",
  content_editorial_line: "Ta ligne éditoriale",
  offer_name: "Nom de l'offre",
  offer_price: "Prix",
  offer_target: "Pour qui",
  offer_promise: "La promesse",
  offer_includes: "Ce qui est inclus",
};

const TOPIC_ALIASES: Record<string, string> = {
  // story
  "origin": "story_origin", "origine": "story_origin", "parcours": "story_origin", "debut": "story_origin",
  "turning_point": "story_turning_point", "declic": "story_turning_point", "déclic": "story_turning_point",
  "struggles": "story_struggles", "galeres": "story_struggles", "galères": "story_struggles", "difficultes": "story_struggles",
  "unique": "story_unique", "difference": "story_unique", "différence": "story_unique",
  "vision": "story_vision", "futur": "story_vision", "avenir": "story_vision",
  // persona
  "blocages": "frustrations", "problemes": "frustrations", "problèmes": "frustrations", "ce_qui_bloque": "frustrations",
  "desires": "transformation", "envies": "transformation", "aspirations": "transformation", "besoins": "transformation", "reve": "transformation",
  "freins": "objections", "hesitations": "objections", "hésitations": "objections",
  "croyances": "cliches", "préjugés": "cliches", "prejuges": "cliches",
  "esthetique": "aesthetic_world", "esthétique": "aesthetic_world", "beau": "aesthetic_world", "visuel": "aesthetic_world",
  "inspire": "inspiration", "rebute": "inspiration", "ressenti": "inspiration",
  "declencheurs": "actions", "déclencheurs": "actions", "triggers": "actions", "premieres_actions": "actions",
  // tone_style
  "ton": "tone_description", "voix": "tone_description", "style_communication": "tone_description",
  "do": "tone_do", "je_fais": "tone_do",
  "dont": "tone_dont", "je_ne_fais_pas": "tone_dont", "limites": "tone_dont",
  "combat": "combats", "engagements": "combats", "valeurs_combat": "combats",
  "style_visuel": "visual_style",
  // content_strategy
  "piliers": "content_pillars", "pillars": "content_pillars", "themes": "content_pillars", "thèmes": "content_pillars",
  "twist": "content_twist", "twist_creatif": "content_twist", "concept": "content_twist", "angle": "content_twist",
  "formats": "content_formats", "types_contenu": "content_formats",
  "frequence": "content_frequency", "fréquence": "content_frequency", "rythme": "content_frequency", "frequency": "content_frequency",
  "editorial_line": "content_editorial_line", "ligne_editoriale": "content_editorial_line", "ligne": "content_editorial_line", "edito": "content_editorial_line",
  // offers
  "nom": "offer_name", "name": "offer_name", "nom_offre": "offer_name",
  "prix": "offer_price", "price": "offer_price", "tarif": "offer_price",
  "cible": "offer_target", "target": "offer_target", "pour_qui": "offer_target",
  "promesse": "offer_promise", "promise": "offer_promise", "transformation": "offer_promise",
  "inclus": "offer_includes", "includes": "offer_includes", "contenu_offre": "offer_includes",
};

function normalizeCoveredTopic(topic: string | null | undefined, section: string): string | null {
  if (!topic) return null;
  const checklist = SECTION_CHECKLISTS[section] || [];
  // Exact match
  if (checklist.includes(topic)) return topic;
  // Alias match
  const aliased = TOPIC_ALIASES[topic.toLowerCase().trim()];
  if (aliased && checklist.includes(aliased)) return aliased;
  // Fuzzy: checklist key contains topic or topic contains checklist key
  const fuzzy = checklist.find(c =>
    topic.toLowerCase().includes(c.toLowerCase()) ||
    c.toLowerCase().includes(topic.toLowerCase())
  );
  if (fuzzy) return fuzzy;
  console.warn(`[BrandingCoaching] Unrecognized covered_topic: "${topic}" for section "${section}"`);
  return null;
}

function buildSystemPrompt(section: string, context: any, coveredTopics: string[], autofillData?: any, autofillConfidence?: string): string {
  const prenom = context.profile?.prenom || context.profile?.first_name || "toi";
  const sectionName = SECTION_NAMES[section] || section;
  const checklist = SECTION_CHECKLISTS[section] || [];

  const coveredSet = new Set(coveredTopics || []);
  const remainingTopics = checklist.filter(t => !coveredSet.has(t));
  const coveredList = checklist.filter(t => coveredSet.has(t));

  const contextLines: string[] = [];

  const p = context.profile;
  if (p) {
    contextLines.push(`Activité : ${p.activite || p.activity || "non renseigné"}`);
    if (p.type_activite || p.activity_type) contextLines.push(`Type : ${p.type_activite || p.activity_type}`);
    if (p.canaux?.length) contextLines.push(`Canaux : ${p.canaux.join(", ")}`);
    if (p.main_goal) contextLines.push(`Objectif : ${p.main_goal}`);
  }

  const b = context.branding;
  if (b) {
    if (b.positioning) contextLines.push(`Positionnement : ${b.positioning}`);
    if (b.mission) contextLines.push(`Mission : ${b.mission}`);
    if (b.tone_keywords) contextLines.push(`Ton : ${JSON.stringify(b.tone_keywords)}`);
  }

  const a = context.audit;
  if (a) {
    if (a.score_global) contextLines.push(`Score audit global : ${a.score_global}/100`);
  }

  const existing = context.existing_data;
  if (existing && Object.keys(existing).length > 0) {
    // Ne garder que les champs branding utiles, pas les métadonnées
    const { id, user_id, workspace_id, created_at, updated_at, ...relevantData } = existing;
    const relevantStr = JSON.stringify(relevantData, null, 2);
    // Limiter à 2000 chars pour ne pas exploser le contexte
    if (relevantStr.length > 2000) {
      contextLines.push(`\nDONNÉES EXISTANTES (résumé) :\n${relevantStr.slice(0, 2000)}...`);
    } else if (Object.keys(relevantData).length > 0) {
      contextLines.push(`\nDONNÉES EXISTANTES :\n${relevantStr}`);
    }
  }

  // ── Autofill context injection ──
  let autofillBlock = "";
  if (autofillData && Object.keys(autofillData).length > 0) {
    autofillBlock = `
══ DONNÉES PRÉ-REMPLIES PAR L'ANALYSE AUTOMATIQUE ══
Niveau de confiance de l'analyse : ${autofillConfidence || "medium"}
Données pré-remplies :
${JSON.stringify(autofillData, null, 2)}

══ RÈGLES SPÉCIALES MODE AUTOFILL ══
- L'utilisatrice a importé ses liens et l'IA a pré-rempli cette section automatiquement.
- Tu interviens pour AFFINER, pas pour tout refaire.
- COMMENCE par un résumé de ce que l'analyse a trouvé : "D'après ce que j'ai vu, voici ce que j'ai noté pour ${sectionName} : [résumé]. Est-ce que c'est juste ? Qu'est-ce que tu voudrais changer ou préciser ?"
${autofillConfidence === "high" ? `- Confiance ÉLEVÉE : pose 1-2 questions de validation max. "J'ai l'impression que [X]. Tu confirmes ou tu ajusterais ?"
- Ne redemande PAS ce qui est déjà bien rempli.` : ""}
${autofillConfidence === "medium" ? `- Confiance MOYENNE : pose 2-3 questions ciblées sur les parties floues. "J'ai bien compris [X], mais je suis moins sûr·e de [Y]. Tu peux me préciser ?"
- Ne redemande pas les parties claires.` : ""}
${autofillConfidence === "low" ? `- Confiance BASSE : fais un mini coaching plus complet mais pars de ce qui existe. "J'ai trouvé très peu d'infos sur ${sectionName}. On va la construire ensemble."` : ""}
- Quand tu as assez d'infos, propose une version finalisée et demande validation.
`;
  }

  return `Tu es l'assistante branding de Nowadays. Tu aides ${prenom} à construire la section "${sectionName}" de son branding.

══ CONTEXTE DE ${prenom.toUpperCase()} ══
${contextLines.join("\n")}
${autofillBlock}
══ CHECKLIST DE CETTE SECTION ══
Sujets à couvrir : ${checklist.map(t => `${t} (${TOPIC_LABELS[t] || t})`).join(", ")}

✅ SUJETS DÉJÀ COUVERTS (NE PAS reposer de questions dessus) :
${coveredList.length > 0 ? coveredList.map(t => `- ${TOPIC_LABELS[t] || t}`).join("\n") : "Aucun (c'est le début)"}

🔵 SUJETS RESTANTS à couvrir :
${remainingTopics.length > 0 ? remainingTopics.map(t => `- ${TOPIC_LABELS[t] || t}`).join("\n") : "TOUS COUVERTS → la section est complète"}

══ RÈGLES STRICTES ══
- Pose UNE SEULE question à la fois
- La question doit porter sur le PROCHAIN sujet non couvert dans la liste des sujets restants
- Ne pose JAMAIS une question sur un sujet déjà couvert
- La question doit être SPÉCIFIQUE au contexte de ${prenom}
- N'utilise JAMAIS de jargon marketing
- Ton : chaleureux, direct, comme une conversation entre amies. Tu tutoies.
- Utilise des expressions orales naturelles ("Franchement", "En vrai", "Le truc c'est que")
- Si la réponse est courte ou vague, creuse UNE FOIS maximum ("Ah intéressant, tu peux m'en dire plus ?"). Après une relance, marque le sujet comme couvert et passe au suivant.
- Si TOUS les sujets sont couverts, mets is_complete à true
- Tu as MAXIMUM ${checklist.length + 3} questions au total pour cette session. Si tu atteins cette limite, termine la session (is_complete: true) même si certains sujets sont incomplets.
- Le covered_topic que tu renvoies DOIT être EXACTEMENT l'une de ces clés : ${checklist.join(", ")}. Aucun synonyme, aucune variante. Copie-colle la clé exacte.
- Chaque réponse de l'utilisatrice DOIT couvrir au moins un sujet. Ne renvoie JAMAIS covered_topic: null après la première question.

══ CLÉS OBLIGATOIRES POUR extracted_insights ══
Quand tu extrais des informations de la réponse, utilise EXACTEMENT ces clés dans extracted_insights (pas de variantes, pas de synonymes) :
${section === "content_strategy" ? `- "content_pillars": tableau de strings ["pilier majeur", "pilier mineur 1", "pilier mineur 2", "pilier mineur 3"] — le premier est toujours le pilier majeur
- "content_twist": string, le concept créatif / twist unique
- "content_formats": string, les formats de contenu préférés séparés par des virgules
- "content_frequency": string, le rythme choisi (ex: "2x/semaine posts, stories 3-4x/semaine")
- "content_editorial_line": string, résumé de la ligne éditoriale` :
section === "story" ? `- "story_origin": string, comment tout a commencé
- "story_turning_point": string, le déclic
- "story_struggles": string, les galères traversées
- "story_unique": string, ce qui rend unique
- "story_vision": string, la vision pour l'avenir` :
section === "persona" ? `MAPPING SUJET → CLÉS (remplis TOUTES les clés listées quand tu couvres un sujet) :

Sujet "frustrations" → clés à remplir :
  - "step_1_frustrations": string, ses frustrations profondes, ce qui la bloque au quotidien

Sujet "transformation" → clés à remplir :
  - "step_2_transformation": string, ce qu'elle veut vraiment, sa transformation rêvée, comment elle se verrait dans l'idéal

Sujet "objections" → clés à remplir :
  - "step_3a_objections": string, ses objections principales (prix, légitimité, timing, doutes…)

Sujet "cliches" → clés à remplir :
  - "step_3b_cliches": string, les croyances, clichés ou préjugés qu'elle a sur ton domaine — ce qu'il faut déconstruire

Sujet "aesthetic_world" → clés à remplir (TOUTES les 2 dans la même réponse) :
  - "step_4_beautiful": string, ce qu'elle trouve beau — sa direction esthétique, les ambiances visuelles qui l'attirent
  - "step_4_repulsive": string, ce qui la rebute visuellement, ce qui la fait fuir

Sujet "inspiration" → clés à remplir (TOUTES les 2 dans la même réponse) :
  - "step_4_inspiring": string, ce qui l'inspire — personnes, marques, contenus, comptes qu'elle suit
  - "step_4_feeling": string, ce qu'elle a besoin de ressentir — l'émotion qu'elle cherche (confiance, légèreté, fierté…)

Sujet "actions" → clés à remplir :
  - "step_5_actions": string, ses premières actions concrètes, ce qui la fait passer à l'achat, ses déclencheurs

Clé bonus (à remplir dès que l'info est disponible) :
  - "portrait_prenom": string, le prénom fictif de ce persona si mentionné

⚠️ IMPORTANT : Quand un sujet mappe vers PLUSIEURS clés (aesthetic_world, inspiration), tu DOIS remplir TOUTES les clés dans le même extracted_insights. Ne renvoie pas une seule clé en ignorant l'autre.` :
section === "tone_style" ? `- "voice_description": string, comment tu parles / ta voix
- "tone_register": string, le registre (familier, soutenu, etc.)
- "tone_do": string, ce que tu fais toujours en com
- "tone_dont": string, ce que tu ne fais jamais
- "combat_cause": string, ta cause principale / ton combat
- "combat_fights": string, tes combats secondaires
- "visual_style": string, ton style visuel` :
section === "offers" ? `- "offer_name": string, nom de l'offre
- "offer_price": string, prix et format de paiement
- "offer_target": string, pour qui c'est fait
- "offer_promise": string, la promesse / transformation
- "offer_includes": string, ce qui est inclus` : ""}
N'inclus dans extracted_insights QUE les clés ci-dessus. Pour chaque réponse, remplis TOUTES les clés mappées au sujet couvert. Si la réponse contient des infos sur d'autres sujets non encore couverts, inclus aussi leurs clés.

══ FORMAT DE RÉPONSE ══
Retourne TOUJOURS un JSON valide, rien d'autre :
{
  "question": "Ta question bienveillante",
  "question_type": "text" | "textarea" | "select" | "multi_select",
  "options": ["option1", "option2"],
  "placeholder": "Exemple de réponse...",
  "covered_topic": "le champ couvert par la DERNIÈRE réponse de l'utilisatrice (null si première question)",
  "extracted_insights": { "champ": "valeur extraite de la dernière réponse" },
  "is_complete": false,
  "completion_percentage": 45,
  "remaining_topics": ${JSON.stringify(remainingTopics)}
}

Quand is_complete = true, ajoute :
{
  "is_complete": true,
  "completion_percentage": 100,
  "covered_topic": "dernier champ couvert",
  "extracted_insights": { ... },
  "final_summary": "2-3 phrases max : ce qu'on a posé ensemble + 1 prochaine étape concrète. PAS de structure en parties, PAS de bullet points, PAS d'emojis de section. Court et direct."
}`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req); const cors = corsHeaders;
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    if (!body.ping) {
      validateInput(body, z.object({
        section: z.string().max(100).min(1, "section requis"),
        messages: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().max(10000),
        })).max(50).optional(),
        context: z.record(z.unknown()).optional().nullable(),
        covered_topics: z.array(z.string().max(100)).max(30).optional(),
        workspace_id: z.string().uuid().optional().nullable(),
      }).passthrough());
    }
    const origBody = body;
    // Health check / ping (no auth needed)
    if (body.ping) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Authenticate via JWT
    const { userId } = await authenticateRequest(req);

    // Rate limit check
    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, cors);

    const { section, messages, context, covered_topics, workspace_id, autofill_data, autofill_confidence } = body;
    console.log(`[BrandingCoaching] section=${section}, messages=${(messages || []).length}, totalChars=${(messages || []).reduce((sum: number, m: any) => sum + (m.content?.length || 0), 0)}`);

    const quota = await checkQuota(userId, "coach", workspace_id || undefined);
    if (!quota.allowed) {
      return quotaDeniedResponse(quota, cors);
    }

    if (!section) {
      return new Response(JSON.stringify({ error: "section requis" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Special section: generate full story text (no JSON, just prose)
    if (section === "story_generate") {
      const prenom = context?.profile?.prenom || context?.profile?.first_name || "toi";
      const storySystemPrompt = BASE_SYSTEM_RULES + `\n\nTu es une rédactrice de storytelling. Écris l'histoire fondatrice de ${prenom} en un texte fluide, engageant, à la première personne. Utilise un ton oral, chaleureux, authentique. Pas de jargon, pas de phrases corporate. Le texte doit faire entre 300 et 500 mots. Retourne UNIQUEMENT le texte de l'histoire, sans JSON, sans balises.`;

      let storyMessages = (messages || []).map((m: any) => ({
        role: m.role === "user" ? "user" as const : "assistant" as const,
        content: m.content,
      }));

      // Ensure last message is user
      while (storyMessages.length > 0 && storyMessages[storyMessages.length - 1].role === "assistant") {
        storyMessages.pop();
      }
      if (storyMessages.length === 0) {
        storyMessages.push({ role: "user" as const, content: "Écris mon histoire fondatrice." });
      }

      // Merge consecutive same-role messages
      const merged: typeof storyMessages = [];
      for (const msg of storyMessages) {
        if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
          merged[merged.length - 1].content += "\n\n" + msg.content;
        } else {
          merged.push({ ...msg });
        }
      }
      if (merged.length > 0 && merged[0].role === "assistant") {
        merged.unshift({ role: "user" as const, content: "Commence." });
      }

      // ── Garde-fou story_generate : limiter la taille du payload ──
      for (const msg of merged) {
        if (msg.content.length > 3000) {
          msg.content = msg.content.slice(0, 3000) + "\n[...tronqué]";
        }
      }
      if (merged.length > 20) {
        const first = merged[0];
        const recent = merged.slice(-19);
        if (first.role === recent[0].role) {
          merged.splice(0, merged.length, ...recent);
        } else {
          merged.splice(0, merged.length, first, ...recent);
        }
      }

      const rawStory = await callAnthropic({
        model: getDefaultModel(),
        system: storySystemPrompt,
        messages: merged,
        temperature: 0.8,
        max_tokens: 2000,
      });

      await logUsage(userId, "coach", "branding_coaching", undefined, undefined, workspace_id || undefined);

      return new Response(JSON.stringify({ response: rawStory }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Special section: fill missing persona fields from conversation context
    if (section === "persona_fill") {
      const prenom = context?.profile?.prenom || context?.profile?.first_name || "toi";
      const fillSystemPrompt = BASE_SYSTEM_RULES + `\n\nTu es experte en persona marketing. Tu reçois un contexte composite : il peut contenir un CONTEXTE DE MARQUE (mission, cible, verbatims, ton), une SYNTHÈSE PORTRAIT, des CHAMPS PERSONA DÉJÀ REMPLIS, et/ou une CONVERSATION de coaching. Tu peux recevoir une seule de ces sources, plusieurs, ou toutes — adapte-toi.

À partir de TOUT ce qui est disponible, extrais ou DÉDUIS les informations demandées pour ${prenom}.

RÈGLES STRICTES — FORMAT DE SORTIE :
- Réponds UNIQUEMENT par un OBJET JSON PLAT valide, rien d'autre (pas de markdown, pas de texte avant/après, pas de \`\`\`json)
- Les SEULES clés autorisées sont EXACTEMENT celles listées dans le dernier message utilisateur (ex: "step_3a_objections", "step_3b_cliches", "step_4_beautiful", "step_4_inspiring", "step_4_repulsive", "step_4_feeling", "step_5_actions", "step_1_frustrations", "step_2_transformation")
- INTERDIT d'utiliser des clés alternatives comme "objections_courantes", "croyances_limitantes", "declencheurs_achat", "freins_achat", "frustrations_profondes", "objectif_principal", "experience_ideale", "profil_complet", "persona", "insights" ou tout autre alias
- INTERDIT d'imbriquer (pas de sous-objets, pas de tableaux) — chaque clé demandée DOIT mapper directement à une string
- Si une clé demandée s'appelle "step_3a_objections", ta sortie DOIT contenir littéralement "step_3a_objections" comme clé, pas un synonyme

RÈGLES DE CONTENU :
- Tu DOIS produire une valeur concrète et plausible pour CHAQUE champ demandé
- Si tu n'as pas d'information directe pour un champ, DÉDUIS-la intelligemment à partir de la cible, des verbatims, du problème, de la mission, du ton et de tout autre élément du contexte
- Ne refuse JAMAIS sous prétexte de manque d'info — déduis. Une déduction plausible vaut mieux qu'un champ vide
- Chaque valeur doit être une string de 1 à 5 phrases, concrète et spécifique (pas de généralités creuses)
- Ton empathique et direct
- Écriture inclusive avec point médian
- N'invente PAS de données qui CONTREDISENT explicitement ce qui a été dit dans le contexte`;

      let fillMessages = (messages || []).map((m: any) => ({
        role: m.role === "user" ? "user" as const : "assistant" as const,
        content: m.content,
      }));

      while (fillMessages.length > 0 && fillMessages[fillMessages.length - 1].role === "assistant") {
        fillMessages.pop();
      }
      if (fillMessages.length === 0) {
        fillMessages.push({ role: "user" as const, content: "Extrais les informations manquantes." });
      }

      const merged: typeof fillMessages = [];
      for (const msg of fillMessages) {
        if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
          merged[merged.length - 1].content += "\n\n" + msg.content;
        } else {
          merged.push({ ...msg });
        }
      }
      if (merged.length > 0 && merged[0].role === "assistant") {
        merged.unshift({ role: "user" as const, content: "Commence." });
      }

      for (const msg of merged) {
        if (msg.content.length > 3000) {
          msg.content = msg.content.slice(0, 3000) + "\n[...tronqué]";
        }
      }

      const rawFill = await callAnthropic({
        model: getDefaultModel(),
        system: fillSystemPrompt,
        messages: merged,
        temperature: 0.5,
        max_tokens: 2000,
      });

      await logUsage(userId, "coach", "branding_coaching", undefined, undefined, workspace_id || undefined);

      return new Response(JSON.stringify({ response: rawFill }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Special section: fill missing content_strategy (ligne éditoriale) fields from brand context
    if (section === "content_strategy_fill") {
      const prenom = context?.profile?.prenom || context?.profile?.first_name || "toi";
      const fillSystemPrompt = BASE_SYSTEM_RULES + `\n\nTu es experte en stratégie éditoriale de marque personnelle. Tu reçois un contexte composite : il peut contenir un CONTEXTE DE MARQUE (mission, positionnement, voix, ton, combats), une PROPOSITION DE VALEUR, un PERSONA (cliente idéale), un STORYTELLING, des CHAMPS LIGNE ÉDITO DÉJÀ REMPLIS, et/ou une CONVERSATION de coaching. Adapte-toi à ce qui est disponible.

Ton job : remplir la LIGNE ÉDITORIALE de ${prenom} — c'est-à-dire les facettes de marque, les piliers de contenu et le concept créatif.

══ DÉFINITIONS MÉTIER ══
- "step_1_hidden_facets" : les facettes cachées de la marque, les zones d'ombre / d'intimité que ${prenom} pourrait montrer pour incarner sa singularité (ex: son rapport au corps, sa vie d'indépendante, ses doutes). 2-4 phrases concrètes.
- "facet_1", "facet_2", "facet_3" : trois facettes courtes et incarnées de la marque. Phrases nominales courtes (5-12 mots), pas un paragraphe. Ex: "Mon rapport à la confiance en soi", "Ma vie de photographe indépendante", "Mes coulisses créatives".
- "pillar_major" : LE pilier majeur de contenu — le sujet central, le territoire d'expertise principal sur lequel ${prenom} prend la parole. Phrase courte (4-10 mots). Ex: "Portraits d'entrepreneures qui osent se montrer".
- "pillar_minor_1", "pillar_minor_2", "pillar_minor_3" : trois piliers mineurs DISTINCTS du pilier majeur, qui orbitent autour. Phrases courtes (4-10 mots chacun). Ex: "Coulisses de séances", "Conseils posture", "Vie d'indépendante".
- "creative_concept" : le concept créatif / twist unique qui RELIE les piliers entre eux et donne une signature reconnaissable. 1-3 phrases. Ex: "Chaque post commence par un détail brut du quotidien d'entrepreneure, puis bascule vers une vérité sur la confiance en soi."

══ RÈGLES DE COHÉRENCE MÉTIER ══
- Les 3 piliers mineurs DOIVENT être distincts du pilier majeur (pas de redite, pas de reformulation)
- Les piliers DOIVENT rester ancrés dans la voix, la mission, la cible et le combat de la marque — pas du contenu hors-sol
- Le concept créatif DOIT relier les piliers (pas une nouvelle idée déconnectée)
- Les facettes 1/2/3 doivent être complémentaires, couvrir des territoires différents (intime, pro, créatif…)
- Si un champ est DÉJÀ rempli dans le contexte, NE LE PROPOSE PAS à nouveau (tu n'écraseras rien — mais ça pollue)

══ RÈGLES STRICTES — FORMAT DE SORTIE ══
- Réponds UNIQUEMENT par un OBJET JSON PLAT valide, rien d'autre (pas de markdown, pas de texte avant/après, pas de \`\`\`json)
- Les SEULES clés autorisées sont EXACTEMENT celles listées dans le dernier message utilisateur, parmi : "step_1_hidden_facets", "facet_1", "facet_2", "facet_3", "pillar_major", "pillar_minor_1", "pillar_minor_2", "pillar_minor_3", "creative_concept"
- INTERDIT d'utiliser des clés alternatives comme "pilier_principal", "pilier_majeur", "axe_majeur", "concept", "concept_creatif", "axe_editorial", "ligne_editoriale", "facettes_cachees", "facettes", "piliers", "themes", "twist" ou tout autre alias
- INTERDIT d'imbriquer (pas de sous-objets, pas de tableaux) — chaque clé demandée DOIT mapper directement à une string
- Si une clé demandée s'appelle "pillar_major", ta sortie DOIT contenir littéralement "pillar_major" comme clé

══ RÈGLES DE CONTENU ══
- Tu DOIS produire une valeur concrète et plausible pour CHAQUE champ demandé
- Si tu n'as pas d'information directe, DÉDUIS intelligemment à partir de la mission, de la cible, des combats, des verbatims, de la voix
- Ne refuse JAMAIS sous prétexte de manque d'info — déduis. Une déduction plausible vaut mieux qu'un champ vide
- Ton incarné, oral, jamais corporate. Écriture inclusive avec point médian quand pertinent
- N'invente PAS de données qui CONTREDISENT explicitement le contexte`;

      let fillMessages = (messages || []).map((m: any) => ({
        role: m.role === "user" ? "user" as const : "assistant" as const,
        content: m.content,
      }));

      while (fillMessages.length > 0 && fillMessages[fillMessages.length - 1].role === "assistant") {
        fillMessages.pop();
      }
      if (fillMessages.length === 0) {
        fillMessages.push({ role: "user" as const, content: "Extrais les informations manquantes." });
      }

      const merged: typeof fillMessages = [];
      for (const msg of fillMessages) {
        if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
          merged[merged.length - 1].content += "\n\n" + msg.content;
        } else {
          merged.push({ ...msg });
        }
      }
      if (merged.length > 0 && merged[0].role === "assistant") {
        merged.unshift({ role: "user" as const, content: "Commence." });
      }

      for (const msg of merged) {
        if (msg.content.length > 3000) {
          msg.content = msg.content.slice(0, 3000) + "\n[...tronqué]";
        }
      }

      const rawFill = await callAnthropic({
        model: getDefaultModel(),
        system: fillSystemPrompt,
        messages: merged,
        temperature: 0.6,
        max_tokens: 2000,
      });

      await logUsage(userId, "coach", "branding_coaching", undefined, undefined, workspace_id || undefined);

      return new Response(JSON.stringify({ response: rawFill }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = BASE_SYSTEM_RULES + "\n\n" + buildSystemPrompt(section, context || {}, covered_topics || [], autofill_data, autofill_confidence);

    // Build anthropic messages — send ALL messages, no pruning
    let anthropicMessages = (messages || []).map((m: any) => ({
      role: m.role === "user" ? "user" as const : "assistant" as const,
      content: m.content,
    }));

    if (anthropicMessages.length === 0) {
      anthropicMessages.push({
        role: "user" as const,
        content: "Commence la session. Pose-moi ta première question.",
      });
    }

    // L'API exige que le dernier message soit "user"
    while (anthropicMessages.length > 0 && anthropicMessages[anthropicMessages.length - 1].role === "assistant") {
      anthropicMessages.pop();
    }

    if (anthropicMessages.length === 0) {
      anthropicMessages.push({
        role: "user" as const,
        content: "Continue la session. Pose-moi la prochaine question.",
      });
    }

    // Fusionner les messages consécutifs du même rôle
    const mergedMessages: typeof anthropicMessages = [];
    for (const msg of anthropicMessages) {
      if (mergedMessages.length > 0 && mergedMessages[mergedMessages.length - 1].role === msg.role) {
        mergedMessages[mergedMessages.length - 1].content += "\n\n" + msg.content;
      } else {
        mergedMessages.push({ ...msg });
      }
    }

    // S'assurer que le premier message est "user"
    if (mergedMessages.length > 0 && mergedMessages[0].role === "assistant") {
      mergedMessages.unshift({
        role: "user" as const,
        content: "Commence la session.",
      });
    }

    // ── Garde-fou : limiter la taille du payload ──
    const MAX_MESSAGES = 20;
    const MAX_CHARS_PER_MESSAGE = 1500;
    for (const msg of mergedMessages) {
      if (msg.content.length > MAX_CHARS_PER_MESSAGE) {
        msg.content = msg.content.slice(0, MAX_CHARS_PER_MESSAGE) + "\n[...réponse tronquée pour la suite de la session]";
      }
    }
    if (mergedMessages.length > MAX_MESSAGES) {
      const originalLen = mergedMessages.length;
      const first = mergedMessages[0];
      const recent = mergedMessages.slice(-(MAX_MESSAGES - 1));
      if (first.role === recent[0].role) {
        mergedMessages.splice(0, mergedMessages.length, ...recent);
      } else {
        mergedMessages.splice(0, mergedMessages.length, first, ...recent);
      }
      console.log(`[BrandingCoaching] Pruned messages from ${originalLen} to ${mergedMessages.length}`);
      }


    let rawResponse: string;
    let wasTruncated = false;

    const aiResult = await callAnthropicWithMeta({
      model: getModelForAction("coaching"),
      system: systemPrompt,
      messages: mergedMessages,
      temperature: 0.7,
      max_tokens: 4096,
    });
    rawResponse = aiResult.text;
    wasTruncated = aiResult.stop_reason === "max_tokens";

    if (wasTruncated) {
      console.warn("[BrandingCoaching] Response truncated (max_tokens reached). Retrying with higher limit...");
      const retryResult = await callAnthropicWithMeta({
        model: getModelForAction("coaching"),
        system: systemPrompt + "\n\nATTENTION : ta réponse précédente a été tronquée car trop longue. Sois CONCIS. La question doit faire 1-2 phrases max. Les extracted_insights doivent être courts. Pas de remaining_topics si la liste est longue.",
        messages: mergedMessages,
        temperature: 0.7,
        max_tokens: 6000,
      });
      rawResponse = retryResult.text;
      wasTruncated = retryResult.stop_reason === "max_tokens";
      if (wasTruncated) {
        console.error("[BrandingCoaching] Response STILL truncated after retry.");
      }
    }

    let parsed;
    const cleaned = rawResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        try {
          parsed = JSON.parse(cleaned.slice(start, end + 1));
        } catch {
          console.error("JSON parse failed after truncation handling. Raw:", rawResponse);
          parsed = {
            question: cleaned.length > 20 ? cleaned.slice(0, 200) + "..." : "Peux-tu reformuler ta réponse ?",
            question_type: "textarea",
            placeholder: "Ta réponse...",
            is_complete: false,
            completion_percentage: 0,
            covered_topic: null,
            remaining_topics: SECTION_CHECKLISTS[section] || [],
          };
        }
      } else {
        console.error("No JSON found in response:", rawResponse);
        parsed = {
          question: cleaned.length > 20 ? cleaned.slice(0, 200) + "..." : "Peux-tu reformuler ta réponse ?",
          question_type: "textarea",
          placeholder: "Ta réponse...",
          is_complete: false,
          completion_percentage: 0,
          covered_topic: null,
          remaining_topics: SECTION_CHECKLISTS[section] || [],
        };
      }
    }

    // ── Filet de sécurité : forcer la complétion si tous les sujets sont couverts ──
    const checklist = SECTION_CHECKLISTS[section] || [];
    const allCoveredTopics = [...(covered_topics || [])];
    if (parsed.covered_topic) allCoveredTopics.push(parsed.covered_topic);
    const uniqueCovered = [...new Set(allCoveredTopics)];
    const normalizedCovered = uniqueCovered
      .map(t => normalizeCoveredTopic(t, section))
      .filter(Boolean) as string[];
    const remaining = checklist.filter(t => !normalizedCovered.includes(t));

    if (remaining.length === 0 && !parsed.is_complete) {
      console.log(`[BrandingCoaching] All ${checklist.length} topics covered but is_complete was false — forcing completion`);
      parsed.is_complete = true;
      parsed.completion_percentage = 100;
      if (!parsed.final_summary) {
        parsed.final_summary = "Ta section est complète ! Tu peux retrouver tout ce qu'on a construit dans ta fiche. N'hésite pas à y revenir pour ajuster.";
      }
    }

    // Si la réponse a été tronquée ET qu'il ne reste qu'un seul sujet, forcer aussi
    if (wasTruncated && remaining.length <= 1 && !parsed.is_complete) {
      console.warn(`[BrandingCoaching] Response truncated with ${remaining.length} topic(s) remaining — forcing completion`);
      parsed.is_complete = true;
      parsed.completion_percentage = 100;
      if (!parsed.final_summary) {
        parsed.final_summary = "On a fait un super travail ensemble ! Ta fiche est remplie. Tu peux toujours compléter ou modifier les champs directement.";
      }
    }

    // Normalize covered_topic to match checklist keys exactly
    if (parsed.covered_topic) {
      parsed.covered_topic = normalizeCoveredTopic(parsed.covered_topic, section);
    }

    await logUsage(userId, "coach", "branding_coaching", undefined, undefined, workspace_id || undefined);

    return new Response(JSON.stringify({ response: parsed }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (error instanceof AuthError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    console.error("branding-coaching error:", error);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
