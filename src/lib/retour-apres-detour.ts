import { trackUpgrade } from "@/lib/upgrade-events";
const KEY = "retour_apres_detour";

/** Le temps d'un détour (autorisation OAuth, paiement Stripe), pas plus :
 *  au-delà, un vieux chemin qui ressurgit serait plus déroutant qu'utile. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
let ownerId: string | null = null;
let workspaceId: string | null = null;
export function setRetourScope(user: string | null, workspace?: string | null) {
  ownerId = user;
  if (workspace !== undefined) workspaceId = workspace;
}
function storageKey() { return ownerId ? `${KEY}:${ownerId}` : KEY; }

export const CHEMIN_CONNEXIONS = "/parametres/connexions";
export const CHEMIN_TARIFS = "/pricing";

export type RetourMemo = {
  /** Chemin interne à re-visiter, avec sa query (ex. "/creer"). */
  chemin: string;
  workspaceId?: string | null;
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
    !chemin.includes("://") &&
    !chemin.includes("\\") && !Array.from(chemin).some(c => c.charCodeAt(0) < 32)
  );
}

/** Comment nommer la destination dans le message de retour. */
export function quoiPour(chemin: string): string {
  if (chemin.startsWith("/photos")) return "ta création visuelle";
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
      workspaceId,
    };
    sessionStorage.setItem(storageKey(), JSON.stringify(stocke));
    if (ownerId) localStorage.setItem(storageKey(), JSON.stringify(stocke));
  } catch {
    /* stockage plein ou indisponible — on dégrade sans casser le parcours */
  }
}

/** Lit le mémo s'il est encore valable, sinon null (et nettoie au passage). */
export function lireRetour(): RetourMemo | null {
  try {
    const raw = sessionStorage.getItem(storageKey()) || (ownerId ? localStorage.getItem(storageKey()) : null);
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
    return { chemin: parsed.chemin, quoi: parsed.quoi || quoiPour(parsed.chemin), ...(parsed.workspaceId ? { workspaceId: parsed.workspaceId } : {}) };
  } catch {
    return null;
  }
}

export function oublieRetour(): void {
  try {
    sessionStorage.removeItem(storageKey());
    if (ownerId) localStorage.removeItem(storageKey());
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
  opts?: { depuis?: string; quoi?: string; destination?: "/abonnement#packs" },
): void {
  memoriseRetour(opts?.depuis, opts?.quoi);
  navigate(opts?.destination || CHEMIN_TARIFS);
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

/** Called only once the destination has successfully reloaded its working state. */
export function recordCreationResume(surface: "studio" | "creation") {
 const memo = lireRetour();
 if (!memo || memo.chemin.split("?")[0] !== window.location.pathname) return;
 trackUpgrade("creation_resumed", { surface });
 oublieRetour();
}
