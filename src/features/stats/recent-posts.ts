// Carte « Tes posts récents » de la page de stats Instagram : mise en mots des
// chiffres calculés côté serveur (supabase/functions/_shared/post-median.ts).

export type PostVerdict = "trop_tot" | "sorti_du_lot" | "au_dessus" | "en_dessous";

export interface RecentPost {
  id: string;
  subject?: string;
  format?: string;
  timestamp?: string;
  permalink?: string;
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  engagementRate?: number;
  xMedian?: number;
  verdict?: PostVerdict;
}

export interface LivePosts {
  top: RecentPost[];
  flop: RecentPost[];
  /** Absent des relevés enregistrés avant le 26/11/2026 : la carte garde alors l'ancien affichage. */
  recent?: RecentPost[];
  medianLikes?: number;
  medianSample?: number;
}

/** Ce que la lecture Instagram renvoie → ce que la carte affiche et que le mois garde. */
export function livePostsOf(m: {
  topPosts?: RecentPost[]; flopPosts?: RecentPost[]; recentPosts?: RecentPost[];
  medianLikes?: number; medianSample?: number;
} | null | undefined): LivePosts | null {
  if (!m || !(m.topPosts?.length || m.flopPosts?.length || m.recentPosts?.length)) return null;
  return {
    top: m.topPosts || [],
    flop: m.flopPosts || [],
    recent: m.recentPosts || [],
    medianLikes: m.medianLikes,
    medianSample: m.medianSample,
  };
}

export const VERDICT_LABEL: Record<PostVerdict, string> = {
  sorti_du_lot: "Sorti du lot",
  au_dessus: "Au-dessus",
  en_dessous: "En dessous",
  trop_tot: "Trop tôt",
};

const nombre = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/** « × 3,1 » */
export const multipleLabel = (x: number) => `× ${nombre(x)}`;

/** « 1 enregistrement », « 27 enregistrements », « 0 partage » */
export const compte = (n: number, mot: string) => `${nombre(n)} ${mot}${n > 1 ? "s" : ""}`;

/** Phrase d'en-tête : le post habituel du compte, ou pourquoi il n'y a pas encore de repère. */
export function habituelLabel(p: Pick<LivePosts, "medianLikes" | "medianSample">): string {
  if (typeof p.medianLikes !== "number" || !p.medianSample) {
    return "Il faut au moins 12 posts publiés depuis plus de 7 jours pour dire si un post sort du lot. En attendant, regarde tes enregistrements et tes partages.";
  }
  return `Un post habituel chez toi fait ${compte(p.medianLikes, "like")} (le milieu de tes ${p.medianSample} derniers posts).`;
}

/**
 * « Publié il y a 3 jours. Verdict à 7 jours. » Le verdict est figé au moment du
 * relevé : passé 7 jours, on invite à actualiser plutôt que d'annoncer un verdict
 * « à 7 jours » pour un post qui en a 12.
 */
export function tropTotLabel(timestamp: string | undefined, now: Date = new Date()): string {
  const t = timestamp ? new Date(timestamp).getTime() : NaN;
  if (!Number.isFinite(t)) return "Verdict à 7 jours.";
  const jours = Math.floor((now.getTime() - t) / 86400000);
  if (jours >= 7) return `Publié il y a ${jours} jours. Actualise tes stats pour voir son verdict.`;
  const quand = jours <= 0 ? "aujourd'hui" : jours === 1 ? "hier" : `il y a ${jours} jours`;
  return `Publié ${quand}. Verdict à 7 jours.`;
}

/**
 * Posts qui portent le bouton « Recycler ce sujet » : ceux qui sont sortis du lot ;
 * à défaut (aucun, ou pas encore de repère), les meilleurs au taux d'engagement.
 */
export function recyclableIds(p: LivePosts): Set<string> {
  const sortis = (p.recent || []).filter((r) => r.verdict === "sorti_du_lot").map((r) => r.id);
  return new Set(sortis.length ? sortis : p.top.slice(0, 3).map((r) => r.id));
}
