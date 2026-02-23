import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SECTION_OBJECTIVES: Record<string, string> = {
  story: `Aide {prenom} à raconter son histoire en couvrant : son parcours, le déclic qui l'a lancée, les galères, ce qui la rend unique, sa vision. Le but : un récit authentique qui connecte émotionnellement.
Champs à remplir : story_origin, story_turning_point, story_struggles, story_unique, story_vision, story_full.`,

  persona: `Aide {prenom} à dresser le portrait précis de sa cliente idéale : qui elle est, ce qu'elle vit, ce qui la bloque, ce qu'elle désire, comment elle achète, ses objections. Le but : un portrait si précis que {prenom} pourrait l'appeler par son prénom.
Champs à remplir : description, demographics, frustrations, desires, objections, buying_triggers, channels, daily_life.`,

  value_proposition: `Aide {prenom} à formuler ce qui la rend unique et désirable : le problème qu'elle résout, pour qui, comment, et pourquoi elle (et pas une autre). Le but : des phrases claires réutilisables partout.
Champs à remplir : value_prop_problem, value_prop_solution, value_prop_difference, value_prop_proof, value_prop_sentence.`,

  tone_style: `Aide {prenom} à définir sa voix : comment elle parle, ce qu'elle défend, ses limites, son style visuel. Le but : un guide de ton utilisable pour chaque contenu.
Champs à remplir : tone_description, tone_do, tone_dont, combats, visual_style (+ tone_keywords déjà rempli à l'onboarding).`,

  content_strategy: `Aide {prenom} à définir ses piliers de contenu, son twist créatif, et sa ligne éditoriale. Le but : une colonne vertébrale claire pour ne plus jamais se demander 'je poste quoi'.
Champs à remplir : content_pillars (3-4), content_twist, content_formats, content_frequency, content_editorial_line.`,

  offers: `Aide {prenom} à formuler ses offres de manière désirable : nom, promesse, pour qui, à quel prix, pourquoi maintenant. Le but : des offres formulées pour donner envie.
Champs à remplir : name, price, description, target, promise, includes, objection_handler.`,
};

const SECTION_NAMES: Record<string, string> = {
  story: "Mon histoire",
  persona: "Mon client·e idéal·e",
  value_proposition: "Ma proposition de valeur",
  tone_style: "Mon ton, mon style & mes combats",
  content_strategy: "Ma stratégie de contenu",
  offers: "Mes offres",
};

