// Images Higgsfield en panne ? (QA du 12/11/2026)
//
// Le 12/11, 3 images sur 3 ont échoué côté service (Studio + mise en scène
// produit) et personne ne l'aurait vu : le bloc budget ne compte que l'argent
// réservé, et ces outils n'avaient pas servi depuis des semaines. On compte
// donc sur 7 jours les images terminées et les échecs, dans les deux tables
// (`higgsfield_image_spend` et `studio_image_requests`).
// Seuil : au moins 2 échecs et aucune image réussie → alerte.

export const HIGGSFIELD_PANNE_MIN_ECHECS = 2;

export type LigneImage = { status: string | null; created_at: string };

export type EchecsHiggsfield = { reussies_7j: number; echecs_7j: number; alerte: string | null };

export function jugerEchecsHiggsfield(rows: LigneImage[], depuis7j: number): EchecsHiggsfield {
  const recentes = rows.filter((r) => new Date(r.created_at).getTime() >= depuis7j);
  const reussies = recentes.filter((r) => r.status === "completed" || r.status === "succeeded").length;
  const echecs = recentes.filter((r) => r.status === "failed").length;
  const alerte = echecs >= HIGGSFIELD_PANNE_MIN_ECHECS && reussies === 0
    ? `${echecs} échec(s) et aucune image réussie sur 7 j — service d'images en panne ? (raison dans les journaux : provider_failed / studio:higgsfield-failed)`
    : null;
  return { reussies_7j: reussies, echecs_7j: echecs, alerte };
}
