// Ligne « 📎 Photos collées » du bilan du lundi.
//   deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/cron-health/photos-collees_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { lirePhotosCollees, photosCollees } from "./photos-collees.ts";

const now = Date.UTC(2026, 10, 30, 9);

Deno.test("photos collées : une fiche vue par deux filtres ne compte qu'une fois, clientes à part", () => {
  const rows = [
    { table: "saved_ideas", id: "1", user_id: "interne", updated_at: "2026-11-27T14:00:00Z" }, // content_draft
    { table: "saved_ideas", id: "1", user_id: "interne", updated_at: "2026-11-27T14:00:00Z" }, // content_data
    { table: "saved_ideas", id: "2", user_id: "cliente", updated_at: "2026-11-25T10:00:00Z" },
    { table: "calendar_posts", id: "3", user_id: "cliente", updated_at: "2026-11-28T08:00:00Z" },
  ];
  assertEquals(photosCollees(rows, { isClient: (id) => id === "cliente" }), {
    contenus: 3, idees: 2, calendrier: 1, clientes: 1, dernier: { date: "2026-11-28", table: "calendar_posts" },
  });
});

Deno.test("photos collées : aucune ligne = zéros", () => {
  assertEquals(photosCollees([], { isClient: () => true }), { contenus: 0, idees: 0, calendrier: 0, clientes: 0, dernier: null });
});

Deno.test("photos collées : la lecture filtre en base (7 jours, motif data:image) sans charger le contenu", async () => {
  const appels: string[] = [];
  const faux = async (_s: unknown, table: string, colonnes: string, modifier?: (q: any) => any) => {
    const q: any = { gte: (c: string, v: string) => (appels.push(`${table} ${colonnes} | ${c}>=${v}`), q), like: (c: string, v: string) => (appels.push(`${table} | ${c} like ${v}`), q) };
    modifier?.(q);
    return table === "calendar_posts" ? [{ id: "3", user_id: "u", updated_at: "2026-11-28T08:00:00Z" }] : [];
  };
  const rows = await lirePhotosCollees({}, faux, now);
  assertEquals(rows, [{ id: "3", user_id: "u", updated_at: "2026-11-28T08:00:00Z", table: "calendar_posts" }]);
  assertEquals(appels.filter((a) => a.includes("like")), [
    "saved_ideas | content_draft like %data:image/%",
    "saved_ideas | content_data->>visual_html like %data:image/%",
    "calendar_posts | story_sequence_detail->>visual_html like %data:image/%",
  ]);
  assertEquals(appels.filter((a) => a.includes(">=")).every((a) => a.includes("id, user_id, updated_at | updated_at>=2026-11-23T09:00:00.000Z")), true);
});
