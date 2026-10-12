// Tableaux mal formés (12/10/2026) : accroches et plan de carrousel rendus en
// texte par le modèle (vu en ligne le 11/10) tombaient à vide ou revenaient
// comme un objet seul. Jumeau des cas de src/test/parse-ai-json.test.ts.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { tryParseAiJson } from "./parse-ai-json.ts";

const shape = (v: unknown) => Array.isArray(v) ? `tableau(${v.length})` : v === null ? "échec" : "objet";

Deno.test("tableaux mal formés : lus comme des tableaux", () => {
  assertEquals(shape(tryParseAiJson('[{"a":"x\ny"},{"a":"z"}]')), "tableau(2)"); // retour à la ligne brut
  assertEquals(shape(tryParseAiJson('[{"a":"x\ny"}]')), "tableau(1)"); // un seul élément : plus un objet seul
  assertEquals(shape(tryParseAiJson('Voici : [{"a":1}] voilà')), "tableau(1)");
  assertEquals(shape(tryParseAiJson('[{"a":1},{"a":2},]')), "tableau(2)"); // virgule traînante
  assertEquals(tryParseAiJson<any[]>('[{"t":"a\nb"}]')![0].t, "a\nb");
});

Deno.test("formes inchangées : objets, prose, réponses tronquées", () => {
  assertEquals(tryParseAiJson('Note [1] : {"a":1}'), { a: 1 });
  assertEquals(tryParseAiJson('Résultat : {"items":[1,2]} merci'), { items: [1, 2] });
  assertEquals(tryParseAiJson('{"a":"x\ny","b":[1]}'), { a: "x\ny", b: [1] });
  assertEquals(tryParseAiJson('{"a":[1,2], "b": "x'), null); // objet tronqué : jamais le sous-tableau
  assertEquals(tryParseAiJson('[{"a":1},{"a":'), null); // tableau tronqué : jamais l'objet imbriqué
  assertEquals(tryParseAiJson("Désolée, je ne peux pas."), null);
});

Deno.test("la logique de lecture reste identique entre le serveur et le site", async () => {
  const logic = (src: string) => {
    const fn = src.slice(src.indexOf("function attemptParse"));
    return fn.slice(fn.indexOf("const looksLikeObject"), fn.indexOf("\n}\n"));
  };
  const edge = await Deno.readTextFile(new URL("./parse-ai-json.ts", import.meta.url));
  const front = await Deno.readTextFile(new URL("../../../src/lib/parse-ai-json.ts", import.meta.url));
  assertEquals(logic(front), logic(edge));
});

Deno.test("tryParseAiObject : objet toléré, tableau ou texte refusés", async () => {
  const { tryParseAiObject } = await import("./parse-ai-json.ts");
  assertEquals(tryParseAiObject('```json\n{"content":"ligne 1\nligne 2"}\n```'), { content: "ligne 1\nligne 2" });
  assertEquals(tryParseAiObject('[{"a":1}]'), null);
  assertEquals(tryParseAiObject("Voici ton post sans JSON."), null);
});
