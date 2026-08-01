import { toLocalDateStr } from "@/lib/utils";

/**
 * Cartes de planning proposées par l'Assistant dans le chat.
 *
 * Avant : l'assistant ne pouvait QUE proposer des liens de navigation. Un
 * bouton "Ajouter au calendrier" ouvrait donc le calendrier… sans rien y
 * ajouter, et les autres contenus proposés étaient perdus au changement de
 * page. Ces cartes portent un vrai INSERT, une par une, sans quitter le chat.
 */
export interface ChatPlanItem {
  kind: "plan";
  day: string;
  format: string;
  subject: string;
  objective: string;
}

/** Objectifs que le reste de l'app sait lire (filtres calendrier, couleurs, génération) */
export const CANONICAL_OBJECTIFS = ["visibilite", "confiance", "vente", "credibilite"] as const;

/**
 * Le coaching calendrier parle en inspirer/eduquer/vendre/lien, le reste de
 * l'app en visibilite/confiance/vente/credibilite. Sans traduction, un post
 * planifié atterrit avec un objectif que ni le filtre ni la fiche post ne
 * reconnaissent : il devient invisible au filtre et perd sa couleur.
 */
const OBJECTIF_ALIASES: Record<string, string> = {
  inspirer: "visibilite",
  eduquer: "credibilite",
  vendre: "vente",
  lien: "confiance",
};

export function normalizeObjectif(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if ((CANONICAL_OBJECTIFS as readonly string[]).includes(v)) return v;
  return OBJECTIF_ALIASES[v] ?? null;
}

export const PLAN_FORMAT_EMOJI: Record<string, string> = {
  post: "📝",
  post_carrousel: "🎠",
  reel: "🎬",
  story_serie: "📱",
  newsletter: "✉️",
};

export const PLAN_FORMAT_LABEL: Record<string, string> = {
  post: "Post",
  post_carrousel: "Carrousel",
  reel: "Reel",
  story_serie: "Story",
  newsletter: "Newsletter",
};

/** Route du générateur, sujet et objectif pré-remplis */
export function planItemRoute(item: ChatPlanItem): string {
  const base =
    item.format === "post_carrousel" ? "/creer?format=carousel"
    : item.format === "reel" ? "/creer?format=reel"
    : item.format === "story_serie" ? "/creer?format=story"
    : "/creer";
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}sujet=${encodeURIComponent(item.subject)}&objectif=${encodeURIComponent(item.objective)}`;
}

const DAY_INDEX: Record<string, number> = {
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
};

/**
 * Prochaine occurrence du jour nommé (aujourd'hui exclu, comme le coaching
 * calendrier : on planifie devant soi, jamais sur une date déjà passée).
 */
export function nextDateForDay(dayName: string, from: Date = new Date()): string {
  const target = DAY_INDEX[String(dayName).trim().toLowerCase()];
  if (target === undefined) return toLocalDateStr(from);
  let diff = target - from.getDay();
  if (diff <= 0) diff += 7;
  const date = new Date(from);
  date.setDate(from.getDate() + diff);
  return toLocalDateStr(date);
}

/**
 * Un bouton de navigation n'ajoute rien. Si le modèle lui colle un libellé qui
 * promet un ajout, on le réécrit — même garde que côté edge, pour que le
 * correctif tienne aussi sur les messages déjà enregistrés en base.
 */
export function guardCalendarLabel(route: string, label: string): string {
  if (!String(route).split("?")[0].startsWith("/calendrier")) return label;
  return /\bajout|\bplanifi|\bcaler\b|\bprogramm/i.test(label) ? "Ouvrir le calendrier" : label;
}

/**
 * Les cartes de planning sont rangées dans la même colonne jsonb `actions` que
 * les liens (pas de migration) : on les redistingue au chargement.
 */
export function splitStoredActions<T extends { route?: string; label?: string; icon?: string }>(
  stored: unknown,
): { actions: T[]; plan: ChatPlanItem[] } {
  if (!Array.isArray(stored)) return { actions: [], plan: [] };
  const actions: T[] = [];
  const plan: ChatPlanItem[] = [];
  for (const entry of stored) {
    if (entry && typeof entry === "object" && (entry as any).kind === "plan") {
      plan.push(entry as ChatPlanItem);
    } else if (entry && typeof entry === "object" && (entry as any).route) {
      const a = entry as T;
      actions.push({ ...a, label: guardCalendarLabel(a.route!, a.label ?? "") });
    }
  }
  return { actions, plan };
}
