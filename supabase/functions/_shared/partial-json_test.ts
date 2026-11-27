import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { closedTopLevelObjects, partialTopLevelString, topLevelValueStart } from "./partial-json.ts";

Deno.test("partialTopLevelString : chaîne en cours, échappements, clé imbriquée ignorée", () => {
  assertEquals(partialTopLevelString('{"a": 1, "lecture', "lecture_test"), null);
  assertEquals(partialTopLevelString('{"lecture_test": "Mes savons \\"sèch', "lecture_test"), { text: 'Mes savons "sèch', closed: false });
  assertEquals(partialTopLevelString('{"lecture_test": "fin\\', "lecture_test"), { text: "fin", closed: false });
  assertEquals(partialTopLevelString('{"lecture_test": "a\\u00e9b", "x": 1', "lecture_test"), { text: "aéb", closed: true });
  assertEquals(partialTopLevelString('{"caption": {"accroche": "non"}, "accroche": "oui"', "accroche"), { text: "oui", closed: true });
  assertEquals(partialTopLevelString('{"accroche": null', "accroche"), null);
});

Deno.test("closedTopLevelObjects : seuls les objets finis du tableau", () => {
  const partial = '{"script": [{"texte_parle": "un } ]", "cut": ["a"]}, {"texte_parle": "deu';
  assertEquals(closedTopLevelObjects(partial, "script"), [{ texte_parle: "un } ]", cut: ["a"] }]);
  assertEquals(closedTopLevelObjects('{"x": [{"a":1}], "script": [', "script"), []);
  assertEquals(closedTopLevelObjects('{"script": [{"a":1}, {"a":2}], "sections": [{"a":3}]}', "script"), [{ a: 1 }, { a: 2 }]);
  assertEquals(topLevelValueStart('{"k": "v"}', "absent"), -1);
});
