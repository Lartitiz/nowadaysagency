// La connexion Canva marche-t-elle encore ? Vérifié au clic « Ouvrir dans Canva »,
// AVANT de préparer le carrousel (1 à 3 minutes).
//
// Pourquoi : Canva renouvelle son jeton à l'usage. Une connexion restée longtemps
// sans servir peut être refusée par Canva alors que l'app la croit active
// (09/11/2026 : 4 clientes dans ce cas). Sans cette vérification, la cliente
// attendait toute la préparation pour lire « Ta connexion Canva a expiré » à la fin.
//
// On réutilise `social-status` avec `verify: true` (celui de la page Connexions) :
// il tente le renouvellement côté serveur et garde le jeton neuf. Aucune IA,
// aucun crédit.
//
// Règle : on ne bloque QUE si le serveur dit clairement que Canva refuse.
// Panne, délai dépassé, réponse inattendue = on laisse faire (le serveur de
// l'import reste le filet), jamais de fausse alarme.
import { supabase } from "@/integrations/supabase/client";

// Le serveur abandonne sa propre vérification à 6 s ; marge pour l'aller-retour.
export const CANVA_VERIF_TIMEOUT_MS = 8000;

export async function canvaConnexionExpiree(workspaceId?: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const appel = supabase.functions.invoke("social-status", {
      body: { workspace_id: workspaceId, verify: true },
    });
    const delai = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CANVA_VERIF_TIMEOUT_MS);
    });
    const res: any = await Promise.race([appel, delai]);
    const connexions = res?.data?.connections;
    if (!Array.isArray(connexions)) return false;
    return connexions.some((c: any) => c?.platform === "canva" && c?.needsReconnect === true);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
