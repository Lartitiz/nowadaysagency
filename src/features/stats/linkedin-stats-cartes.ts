// Chiffres de l'encart « Mes stats LinkedIn » (InstagramStats.tsx), prêts à afficher.
// LinkedIn peut renvoyer un total NÉGATIF sur 30 jours : un repost (ou une
// réaction, un commentaire) retiré pendant la période est compté en moins, et
// l'écran affichait « -1 Reposts » (compte de Laetitia, 24/11/2026). Un compteur
// ne descend jamais sous 0 à l'écran. On borne ICI, à l'affichage, pour que les
// relevés déjà enregistrés (monthly_stats.custom_data.li_stats) soient corrects
// sans rien réécrire en base.
export interface LiStatsSnapshot {
  followers?: number | null;
  followersGained30d?: number | null;
  postAnalytics30d?: Record<string, number | null | undefined> | null;
  fetchedAt?: string;
}

const CARTES: { label: string; valeur: (s: LiStatsSnapshot) => unknown }[] = [
  { label: "Abonnés", valeur: (s) => s.followers },
  { label: "Abonnés gagnés", valeur: (s) => s.followersGained30d },
  { label: "Impressions", valeur: (s) => s.postAnalytics30d?.impressions },
  { label: "Membres touchés", valeur: (s) => s.postAnalytics30d?.membersReached },
  { label: "Réactions", valeur: (s) => s.postAnalytics30d?.reactions },
  { label: "Commentaires", valeur: (s) => s.postAnalytics30d?.comments },
  { label: "Reposts", valeur: (s) => s.postAnalytics30d?.reshares },
  { label: "Clics sur lien", valeur: (s) => s.postAnalytics30d?.linkClicks },
];

/** Un chiffre absent (ou illisible) n'a pas de carte ; un chiffre négatif vaut 0. */
export function cartesStatsLinkedIn(snapshot: LiStatsSnapshot | null | undefined): { label: string; value: number }[] {
  if (!snapshot) return [];
  return CARTES.flatMap((c) => {
    const v = c.valeur(snapshot);
    return typeof v === "number" && Number.isFinite(v) ? [{ label: c.label, value: Math.max(0, v) }] : [];
  });
}