function buildSystemPrompt(section: string, context: any): string {
  const prenom = context.profile?.prenom || context.profile?.first_name || "toi";
  const sectionName = SECTION_NAMES[section] || section;
  const objective = (SECTION_OBJECTIVES[section] || "").replace(/\{prenom\}/g, prenom);

  const contextLines: string[] = [];

  // Profile
  const p = context.profile;
  if (p) {
    contextLines.push(`Activité : ${p.activite || p.activity || "non renseigné"}`);
    if (p.type_activite || p.activity_type) contextLines.push(`Type : ${p.type_activite || p.activity_type}`);
    if (p.canaux?.length) contextLines.push(`Canaux : ${p.canaux.join(", ")}`);
    if (p.weekly_time || p.weekly_time_available) contextLines.push(`Temps disponible : ${p.weekly_time || p.weekly_time_available}`);
    if (p.main_blocker) contextLines.push(`Blocage principal : ${p.main_blocker}`);
    if (p.main_goal) contextLines.push(`Objectif : ${p.main_goal}`);
  }

  // Branding
  const b = context.branding;
  if (b) {
    if (b.positioning) contextLines.push(`Positionnement : ${b.positioning}`);
    if (b.mission) contextLines.push(`Mission : ${b.mission}`);
    if (b.tone_keywords) contextLines.push(`Ton : ${JSON.stringify(b.tone_keywords)}`);
    if (b.values) contextLines.push(`Valeurs : ${JSON.stringify(b.values)}`);
  }

  // Audit
  const a = context.audit;
  if (a) {
    if (a.score_global) contextLines.push(`Score audit global : ${a.score_global}/100`);
    if (a.points_forts?.length) contextLines.push(`Forces : ${a.points_forts.map((f: any) => f.titre || f).join(", ")}`);
    if (a.points_faibles?.length) contextLines.push(`Faiblesses : ${a.points_faibles.map((f: any) => f.titre || f).join(", ")}`);
  }

  // Existing section data
  const existing = context.existing_data;
  if (existing && Object.keys(existing).length > 0) {
    contextLines.push(`\nCE QU'ON SAIT DÉJÀ SUR CETTE SECTION :\n${JSON.stringify(existing, null, 2)}`);
  }

  // Documents
  if (context.documents?.length) {
    contextLines.push(`\nDOCUMENTS ANALYSÉS :\n${context.documents.map((d: any) => d.extracted_data ? JSON.stringify(d.extracted_data) : d.file_name).join("\n")}`);
  }

  return `Tu es l'assistante branding de Nowadays. Tu aides ${prenom} à construire la section "${sectionName}" de son branding.

Tu poses UNE question à la fois, personnalisée, dans un format conversationnel. Tu ne poses JAMAIS une question dont tu connais déjà la réponse.

══ CONTEXTE DE ${prenom.toUpperCase()} ══
${contextLines.join("\n")}

══ TON OBJECTIF ══
${objective}

══ RÈGLES ══
- Pose UNE seule question à la fois
- La question doit être SPÉCIFIQUE au contexte de ${prenom} (jamais générique)
- N'utilise JAMAIS de jargon marketing
- Ton : chaleureux, direct, comme une conversation entre amies. Tu tutoies.
- Si tu détectes quelque chose d'intéressant dans l'audit ou les documents, intègre-le naturellement
- Quand tu as assez d'infos, retourne is_complete: true
- Vise 8-12 questions par section, pas plus
- Chaque question creuse un angle DIFFÉRENT
- Utilise des expressions orales naturelles ("Franchement", "En vrai", "Le truc c'est que")
- Si la réponse est courte ou vague, creuse ("Ah intéressant, tu peux m'en dire plus ?")

══ FORMAT DE RÉPONSE ══
Retourne TOUJOURS un JSON valide, rien d'autre :
{
  "question": "La question à afficher",
  "question_type": "text" | "textarea" | "select" | "multi_select",
  "options": ["option1", "option2"],
  "placeholder": "Exemple de réponse...",
  "field_hint": "quel champ cette question remplirait",
  "extracted_insights": { "champ": "valeur extraite de la DERNIÈRE réponse" },
  "is_complete": false,
  "completion_percentage": 45,
  "recap_update": "phrase résumée pour la fiche"
}

Quand is_complete = true, ajoute :
{
  "is_complete": true,
  "completion_percentage": 100,
  "final_summary": "Résumé complet de la section en 3-5 phrases, écrit à la 3ème personne pour la fiche récap"
}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, section, messages, context } = await req.json();

    if (!user_id || !section) {
      return new Response(JSON.stringify({ error: "user_id et section requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = buildSystemPrompt(section, context || {});

    // Build anthropic messages from conversation history
    const anthropicMessages = (messages || []).map((m: any) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

    // If no messages yet, add initial prompt
    if (anthropicMessages.length === 0) {
      anthropicMessages.push({
        role: "user",
        content: "Commence la session. Pose-moi ta première question.",
      });
    }

    const rawResponse = await callAnthropic({
      model: "claude-sonnet-4-5-20250929",
      system: systemPrompt,
      messages: anthropicMessages,
      temperature: 0.8,
      max_tokens: 1500,
    });

    // Extract JSON from the response robustly
    let parsed;
    const cleaned = rawResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Try to find the outermost JSON object
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        try {
          parsed = JSON.parse(cleaned.slice(start, end + 1));
        } catch (e2) {
          console.error("JSON parse failed. Raw response:", rawResponse);
          // Fallback: return the raw text as a question
          parsed = {
            question: cleaned.length > 0 ? cleaned : "Peux-tu reformuler ta réponse ?",
            question_type: "textarea",
            placeholder: "Ta réponse...",
            is_complete: false,
            completion_percentage: 0,
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
        };
      }
    }

    return new Response(JSON.stringify({ response: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("branding-coaching error:", error);
    const status = (error as any).status || 500;
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erreur interne" }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
