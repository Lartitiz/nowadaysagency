// « Refaire cette story » (chantier 4, 12/11/2026). Sur le modèle de « Refaire
// cette slide » du carrousel, mais sans nouvelle edge function : la réécriture
// passe par ai-text-action (menu IA sur sélection), qui charge déjà le ton de la
// marque et suit checkQuota → IA → logUsage (1 crédit). Seul le texte de la
// story change ; son fond, sa photo, son sticker et les autres stories restent.

/** Exemples qui tournent dans le champ vide, comme pour le carrousel. */
export const STORY_REDO_EXAMPLES = ["plus court", "plus personnel", "termine par une question", "plus direct"];

/** Plafond serveur de la consigne (ai-text-action, MAX_ACTION_PROMPT = 1 000). */
const MAX_PROMPT = 1000;
const MAX_INSTRUCTION = 300;
const MAX_NEIGHBOUR = 160;

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function buildStoryRedoPrompt({ number, total, role, instruction, previous, next }: {
  number: number;
  total: number;
  role?: string | null;
  instruction: string;
  previous?: string | null;
  next?: string | null;
}): string {
  const parts = [
    `Réécris cette story Instagram (story ${number} sur ${total}${role ? `, rôle : ${role}` : ""}).`,
    "Garde son idée et sa place dans la séquence, avec une nouvelle formulation, à peu près la même longueur, 350 caractères au plus.",
    instruction.trim() ? `Demande de la personne : ${clip(instruction, MAX_INSTRUCTION)}` : "",
    previous?.trim() ? `Story d'avant (ne pas répéter) : « ${clip(previous, MAX_NEIGHBOUR)} »` : "",
    next?.trim() ? `Story d'après (ne pas répéter) : « ${clip(next, MAX_NEIGHBOUR)} »` : "",
    "Retourne seulement le texte de la story.",
  ];
  return parts.filter(Boolean).join("\n").slice(0, MAX_PROMPT);
}

/** Nettoie la réponse : guillemets d'encadrement que l'IA ajoute parfois. */
export function cleanStoryRedo(result: unknown): string {
  return String(result ?? "").trim().replace(/^["«“]\s*([\s\S]*?)\s*["»”]$/u, "$1").trim();
}
