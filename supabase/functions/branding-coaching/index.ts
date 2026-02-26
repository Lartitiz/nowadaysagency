import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic, getDefaultModel } from "../_shared/anthropic.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { ANTI_SLOP } from "../_shared/copywriting-prompts.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";

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

function buildSystemPrompt(section: string, context: any, coveredTopics: string[]): string {
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

  return `Tu es l'assistante branding de Nowadays. Tu aides ${prenom} à construire la section "${sectionName}" de son branding.

══ CONTEXTE DE ${prenom.toUpperCase()} ══
${contextLines.join("\n")}

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
- Si la réponse est courte ou vague, creuse ("Ah intéressant, tu peux m'en dire plus ?")
- Si TOUS les sujets sont couverts, mets is_complete à true

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
  "final_summary": "Un résumé structuré en 3 parties :\n\n✅ Ce qu'on a construit ensemble : [résumé des éléments clés extraits]\n\n💡 Pour aller plus loin : [2-3 suggestions concrètes d'amélioration]\n\n🎯 Prochaine étape : [une action concrète à faire maintenant]"
}`;
}

serve(async (req) => {
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authenticate via JWT
    const { userId } = await authenticateRequest(req);

    const { section, messages, context, covered_topics, workspace_id } = body;

    if (!section) {
      return new Response(JSON.stringify({ error: "section requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

      return new Response(JSON.stringify({ response: rawStory }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = BASE_SYSTEM_RULES + "\n\n" + buildSystemPrompt(section, context || {}, covered_topics || []) + "\n\n" + ANTI_SLOP;

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

    const rawResponse = await callAnthropic({
      model: getDefaultModel(),
      system: systemPrompt,
      messages: mergedMessages,
      temperature: 0.7,
      max_tokens: 1500,
    });

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
          console.error("JSON parse failed. Raw response:", rawResponse);
          parsed = {
            question: cleaned.length > 0 ? cleaned : "Peux-tu reformuler ta réponse ?",
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
          question: cleaned.length > 0 ? cleaned : "Peux-tu reformuler ta réponse ?",
          question_type: "textarea",
          placeholder: "Ta réponse...",
          is_complete: false,
          completion_percentage: 0,
          covered_topic: null,
          remaining_topics: SECTION_CHECKLISTS[section] || [],
        };
      }
    }

    return new Response(JSON.stringify({ response: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (error instanceof AuthError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("branding-coaching error:", error);
    const status = (error as any).status || 500;
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erreur interne" }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
