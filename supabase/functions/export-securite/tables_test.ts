import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  COLONNE_TRI,
  COLONNES_MASQUEES,
  retirerColonnes,
  retirerSecrets,
  TABLES_EXCLUES,
  TABLES_EXPORTEES,
} from "./tables.ts";

async function colonnesParTable(): Promise<Record<string, string[]>> {
  const types = await Deno.readTextFile(new URL("../../../src/integrations/supabase/types.ts", import.meta.url));
  const pub = types.slice(types.indexOf("public: {"));
  const bloc = pub.slice(pub.indexOf("Tables: {"), pub.indexOf("Views: {"));
  const out: Record<string, string[]> = {};
  for (const m of bloc.matchAll(/\n {6}([a-z_0-9]+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/g)) {
    out[m[1]] = [...m[2].matchAll(/^\s+([a-z0-9_]+)\??:/gm)].map((c) => c[1]);
  }
  return out;
}

// Une table ajoutée à la base doit être rangée : copiée ou exclue avec raison.
Deno.test("export de sécurité : chaque table de la base est copiée ou exclue", async () => {
  const tables = Object.keys(await colonnesParTable());
  assert(tables.length > 100, "lecture de types.ts ratée");
  const rangees = new Set([...TABLES_EXPORTEES, ...Object.keys(TABLES_EXCLUES)]);
  assertEquals(tables.filter((t) => !rangees.has(t)), [], "tables à ajouter dans export-securite/tables.ts");
  assertEquals(TABLES_EXPORTEES.filter((t) => t in TABLES_EXCLUES), [], "table à la fois copiée et exclue");
  // Une table disparue mettrait chaque export en erreur, donc sans rotation.
  assertEquals([...rangees].filter((t) => !tables.includes(t)), [], "table qui n'existe plus : à retirer");
});

Deno.test("export de sécurité : aucune colonne au nom de secret n'est copiée", async () => {
  const colonnes = await colonnesParTable();
  const secret = /token|secret|password|passwd|api_?key|credential|cipher|encrypted|refresh/i;
  const pasDesSecrets = new Set(["ai_usage.tokens_used", "ai_usage_hors_credit.tokens_used"]);
  const oublis = TABLES_EXPORTEES.flatMap((t) =>
    (colonnes[t] || []).filter((c) => secret.test(c) && !COLONNES_MASQUEES[t]?.includes(c) && !pasDesSecrets.has(`${t}.${c}`))
      .map((c) => `${t}.${c}`)
  );
  assertEquals(oublis, [], "à ajouter dans COLONNES_MASQUEES ou à exclure");
  for (const [t, cols] of Object.entries(COLONNES_MASQUEES)) {
    for (const c of cols) assert(colonnes[t]?.includes(c), `${t}.${c} n'existe plus`);
  }
});

Deno.test("export de sécurité : chaque table copiée a un ordre stable", async () => {
  const colonnes = await colonnesParTable();
  const sansOrdre = TABLES_EXPORTEES.filter((t) => !colonnes[t]?.includes(COLONNE_TRI[t] || "id"));
  assertEquals(sansOrdre, [], "ajoute une colonne de tri dans COLONNE_TRI");
});

Deno.test("export de sécurité : le jeton sort de la ligne, le reste y reste", () => {
  assertEquals(retirerColonnes("shared_branding_links", [{ id: 1, token: "abc", title: "t" }]), [{ id: 1, title: "t" }]);
  const sansMasque = [{ id: 1, texte: "x" }];
  assertEquals(retirerColonnes("tasks", sansMasque), sansMasque);
});

Deno.test("export de sécurité : le filet retire les secrets, garde le JSON et le texte normal", () => {
  for (const v of ["sk_live_abcdefghijkl123", "whsec_abcdefghijkl123", "sk-ant-api03-abcdefghijklmnopqrst"]) {
    const r = retirerSecrets(JSON.stringify({ x: `avant ${v} après` }));
    assertEquals(JSON.parse(r.texte), { x: "avant [retire] après" });
    assertEquals([r.liensSignes, r.autres], [0, 1]);
  }
  const jwt = "eyJhbGciOiJIUzI1.eyJyb2xlIjoiYW5vbiJ9.c2ln-_";
  const lien = retirerSecrets(JSON.stringify({ u: `https://x.co/sign/a.jpg?token=${jwt}` }));
  assertEquals(JSON.parse(lien.texte), { u: "https://x.co/sign/a.jpg?token=[retire]" });
  assertEquals([lien.liensSignes, lien.autres], [1, 0]);
  assertEquals(retirerSecrets(`{"k":"${jwt}"}`).autres, 1);
  const normal = '{"texte":"Risk-management pour indépendantes, ask-me-anything du lundi"}';
  assertEquals(retirerSecrets(normal), { texte: normal, liensSignes: 0, autres: 0 });
});
