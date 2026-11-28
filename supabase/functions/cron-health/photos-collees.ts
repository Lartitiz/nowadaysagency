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
// Les petites images (pictos, textures, moins de 20 000 caractères) restent
// dans le contenu, c'est voulu : elles ne comptent pas.
// La lecture se fait en deux temps pour rester légère : la base ne rend d'abord
// que les identifiants des contenus modifiés dans les 7 jours dont le texte
// contient « data:image/ » ; seuls ceux-là sont ensuite chargés et mesurés avec
// la même règle que le rangement (collectDataImages). Pas d'expression régulière
// en base : essayée le 28/11/2026, 40 s sur les fiches lourdes.
import { collectDataImages } from "../_shared/carousel-media.ts";
import { DAY } from "./lecture.ts";

const MOTIF = "%data:image/%";
const MAX_CHARGES = 40;
const COLONNES: Record<string, { contenu: string[]; filtres: string[] }> = {
  saved_ideas: { contenu: ["content_data", "content_draft"], filtres: ["content_draft", "content_data->>visual_html", "content_data->>stories"] },
  calendar_posts: { contenu: ["story_sequence_detail"], filtres: ["story_sequence_detail->>visual_html", "story_sequence_detail->>stories"] },
};
type Lire = (s: any, t: string, c: string, m?: (q: any) => any) => Promise<any[]>;

export function photosCollees(rows: any[], { isClient }: { isClient: (userId: string) => boolean }) {
  const lourdes = rows.filter((r) => r?.id && r.photos > 0)
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const dernier = lourdes[0];
  return {
    contenus: lourdes.length,
    idees: lourdes.filter((r) => r.table === "saved_ideas").length,
    calendrier: lourdes.filter((r) => r.table === "calendar_posts").length,
    clientes: new Set(lourdes.filter((r) => r.user_id && isClient(r.user_id)).map((r) => r.user_id)).size,
    photos: lourdes.reduce((n, r) => n + r.photos, 0),
    plus_gros_ko: lourdes.reduce((max, r) => Math.max(max, r.ko || 0), 0),
    dernier: dernier ? { date: String(dernier.updated_at).slice(0, 10), table: dernier.table } : null,
  };
}

/** Une ligne par contenu suspect : nombre de photos collées et poids du contenu, jamais le contenu lui-même. */
export async function lirePhotosCollees(supabase: any, fetchAllRows: Lire, now: number) {
  const depuis = new Date(now - 7 * DAY).toISOString();
  const parTable = await Promise.all(Object.entries(COLONNES).map(async ([table, { contenu, filtres }]) => {
    const lots = await Promise.all(filtres.map((colonne) =>
      fetchAllRows(supabase, table, "id", (q) => q.gte("updated_at", depuis).like(colonne, MOTIF))));
    const ids = [...new Set(lots.flat().map((r) => r.id))].slice(0, MAX_CHARGES);
    if (!ids.length) return [];
    const rows = await fetchAllRows(supabase, table, ["id", "user_id", "updated_at", ...contenu].join(", "), (q) => q.in("id", ids));
    return rows.map((r) => {
      const valeurs = contenu.map((c) => r[c]).filter((v) => v != null);
      return {
        table, id: r.id, user_id: r.user_id, updated_at: r.updated_at,
        photos: valeurs.reduce((n, v) => n + collectDataImages(v).size, 0),
        ko: Math.round(valeurs.reduce((n, v) => n + JSON.stringify(v).length, 0) / 1000),
      };
    });
  }));
  return parTable.flat();
}
