// cron-health, scope weekly : contenus enregistrés avec leurs photos collées
// dans le texte (base64), 28/11/2026.
// Depuis #1331 (04/10/2026) les photos d'un carrousel sont rangées dans le
// stockage et le contenu ne garde que leurs liens. Un chemin l'avait oublié :
// « Démarrer le nouveau contenu » (brouillon mis de côté) écrivait des fiches
// de 1 à 2 Mo, en double, pendant deux mois sans qu'aucune routine le voie
// (#2201, vu seulement par une alerte de place disque).
// Ligne du bilan du lundi : « 📎 Photos collées ». Seuil : 0 attendu sur 7 jours ;
// ≥ 1 = un chemin d'enregistrement ne passe plus par externalizeCarouselMedia
// (src/lib/carousel-media.ts) : retrouver lequel par la date et la table, puis
// alléger les contenus avec l'outil d'administration (/admin/tools).
// TOUS les comptes comptent, internes compris (les quatre fiches du 28/11
// venaient surtout de comptes internes) ; les clientes sont données à part.
// La lecture ne charge aucun contenu : le filtre se fait en base, sur les
// seuls contenus modifiés dans les 7 jours.
import { DAY } from "./lecture.ts";

const MOTIF = "%data:image/%";
type Lire = (s: any, t: string, c: string, m?: (q: any) => any) => Promise<any[]>;

export function photosCollees(rows: any[], { isClient }: { isClient: (userId: string) => boolean }) {
  const uniques = [...new Map(rows.filter((r) => r?.id).map((r) => [`${r.table}:${r.id}`, r])).values()]
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const dernier = uniques[0];
  return {
    contenus: uniques.length,
    idees: uniques.filter((r) => r.table === "saved_ideas").length,
    calendrier: uniques.filter((r) => r.table === "calendar_posts").length,
    clientes: new Set(uniques.filter((r) => r.user_id && isClient(r.user_id)).map((r) => r.user_id)).size,
    dernier: dernier ? { date: String(dernier.updated_at).slice(0, 10), table: dernier.table } : null,
  };
}

export async function lirePhotosCollees(supabase: any, fetchAllRows: Lire, now: number) {
  const depuis = new Date(now - 7 * DAY).toISOString();
  const lire = (table: string, colonne: string) =>
    fetchAllRows(supabase, table, "id, user_id, updated_at", (q) => q.gte("updated_at", depuis).like(colonne, MOTIF))
      .then((rows) => rows.map((r) => ({ ...r, table })));
  const lots = await Promise.all([
    lire("saved_ideas", "content_draft"),
    lire("saved_ideas", "content_data->>visual_html"),
    lire("calendar_posts", "story_sequence_detail->>visual_html"),
  ]);
  return lots.flat();
}
