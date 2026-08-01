/**
 * « D'où je viens » avant un détour par Paramètres → Connexions.
 *
 * Parcours cassé jusqu'ici : depuis /creer, cliquer « Connecter Canva » emmenait
 * sur /parametres/connexions, l'autorisation partait chez Canva, revenait sur
 * /parametres/connexions… et plus rien ne ramenait la cliente à son contenu.
 * Son travail était pourtant toujours là (use-flow-persistence le garde 2 h),
 * mais invisible : elle repartait de zéro en croyant l'avoir perdu.
 *
 * On note donc le chemin de départ AVANT de partir, et la page des connexions y
 * ramène dès que la connexion est réussie. Même mécanisme pour tous les points
 * de départ (atelier, calendrier, hubs) plutôt qu'une rustine par endroit.
 *
 * sessionStorage et pas localStorage : le mémo appartient à CET onglet, celui
 * qui fait l'aller-retour OAuth. Il survit au passage par canva.com (même
 * onglet, même origine au retour) et meurt avec l'onglet — c'est voulu.
 */

const KEY = "retour_apres_connexion";

/** Le temps d'un OAuth (login + autorisation), pas plus : au-delà, un vieux
 *  chemin qui ressurgit serait plus déroutant qu'utile. */
const MAX_AGE_MS = 30 * 60 * 1000;

export const CHEMIN_CONNEXIONS = "/parametres/connexions";

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
 * Mémorise d'où l'on part. Sans argument, prend la page courante (chemin +
 * query, pour ne pas perdre un ?format= ou un ?sujet=).
 */
export function memoriseRetour(chemin?: string, quoi?: string): void {
  const cible =
    chemin ?? `${window.location.pathname}${window.location.search}`;
  if (!cheminInterneValide(cible)) return;
  // Partir de la page des connexions pour y revenir n'aurait aucun sens.
  if (cible.startsWith(CHEMIN_CONNEXIONS)) return;
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
