/**
 * « D'où je viens » avant un détour imposé par l'app.
 *
 * Deux détours arrachent la cliente à son travail en cours :
 *  - connecter un compte (Canva, Instagram, LinkedIn…) → Paramètres → Connexions
 *  - tomber à court de crédits → la page des tarifs, puis Stripe
 *
 * Dans les deux cas le travail est toujours là (use-flow-persistence le garde
 * 2 h) mais devenait invisible, faute de chemin de retour : on repartait de zéro
 * en croyant l'avoir perdu.
 *
 * On note donc le chemin de départ AVANT de partir, et la page d'arrivée y
 * ramène — automatiquement quand le détour est fini (compte connecté), ou par un
 * bouton quand la cliente peut vouloir rester (tarifs, confirmation de
 * paiement). Un seul mécanisme pour tous les points de départ plutôt qu'une
 * rustine par endroit.
 *
 * sessionStorage et pas localStorage : le mémo appartient à CET onglet, celui
 * qui fait l'aller-retour. Il survit au passage par canva.com ou stripe.com
 * (même onglet, même origine au retour) et meurt avec l'onglet — c'est voulu.
 */

const KEY = "retour_apres_detour";

/** Le temps d'un détour (autorisation OAuth, paiement Stripe), pas plus :
 *  au-delà, un vieux chemin qui ressurgit serait plus déroutant qu'utile. */
const MAX_AGE_MS = 30 * 60 * 1000;

export const CHEMIN_CONNEXIONS = "/parametres/connexions";
export const CHEMIN_TARIFS = "/pricing";

export type RetourMemo = {
  /** Chemin interne à re-visiter, avec sa query (ex. "/creer"). */
  chemin: string;
  /** Ce vers quoi on ramène, pour l'annoncer : « ton contenu en cours ». */
  quoi: string;
};

type Stocke = RetourMemo & { ts: number };

/**
 * Anti-redirection sauvage : on n'accepte qu'un chemin interne. Jamais une URL
 * absolue, jamais un "//autre-site.com" (que le navigateur lirait comme un
 * domaine externe).
 */
function cheminInterneValide(chemin: string): boolean {
  return (
    typeof chemin === "string" &&
    chemin.startsWith("/") &&
    !chemin.startsWith("//") &&
    !chemin.includes("://")
  );
}

/** Comment nommer la destination dans le message de retour. */
export function quoiPour(chemin: string): string {
  if (chemin.startsWith("/creer")) return "ton contenu en cours";
  if (chemin.startsWith("/calendrier")) return "ton calendrier";
  if (chemin.startsWith("/instagram/stats")) return "tes statistiques";
  return "ta page";
}

/**
 * Les pages DU détour lui-même : s'y mémoriser n'aurait pas de sens (on veut
 * revenir à ce qu'on faisait AVANT, pas à la page des tarifs).
 */
const PAGES_DE_DETOUR = [
  CHEMIN_CONNEXIONS,
  CHEMIN_TARIFS,
  "/payment/success",
  "/checkout/",
  "/abonnement",
];

/**
 * Mémorise d'où l'on part. Sans argument, prend la page courante (chemin +
 * query, pour ne pas perdre un ?format= ou un ?sujet=).
 */
export function memoriseRetour(chemin?: string, quoi?: string): void {
  const cible =
    chemin ?? `${window.location.pathname}${window.location.search}`;
  if (!cheminInterneValide(cible)) return;
  if (PAGES_DE_DETOUR.some((p) => cible.startsWith(p))) return;
  try {
    const stocke: Stocke = {
      chemin: cible,
      quoi: quoi || quoiPour(cible),
      ts: Date.now(),
    };
    sessionStorage.setItem(KEY, JSON.stringify(stocke));
  } catch {
    /* stockage plein ou indisponible — on dégrade sans casser le parcours */
  }
}

/** Lit le mémo s'il est encore valable, sinon null (et nettoie au passage). */
export function lireRetour(): RetourMemo | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stocke;
    if (!parsed?.chemin || !cheminInterneValide(parsed.chemin)) {
      oublieRetour();
      return null;
    }
    if (!parsed.ts || Date.now() - parsed.ts > MAX_AGE_MS) {
      oublieRetour();
      return null;
    }
    return { chemin: parsed.chemin, quoi: parsed.quoi || quoiPour(parsed.chemin) };
  } catch {
    return null;
  }
}

export function oublieRetour(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

/**
 * Part vers Paramètres → Connexions en se souvenant d'où l'on vient.
 *
 * `navigate` est celui de react-router : navigation douce, PAS de
 * `window.location.assign` — un rechargement complet remonte toute l'app et
 * rend la reprise du travail bien plus fragile.
 */
export function versConnexions(
  navigate: (chemin: string) => void,
  opts?: { depuis?: string; quoi?: string },
): void {
  memoriseRetour(opts?.depuis, opts?.quoi);
  navigate(CHEMIN_CONNEXIONS);
}

/** Part vers les tarifs en se souvenant d'où l'on vient (crédits épuisés). */
export function versTarifs(
  navigate: (chemin: string) => void,
  opts?: { depuis?: string; quoi?: string },
): void {
  memoriseRetour(opts?.depuis, opts?.quoi);
  navigate(CHEMIN_TARIFS);
}

/**
 * Même chose, mais depuis un module hors composant React (pas de `navigate`
 * sous la main) : `handleQuotaError` est appelé au fond d'une vingtaine de
 * gestionnaires async. Rechargement complet assumé ici — on part vers un tunnel
 * de paiement, pas pour revenir dans la seconde, et le travail en cours est
 * persisté de toute façon.
 */
export function partirVersTarifs(quoi?: string): void {
  memoriseRetour(undefined, quoi);
  window.location.assign(CHEMIN_TARIFS);
}
