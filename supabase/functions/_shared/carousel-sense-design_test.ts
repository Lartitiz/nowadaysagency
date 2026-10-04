import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { planTextSenseDesign, TEXT_SENSE_RULES, validateTextSenseDesign } from "./carousel-sense-design.ts";

// DESIGN AU SERVICE DU SENS (décisions de Laetitia du 04/10/2026) : l'étage
// choisit la forme selon le sens ; le code valide tout et retire le doute.
const SLIDES = [
  { slide_number: 1, title: "Oui, j'utilise l'IA générative.", body: "" },
  { slide_number: 2, title: "Et oui, je m'adresse à des projets un peu plus éthiques.", body: "Ça crée une dissonance en moi. Et j'avais envie de vous en parler." },
  { slide_number: 3, title: "Alors pourquoi je l'utilise quand même ?", body: "" },
  { slide_number: 4, title: "Pour tout vous dire, avant, j'étais toujours un peu bloquée.", body: "Établir une stratégie, ça coûte cher." },
  { slide_number: 5, title: "Je ne sais pas si j'ai raison.", body: "Ça crée une dissonance en moi, je le sais." },
  { slide_number: 6, title: "Je pourrais faire le choix de ne pas l'utiliser du tout.", body: "Mais je devrais forcément devenir premium, avec des prix beaucoup plus chers." },
  { slide_number: 7, title: "Mais je préfère la transparence :", body: "vous avez le droit de savoir comment est faite la com' que je propose." },
];

Deno.test("sens : extraits exacts gardés, inventés ou trop longs retirés", () => {
  const out = validateTextSenseDesign({ cover_accent: "l'IA générative", slides: [
    { slide_number: 2, forme: "texte", surligne: "dissonance", accent: "un peu plus éthiques" },
    { slide_number: 3, forme: "phrase_seule", accent: "quand même ?" },
    { slide_number: 4, forme: "texte", accent: "coincée", surligne: "Établir une stratégie, ça coûte cher." },
  ] }, SLIDES);
  assertEquals(out.cover_accent, "l'IA générative");
  assertEquals(out.slides.find(s => s.slide_number === 2), { slide_number: 2, forme: "texte", accent: "un peu plus éthiques", surligne: "dissonance" });
  assertEquals(out.slides.find(s => s.slide_number === 3), { slide_number: 3, forme: "phrase_seule", accent: "quand même ?" });
  assertEquals(out.slides.find(s => s.slide_number === 4), { slide_number: 4, forme: "texte" }, "mot inventé et texte entier retirés");
});

Deno.test("sens : couverture jamais retouchée en forme ; accent de couverture plafonné ; rupture rare, jamais en dernière slide ni deux de suite", () => {
  const out = validateTextSenseDesign({ cover_accent: "Oui, j'utilise l'IA générative.", slides: [
    { slide_number: 1, forme: "rupture" },
    { slide_number: 4, forme: "rupture" }, { slide_number: 5, forme: "rupture" }, { slide_number: 7, forme: "rupture" },
    { slide_number: 3, forme: "phrase_seule" },
  ] }, SLIDES);
  assertEquals(out.cover_accent, undefined, "toute l'accroche en italique : refusé");
  assert(!out.slides.some(s => s.slide_number === 1));
  assertEquals(out.slides.filter(s => s.forme === "rupture").map(s => s.slide_number), [4]);
  assertEquals(out.slides.find(s => s.slide_number === 3)?.forme, "phrase_seule");
  const long = validateTextSenseDesign({ slides: [{ slide_number: 7, forme: "phrase_seule" }] }, [SLIDES[0], { slide_number: 7, title: "T", body: "un ".repeat(25) }]);
  assertEquals(long.slides[0].forme, "texte", "phrase seule refusée au-delà de 20 mots");
});

Deno.test("sens : réponse illisible ou appel en échec → plan vide (repli du code), jamais d'exception", async () => {
  assertEquals(validateTextSenseDesign("pas du json", SLIDES), { slides: [] });
  assertEquals(validateTextSenseDesign({ slides: "x" }, SLIDES), { slides: [] });
  const usage = {};
  const ko = await planTextSenseDesign(SLIDES, usage, (async () => { throw new Error("délai"); }) as any);
  assertEquals(ko.status, "unavailable"); assertEquals(ko.slides, []);
  const ok = await planTextSenseDesign(SLIDES, usage, (async () => JSON.stringify({ cover_accent: "l'IA générative", slides: [] })) as any);
  assertEquals(ok.status, "completed"); assertEquals(ok.cover_accent, "l'IA générative");
  assertEquals((await planTextSenseDesign([SLIDES[0]], usage, (async () => "{}") as any)).status, "skipped");
});

Deno.test("sens : la consigne demande de montrer l'idée, n'impose ni rupture ni forme par position", () => {
  assert(TEXT_SENSE_RULES.includes("comment le design peut-il montrer cette idée"));
  assert(TEXT_SENSE_RULES.includes("zéro rupture est un bon résultat"));
  assert(TEXT_SENSE_RULES.includes("aucun mot"));
});
