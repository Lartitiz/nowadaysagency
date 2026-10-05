// Comptes INTERNES (admin + comptes de test / recette) — SOURCE UNIQUE des
// exclusions de statistiques, partagée par cron-health, activation-funnel et
// admin-users (mode=stats).
//
// Avant le 05/10/2026, chaque edge avait sa propre liste : cron-health n'excluait
// que 3 emails + le motif `laetitia+cs…`, les deux autres tout alias `laetitia+…@`.
// Résultat : la recette de la semaine du 28/09 gonflait le bilan hebdo (coûts,
// cohortes) sans que les autres tableaux bougent. Une seule liste, ici.
//
// Règle : le domaine nowadaysagency.com n'a qu'UNE boîte réelle, celle de l'admin.
// Tout alias `laetitia+…@nowadaysagency.com` est donc un compte interne (qaneuf,
// qabranding, mobile, immo, cs, membres…). Ne JAMAIS ajouter ici un motif qui
// pourrait attraper une vraie cliente : seulement des adresses exactes, le
// domaine de l'agence, ou les variantes d'UNE boîte Gmail de Laetitia.

export const ADMIN_EMAIL = "laetitia@nowadaysagency.com";

// Adresses exactes (en minuscules) des comptes internes hors motif d'alias.
const INTERNAL_EMAILS = new Set<string>([
  ADMIN_EMAIL,
  "laetitiatest@nowadaysagency.com", // « Camille » — compte test de référence (visite quotidienne)
]);

const AGENCY_ALIAS = /^laetitia\+[^@]*@nowadaysagency\.com$/i;

// Boîtes Gmail de Laetitia : Gmail ignore les points et tout ce qui suit un « + »
// dans la partie avant @, donc laetitia.mattioli+test@gmail.com arrive dans la même
// boîte que laetitiamattioli@gmail.com — c'est forcément elle. Ajouté le 05/10/2026 :
// son compte Gmail (inscrit le 28/02) faisait 82 % du coût IA de la semaine en recette,
// et un 2e compte de test Gmail du 30/09 (validé par Laetitia).
const LAETITIA_GMAIL_BOXES = new Set<string>(["laetitiamattioli"]);
const gmailBox = (v: string) => {
  const m = v.match(/^([^@]+)@(gmail|googlemail)\.com$/);
  return m ? m[1].split("+")[0].replace(/\./g, "") : null;
};

const norm = (e: string | null | undefined) => (e || "").trim().toLowerCase();

/** Admin + comptes de test : exclus de toutes les STATISTIQUES (coûts, tunnel, cohortes). */
export function isInternalEmail(e: string | null | undefined): boolean {
  const v = norm(e);
  if (!v) return false;
  if (INTERNAL_EMAILS.has(v) || AGENCY_ALIAS.test(v)) return true;
  const box = gmailBox(v);
  return !!box && LAETITIA_GMAIL_BOXES.has(box);
}

/**
 * Comptes de test SEULEMENT (admin exclu de la liste) : pour les sondes qui
 * surveillent l'usage RÉEL, où le compte de Laetitia doit rester visible
 * (sa connexion LinkedIn, ses publications — scope daily de cron-health).
 */
export function isTestAccountEmail(e: string | null | undefined): boolean {
  return isInternalEmail(e) && norm(e) !== ADMIN_EMAIL;
}

/** « laetitia@nowadaysagency.com » → « la***@nowadaysagency.com » (jamais d'email complet en sortie). */
export function maskEmail(e: string | null | undefined): string {
  const v = norm(e);
  const at = v.indexOf("@");
  if (at < 1) return "***";
  return `${v.slice(0, Math.min(2, at))}***${v.slice(at)}`;
}
