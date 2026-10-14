import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { TABLES_EXCLUES, TABLES_EXPORTEES } from "./tables.ts";

// Une table ajoutée à la base doit être rangée : copiée ou exclue avec raison.
Deno.test("export de sécurité : chaque table de la base est copiée ou exclue", async () => {
  const types = await Deno.readTextFile(new URL("../../../src/integrations/supabase/types.ts", import.meta.url));
  const pub = types.slice(types.indexOf("public: {"));
  const bloc = pub.slice(pub.indexOf("Tables: {"), pub.indexOf("Views: {"));
  const tables = [...bloc.matchAll(/\n {6}([a-z_0-9]+): \{\n {8}Row: \{/g)].map((m) => m[1]);
  const rangees = new Set([...TABLES_EXPORTEES, ...Object.keys(TABLES_EXCLUES)]);
  assertEquals(tables.filter((t) => !rangees.has(t)), [], "tables à ajouter dans export-securite/tables.ts");
  assertEquals(TABLES_EXPORTEES.filter((t) => t in TABLES_EXCLUES), [], "table à la fois copiée et exclue");
});
