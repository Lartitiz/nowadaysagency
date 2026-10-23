// « Remplir depuis LinkedIn » : l'avertissement ne cite que les chiffres AFFICHÉS
// dans l'encart « Mes stats LinkedIn » (InstagramStats.tsx) qui manquent.
// Le serveur pose `partial` dès qu'une des 10 mesures manque ; or LinkedIn répond
// 500 à chaque appel sur FOLLOWER_GAINED_FROM_CONTENT et PROFILE_VIEW_FROM_CONTENT
// (journaux du 23/10/2026), deux mesures que la page n'affiche pas : l'avertissement
// sortait donc à chaque fois.
const AFFICHEES: { label: string; valeur: (m: any) => unknown }[] = [
  { label: "abonnés", valeur: (m) => m?.followers },
  { label: "abonnés gagnés", valeur: (m) => m?.followersGained30d },
  { label: "impressions", valeur: (m) => m?.postAnalytics30d?.impressions },
  { label: "membres touchés", valeur: (m) => m?.postAnalytics30d?.membersReached },
  { label: "réactions", valeur: (m) => m?.postAnalytics30d?.reactions },
  { label: "commentaires", valeur: (m) => m?.postAnalytics30d?.comments },
  { label: "reposts", valeur: (m) => m?.postAnalytics30d?.reshares },
  { label: "clics sur lien", valeur: (m) => m?.postAnalytics30d?.linkClicks },
];

export function statsLinkedInManquantes(metrics: unknown): string[] {
  return AFFICHEES.filter((a) => typeof a.valeur(metrics) !== "number").map((a) => a.label);
}
