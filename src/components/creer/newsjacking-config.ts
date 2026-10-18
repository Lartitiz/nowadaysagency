// Types, réglages d'affichage et libellés du panneau « Réagir à une actualité »
// (sortis de NewsjackingPanel.tsx, gelé par le cliquet anti-dette, 18/10/2026).
export interface ActuAngle {
  vehicule: string;
  hook: string;
  description: string;
  format_suggere: string;
}

export interface Actu {
  titre: string;
  resume: string;
  source: string;
  source_url?: string;
  date_publication?: string;
  type: "globale" | "niche";
  axe?: string;
  ton?: string;
  force_pont?: "fort" | "moyen" | "fragile";
  pertinence: string;
  faits_cles?: string[];
  from_url?: boolean;
  // "reaction" = actu choisie en mode élargi (macro/scoop) ou lien sans pont fort :
  // le générateur d'angles relâche le pivot métier. Transite tel quel vers
  // newsjacking-angles (le panel renvoie l'actu entière).
  angle_mode?: "reaction";
  // angles are now generated on demand
}

export interface NewsjackingPanelProps {
  onSelect: (data: { subject: string; context: string; format?: string; vehicule?: string }) => void;
  onClose: () => void;
  workspaceId?: string;
}

export const VEHICULE_CONFIG: Record<string, { emoji: string; label: string; className: string }> = {
  recit_experience: { emoji: "📖", label: "Récit", className: "bg-[hsl(var(--accent))]/20 text-[hsl(var(--accent-foreground))]" },
  declencheur_externe: { emoji: "🔗", label: "Déclencheur", className: "bg-primary/10 text-primary" },
  constat_decale: { emoji: "🔍", label: "Constat", className: "bg-secondary/40 text-secondary-foreground" },
  montrer_plutot_quexpliquer: { emoji: "👁", label: "Montrer", className: "bg-[hsl(var(--accent))]/30 text-[hsl(var(--accent-foreground))]" },
  parallele_absurde: { emoji: "🎭", label: "Parallèle", className: "bg-primary/15 text-primary" },
};

export const AXE_CONFIG: Record<string, { emoji: string; label: string }> = {
  // Nouveaux axes (micro-phénomènes culturels)
  mot_qui_revient: { emoji: "💬", label: "Mot" },
  obsession_collective: { emoji: "🌀", label: "Obsession" },
  comportement_emergent: { emoji: "🔄", label: "Comportement" },
  debat_recurrent: { emoji: "⚖️", label: "Débat" },
  objet_culturel: { emoji: "🎬", label: "Culture" },
  actu_connectable: { emoji: "📰", label: "Actu" },
  // Anciens (rétro-compat)
  societe_debat: { emoji: "🗣️", label: "Société" },
  economie_argent: { emoji: "💶", label: "Économie" },
  culture_pop: { emoji: "🎬", label: "Culture" },
  science_decouverte: { emoji: "🔬", label: "Science" },
  politique_loi: { emoji: "⚖️", label: "Politique" },
  viral_insolite: { emoji: "🌀", label: "Viral" },
};

export const TON_CONFIG: Record<string, { emoji: string; label: string; className: string }> = {
  // Nouveaux registres
  confortable: { emoji: "🪴", label: "Confortable", className: "bg-secondary/40 text-secondary-foreground" },
  entre_deux: { emoji: "🔀", label: "Angle inattendu", className: "bg-primary/10 text-primary" },
  decalant: { emoji: "✨", label: "Décalant", className: "bg-[hsl(var(--accent))]/30 text-[hsl(var(--accent-foreground))]" },
  // Anciens (rétro-compat)
  serieux_marquant: { emoji: "💭", label: "Marquant", className: "bg-secondary/40 text-secondary-foreground" },
  drole_decale: { emoji: "😏", label: "Drôle", className: "bg-[hsl(var(--accent))]/30 text-[hsl(var(--accent-foreground))]" },
  surprenant_contre_intuitif: { emoji: "⚡", label: "Surprenant", className: "bg-primary/10 text-primary" },
};

export const PONT_CONFIG: Record<string, { emoji: string; label: string; className: string }> = {
  fort: { emoji: "🟢", label: "Lien direct avec ton activité", className: "bg-success/15 text-success" },
  moyen: { emoji: "🟡", label: "Lien plus large", className: "bg-warning/15 text-warning" },
  fragile: { emoji: "🔴", label: "Lien fragile", className: "bg-muted text-muted-foreground" },
};

export interface AnglesState {
  loading: boolean;           // chargement du primary (1er angle)
  data?: ActuAngle[];         // angles actuellement affichés (1 si seulement primary, 3 après variants)
  error?: string;
  errorCode?: "TIMEOUT" | "AUTH" | "NETWORK" | "RATE_LIMIT" | "SERVER" | "UNKNOWN";
  startedAt?: number;
  slow?: boolean;             // true après 15s sans réponse
  primaryOnly?: boolean;      // true si on a 1 angle (primary) sans variantes encore
  variantsLoading?: boolean;  // chargement des 2 variantes à la demande
  variantsError?: string;
  variantsSlow?: boolean;
}

// Combien d'actus dont on pré-calcule l'angle "primary" en arrière-plan
// dès que la recherche d'actus aboutit.
export const PRECOMPUTE_COUNT = 2;

export const VIBES: { id: string; emoji: string; label: string }[] = [
  { id: "scoop", emoji: "💥", label: "Actu choc à rebondir" },
  { id: "phenomene", emoji: "🌀", label: "Phénomène culturel" },
  { id: "debat", emoji: "⚖️", label: "Débat clivant" },
  { id: "stat", emoji: "📊", label: "Stat ou étude étonnante" },
  { id: "tendance", emoji: "🌱", label: "Tendance émergente" },
  { id: "culture", emoji: "🎬", label: "Sortie culturelle" },
  { id: "combat", emoji: "🧭", label: "Combat / cause de société" },
];

export const MAX_VIBES = 3;
export const MAX_INTENT_CHARS = 200;

// Perplexity renvoie parfois ses balises de citation (<cite index="40-3">…</cite>)
// dans le résumé/la pertinence. On les retire à l'affichage — filet de sécurité ;
// le strip principal est fait côté edge à la normalisation.
export function stripCitations(text?: string): string {
  if (!text) return "";
  return text
    .replace(/<\/?cite[^>]*>/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Étapes de progression affichées pendant la recherche (~30-90 s) pour
// remplacer le spinner muet : rassure que ça avance, pas que ça a planté.
export function searchStageLabel(elapsed: number): string {
  if (elapsed < 12) return "Je cherche les actus fraîches du moment…";
  if (elapsed < 30) return "Je croise avec l'univers de ta marque…";
  if (elapsed < 60) return "Je prépare les premiers angles pour toi…";
  return "Encore un instant, je fouille en profondeur…";
}
