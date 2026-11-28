// Ligne « 📎 Photos collées » du bilan du lundi.
//   deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/cron-health/photos-collees_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { lirePhotosCollees, photosCollees } from "./photos-collees.ts";

const now = Date.UTC(2026, 10, 30, 9);
const PHOTO = `data:image/jpeg;base64,${"A".repeat(40_000)}`;
const PICTO = `data:image/png;base64,${"A".repeat(900)}`;

Deno.test("photos collées : seuls les contenus avec une vraie photo comptent, clientes à part", () => {
  const rows = [
    { table: "saved_ideas", id: "1", user_id: "interne", updated_at: "2026-11-27T14:00:00Z", photos: 4, ko: 1760 },
    { table: "saved_ideas", id: "2", user_id: "cliente", updated_at: "2026-11-25T10:00:00Z", photos: 0, ko: 90 }, // pictos seulement
    { table: "calendar_posts", id: "3", user_id: "cliente", updated_at: "2026-11-28T08:00:00Z", photos: 2, ko: 640 },
  ];
  assertEquals(photosCollees(rows, { isClient: (id) => id === "cliente" }), {
    contenus: 2, idees: 1, calendrier: 1, clientes: 1, photos: 6, plus_gros_ko: 1760, dernier: { date: "2026-11-28", table: "calendar_posts" },
  });
});

Deno.test("photos collées : aucune ligne = zéros", () => {
  assertEquals(photosCollees([], { isClient: () => true }), { contenus: 0, idees: 0, calendrier: 0, clientes: 0, photos: 0, plus_gros_ko: 0, dernier: null });
});

// Le cas d'avant #2201 : « Brouillon mis de côté » écrivait la photo dans
// content_data ET dans content_draft (le même contenu, en texte).
Deno.test("photos collées : la fiche d'avant #2201 est vue, la fiche d'après ne l'est pas", async () => {
  const avant = { visual_html: [{ html: `<img src="${PHOTO}">` }] };
  const apres = { visual_html: [{ html: `<img src="https://x.test/calendar-visuals/u/carousel-media/abc.jpg"><i style="background:url(${PICTO})">` }] };
  const base: Record<string, any[]> = {
    saved_ideas: [
      { id: "avant", user_id: "u", updated_at: "2026-11-27T14:00:00Z", content_data: avant, content_draft: JSON.stringify(avant) },
      { id: "apres", user_id: "u", updated_at: "2026-11-28T11:00:00Z", content_data: apres, content_draft: JSON.stringify(apres) },
    ],
    calendar_posts: [],
  };
  const appels: string[] = [];
  const faux = async (_s: unknown, table: string, colonnes: string, modifier?: (q: any) => any) => {
    let rows = base[table];
    const q: any = {
      gte: (c: string, v: string) => (rows = rows.filter((r) => r[c] >= v), q),
      like: (c: string) => {
        const [racine, cle] = c.split("->>");
        rows = rows.filter((r) => String(cle ? JSON.stringify(r[racine]?.[cle] ?? "") : r[racine] ?? "").includes("data:image/"));
        return q;
      },
      in: (c: string, ids: string[]) => (rows = rows.filter((r) => ids.includes(r[c])), q),
    };
    modifier?.(q);
    appels.push(`${table} ${colonnes}`);
    return rows;
  };
  const rows = await lirePhotosCollees({}, faux, now);
  // Les deux contiennent « data:image/ » (le picto), donc les deux sont chargées ; une seule a une photo.
  assertEquals(rows.map((r) => [r.id, r.photos]), [["avant", 2], ["apres", 0]]);
  assertEquals(rows[0].ko >= 80, true);
  assertEquals("content_data" in rows[0], false);
  assertEquals(photosCollees(rows, { isClient: () => true }).contenus, 1);
  // Le contenu n'est chargé que pour la table qui a des suspects.
  assertEquals(appels.filter((a) => a.includes("content_data")), ["saved_ideas id, user_id, updated_at, content_data, content_draft"]);
  assertEquals(appels.some((a) => a.includes("story_sequence_detail")), false);
});
