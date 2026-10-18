// Liste d'actus gardée dans l'onglet (18/10/2026) : une recherche coûte
// 3 crédits ; recharger la page, cliquer « Retour » ou revenir depuis Format ne
// doit pas obliger à la repayer. Seuls « Relancer » ou une nouvelle recherche
// remplacent la liste. Gardée 24 h au plus, par compte.
import type { Actu, AnglesState } from "./newsjacking-config";

const DUREE_MS = 24 * 60 * 60 * 1000;

export interface ListeActusGardee {
  actus: Actu[];
  angles: Record<number, AnglesState>;
  filter: "all" | "globale" | "niche";
  hidden: number[];
  savedIdx: number[];
  vibes: string[];
  intent: string;
  workspaceId?: string;
  at: number;
}

const cle = (userId: string) => `newsjacking_liste:${userId}`;

export function lireListeActus(userId: string | undefined, workspaceId: string | undefined, maintenant = Date.now()): ListeActusGardee | null {
  if (!userId) return null;
  try {
    const brut = sessionStorage.getItem(cle(userId));
    if (!brut) return null;
    const l = JSON.parse(brut) as ListeActusGardee;
    if (!Array.isArray(l.actus) || l.actus.length === 0 || maintenant - l.at > DUREE_MS) return null;
    if (workspaceId && l.workspaceId && workspaceId !== l.workspaceId) return null;
    // Seuls les angles déjà arrivés reviennent (un chargement en cours est perdu avec la page).
    const angles: Record<number, AnglesState> = {};
    for (const [i, s] of Object.entries(l.angles || {})) {
      if (s?.data?.length) angles[Number(i)] = { data: s.data, loading: false, primaryOnly: s.primaryOnly };
    }
    return { ...l, angles };
  } catch {
    return null;
  }
}

export function ecrireListeActus(userId: string | undefined, liste: Omit<ListeActusGardee, "at"> | null) {
  if (!userId) return;
  try {
    if (!liste || liste.actus.length === 0) sessionStorage.removeItem(cle(userId));
    else sessionStorage.setItem(cle(userId), JSON.stringify({ ...liste, at: Date.now() }));
  } catch {
    // Stockage plein ou bloqué : la liste reste seulement à l'écran.
  }
}
