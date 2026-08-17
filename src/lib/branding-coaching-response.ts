import type { InvokeError } from "@/lib/invoke-with-timeout";

export interface AIResponse {
  question: string;
  question_type: "text" | "textarea" | "select" | "multi_select";
  options?: string[];
  placeholder?: string;
  covered_topic?: string | null;
  extracted_insights?: Record<string, any>;
  is_complete: boolean;
  completion_percentage: number;
  remaining_topics?: string[];
  final_summary?: string;
}

const QUESTION_TYPES = ["text", "textarea", "select", "multi_select"] as const;

/** Maps an edge function InvokeError to the user-facing message shown in the coaching UI. */
export function getInvokeErrorMessage(err: InvokeError): string {
  if (err.isRateLimit) return "L'IA a besoin d'un petit instant. Attends quelques secondes avant de réessayer 😊";
  if (err.isTimeout) return "La génération prend plus de temps que prévu. Réessaie dans quelques instants.";
  if (err.isAuth) return "Ta session a expiré. Reconnecte-toi pour continuer.";
  if (err.isNetwork) return "Connexion perdue. Vérifie ta connexion internet et réessaie.";
  if (err.message?.includes("invalide") || err.message?.includes("Données")) {
    return "Un souci technique est survenu. Réessaie en reformulant ta réponse 😊";
  }
  return "L'IA a eu un blanc. Ça arrive 😅";
}

/** Parses the raw edge function payload (JSON string or already-parsed object) into an AIResponse. Throws on unparseable JSON. */
export function parseAIResponseRaw(raw: unknown): AIResponse {
  if (typeof raw === "string") {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as AIResponse;
  }
  return raw as AIResponse;
}

/** True when the parsed payload has neither a question nor a completion flag — an unusable response. */
export function isAIResponseShapeInvalid(parsed: AIResponse | null | undefined): boolean {
  return !parsed || (!parsed.question && !parsed.is_complete);
}

/** Detects a question that looks cut off mid-sentence and trims it back to the last clean punctuation. */
export function cleanTruncatedQuestion(question: string): string {
  const q = question.trim();
  const seemsTruncated = q.endsWith("...") && q.length > 150;
  if (!seemsTruncated) return q;
  console.warn("[BrandingCoaching] Question may be truncated, cleaning up:", q.slice(-50));
  const lastCleanEnd = Math.max(q.lastIndexOf("?"), q.lastIndexOf("."), q.lastIndexOf("!"));
  if (lastCleanEnd > q.length * 0.5) {
    return q.slice(0, lastCleanEnd + 1);
  }
  return q;
}

export function normalizeQuestionType(questionType: AIResponse["question_type"]): AIResponse["question_type"] {
  return (QUESTION_TYPES as readonly string[]).includes(questionType) ? questionType : "textarea";
}

export function clampCompletionPercentage(pct: number): number {
  if (typeof pct !== "number" || pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

/** Applies the standard branding-coaching normalizations (truncation cleanup, question_type fallback, pct clamping) to a parsed response. Mutates and returns the same object, matching the previous inline behavior. */
export function normalizeAIResponse(parsed: AIResponse): AIResponse {
  if (parsed.question && !parsed.is_complete) {
    parsed.question = cleanTruncatedQuestion(parsed.question);
  }
  parsed.question_type = normalizeQuestionType(parsed.question_type);
  parsed.completion_percentage = clampCompletionPercentage(parsed.completion_percentage);
  return parsed;
}

// --- Charter section: step-based flow (distinct edge function + question set) ---

export const CHARTER_TOPICS = ["mood_place", "colors", "visual_style", "typography", "logo", "visual_donts"] as const;

// Shorter phrasing than handleStart's intro questions — this is the follow-up
// question appended after the AI's feedback on the previous answer, not the
// standalone opening question. Keep them distinct; not the same UI moment.
export const CHARTER_FOLLOWUP_QUESTIONS = [
  "Si ta marque était un lieu, ce serait quoi ?",
  "Quelles couleurs te font vibrer quand tu penses à ta marque ? Pas celles que tu 'devrais' utiliser : celles qui te PARLENT. Décris-les ou donne des codes HEX.",
  "Comment décrirais-tu le style de tes visuels ? Donne-moi 3 mots qui décrivent l'ambiance visuelle que tu veux créer.",
  "Pour les polices de caractères : tu préfères un style plutôt classique et élégant, moderne et clean, ou manuscrit et organique ?",
  "As-tu déjà un logo ? Si oui, décris-le. Si non, pas de panique !",
  "Qu'est-ce que tu DÉTESTES visuellement ? Les trucs qui te font fuir quand tu les vois sur un compte Instagram ?",
];

/** Maps a charter-coaching edge function payload to the shared AIResponse shape. stepNum is the 1-based step just answered. */
export function buildCharterAIResponse(parsed: any, stepNum: number): AIResponse {
  const coveredTopic = CHARTER_TOPICS[stepNum - 1] || null;
  const isComplete = stepNum >= 6;
  const nextQuestion = !isComplete ? CHARTER_FOLLOWUP_QUESTIONS[stepNum] : "";

  const questionText = isComplete
    ? `${parsed.feedback || ""}\n\n${parsed.suggestion || ""}`
    : `${parsed.feedback || ""}\n\n${parsed.suggestion || ""}\n\n---\n\n${nextQuestion}`;

  return {
    question: questionText.trim(),
    question_type: "textarea",
    placeholder: "Ta réponse...",
    covered_topic: coveredTopic,
    extracted_insights: { ...parsed.extracted, ai_generated_brief: parsed.ai_generated_brief },
    is_complete: isComplete,
    completion_percentage: Math.round((stepNum / 6) * 100),
    remaining_topics: CHARTER_TOPICS.slice(stepNum),
    final_summary: isComplete
      ? `✅ Ta charte graphique est posée !\n\n${parsed.ai_generated_brief || parsed.feedback || ""}`
      : undefined,
  };
}
