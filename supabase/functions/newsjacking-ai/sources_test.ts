// Actus vérifiables (18/10/2026) : une actu sans page trouvée par la recherche est retirée.
// Lancer : deno test --allow-env --allow-read supabase/functions/newsjacking-ai/sources_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cleUrl, dateIso, garderActusSourcees, normaliserActus, pagesTrouvees } from "./sources.ts";

const MAINTENANT = Date.parse("2026-10-18T12:00:00Z");

Deno.test("cleUrl ignore www, / final, paramètres et ancre", () => {
  assertEquals(cleUrl("https://www.Lemonde.fr/article/x/?utm=1#haut"), "lemonde.fr/article/x");
  assertEquals(cleUrl("http://lemonde.fr/article/x"), "lemonde.fr/article/x");
  assertEquals(cleUrl("javascript:alert(1)"), null);
  assertEquals(cleUrl(""), null);
  assertEquals(cleUrl(undefined), null);
});

Deno.test("dateIso lit les dates ISO, anglaises et relatives", () => {
  assertEquals(dateIso("2026-10-14"), "2026-10-14");
  assertEquals(dateIso("October 14, 2026"), "2026-10-14");
  assertEquals(dateIso("3 days ago", MAINTENANT), "2026-10-15");
  assertEquals(dateIso("n'importe quoi"), undefined);
});

Deno.test("pagesTrouvees lit le web search, les citations et Perplexity", () => {
  const pages = pagesTrouvees([
    { type: "server_tool_use", name: "web_search" },
    { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://www.linfodurable.fr/a-1", title: "A", page_age: "2026-10-10" }] },
    { type: "text", text: "…", citations: [{ type: "web_search_result_location", url: "https://ecomundo.eu/blog/b" }] },
    { type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "unavailable" } },
  ], [{ source_url: "https://franceinfo.fr/c", date_publication: "2026-10-16" }]);
  assertEquals([...pages.keys()].sort(), ["ecomundo.eu/blog/b", "franceinfo.fr/c", "linfodurable.fr/a-1"]);
  assertEquals(pages.get("linfodurable.fr/a-1")?.date, "2026-10-10");
});

Deno.test("garderActusSourcees retire les actus sans page trouvée et complète source et date", () => {
  const pages = pagesTrouvees([
    { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://www.linfodurable.fr/a-1", page_age: "2026-10-10" }] },
  ]);
  const { gardees, retirees } = garderActusSourcees([
    { titre: "Vraie", source_url: "https://linfodurable.fr/a-1/", source: "" },
    { titre: "Sans lien" },
    { titre: "Lien inventé", source_url: "https://mtm-news.example/x" },
  ], pages);
  assertEquals(retirees, ["Sans lien", "Lien inventé"]);
  assertEquals(gardees.length, 1);
  assertEquals(gardees[0].source_url, "https://www.linfodurable.fr/a-1");
  assertEquals(gardees[0].source, "linfodurable.fr");
  assertEquals(gardees[0].date_publication, "2026-10-10");
});

Deno.test("garderActusSourcees garde la date donnée par l'actu quand elle est lisible", () => {
  const pages = pagesTrouvees([], [{ source_url: "https://franceinfo.fr/c" }]);
  const { gardees } = garderActusSourcees([{ titre: "T", source: "franceinfo", source_url: "https://franceinfo.fr/c", date_publication: "2026-10-16" }], pages);
  assertEquals(gardees[0].date_publication, "2026-10-16");
  assertEquals(gardees[0].source, "franceinfo");
});

Deno.test("normaliserActus ramène les valeurs inconnues aux valeurs connues", () => {
  const [a] = normaliserActus([{ titre: "T", type: "autre", axe: "x", ton: "y", force_pont: "z", faits_cles: ["f", 3, ""] }], (t) => t);
  assertEquals([a.type, a.axe, a.ton, a.force_pont], ["globale", "actu_connectable", "entre_deux", "moyen"]);
  assertEquals(a.faits_cles, ["f"]);
});
