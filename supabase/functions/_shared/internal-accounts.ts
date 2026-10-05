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
// pourrait attraper une vraie cliente : seulement des adresses exactes ou le
// domaine de l'agence.

export const ADMIN_EMAIL = "laetitia@nowadaysagency.com";

// Adresses exactes (en minuscules) des comptes internes hors motif d'alias.
const INTERNAL_EMAILS = new Set<string>([
  ADMIN_EMAIL,
  "laetitiatest@nowadaysagency.com", // « Camille » — compte test de référence (visite quotidienne)
]);

const AGENCY_ALIAS = /^laetitia\+[^@]*@nowadaysagency\.com$/i;

const norm = (e: string | null | undefined) => (e || "").trim().toLowerCase();

// Boîte Gmail PERSONNELLE de Laetitia (05/10/2026) : ses comptes de recette
// gmail (inscrits le 28/02 et le 30/09) faisaient 91 % du coût du bilan hebdo
// du 05/10, comptés comme des clientes. Gmail ignore les points et tout
// suffixe `+…` : `laetitia.mattioli+recette@gmail.com` arrive dans la MÊME
// boîte, donc ne peut appartenir qu'à elle. On compare la boîte normalisée,
// jamais un préfixe (`laetitia@gmail.com` reste une cliente possible).
const PERSONAL_GMAIL_BOX = "laetitiamattioli";
function isPersonalGmail(v: string): boolean {
  const m = v.match(/^([^@]+)@(gmail|googlemail)\.com$/);
  return !!m && m[1].split("+")[0].replaceAll(".", "") === PERSONAL_GMAIL_BOX;
}

/** Admin + comptes de test : exclus de toutes les STATISTIQUES (coûts, tunnel, cohortes). */
export function isInternalEmail(e: string | null | undefined): boolean {
  const v = norm(e);
  return !!v && (INTERNAL_EMAILS.has(v) || AGENCY_ALIAS.test(v) || isPersonalGmail(v));
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
