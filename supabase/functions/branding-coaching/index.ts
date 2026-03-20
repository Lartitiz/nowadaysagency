import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic, callAnthropicWithMeta, getDefaultModel } from "../_shared/anthropic.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { ANTI_SLOP } from "../_shared/copywriting-prompts.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";

const SECTION_CHECKLISTS: Record<string, string[]> = {
  story: ["story_origin", "story_turning_point", "story_struggles", "story_unique", "story_vision"],
  persona: ["description", "demographics", "frustrations", "desires", "objections", "buying_triggers", "channels", "daily_life"],
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
  description: "Portrait général",
  demographics: "Âge, situation, localisation",
  frustrations: "Ce qui la bloque",
  desires: "Ce qu'elle veut vraiment",
  objections: "Ses objections",
  buying_triggers: "Déclencheurs d'achat",
  channels: "Où elle traîne",
  daily_life: "Sa journée type",
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
  "portrait": "description", "profil": "description",
  "age": "demographics", "démographie": "demographics", "situation": "demographics",
  "blocages": "frustrations", "problemes": "frustrations", "problèmes": "frustrations",
  "envies": "desires", "aspirations": "desires", "besoins": "desires",
  "freins": "objections", "hesitations": "objections", "hésitations": "objections",
  "declencheurs": "buying_triggers", "déclencheurs": "buying_triggers", "triggers": "buying_triggers",
  "canaux": "channels", "reseaux": "channels", "réseaux": "channels", "plateformes": "channels",
  "journee": "daily_life", "journée": "daily_life", "quotidien": "daily_life",
  // tone_style
  "ton": "tone_description", "voix": "tone_description", "style_communication": "tone_description",
  "do": "tone_do", "je_fais": "tone_do",
  "dont": "tone_dont", "je_ne_fais_pas": "tone_dont", "limites": "tone_dont",
  "combat": "combats", "engagements": "combats", "valeurs_combat": "combats",
  "style_visuel": "visual_style", "esthetique": "visual_style", "esthétique": "visual_style",
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
    contextLines.push(`\nDONNÉES EXISTANTES :\n${JSON.stringify(existing, null, 2)}`);
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
section === "persona" ? `- "description": string, portrait général de la cliente idéale
- "demographics": string, âge, situation, localisation
- "step_1_frustrations": string, ce qui la bloque / ses frustrations
- "step_2_transformation": string, ce qu'elle veut vraiment / sa transformation rêvée
- "step_3a_objections": string, ses objections principales
- "buying_triggers": tableau JSON, les déclencheurs d'achat
- "channels": tableau de strings, où elle traîne en ligne
- "daily_life": string, sa journée type` :
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
N'inclus dans extracted_insights QUE les clés ci-dessus. Inclus uniquement celles qui sont pertinentes pour la réponse qui vient d'être donnée (pas toutes à chaque fois).

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
  "final_summary": "Un résumé structuré en 3 parties :\\n\\n✅ Ce qu'on a construit ensemble : [résumé des éléments clés extraits]\\n\\n💡 Pour aller plus loin : [2-3 suggestions concrètes d'amélioration]\\n\\n🎯 Prochaine étape : [une action concrète à faire maintenant]"
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

    const systemPrompt = BASE_SYSTEM_RULES + "\n\n" + buildSystemPrompt(section, context || {}, covered_topics || [], autofill_data, autofill_confidence) + "\n\n" + ANTI_SLOP;

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
    const MAX_CHARS_PER_MESSAGE = 3000;
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


    let rawResponse: string;
    let wasTruncated = false;

    const aiResult = await callAnthropicWithMeta({
      model: getDefaultModel(),
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
        model: getDefaultModel(),
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
