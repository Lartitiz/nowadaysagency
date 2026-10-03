import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { addSchemasToContent, planSchemas, schemaEligible, schemaShapeOk, validateSchemaPlan } from "./schema-formatting.ts";
import { mixWritingPrompt, textWritingPrompt } from "../carousel-ai/variant-writing.ts";

const SLIDES = [
  { slide_number: 1, title: "Avant / après : ce qui change quand je trie mes idées", body: "" },
  { slide_number: 2, title: "Avant", body: "Je gardais toutes les idées. Résultat : 12 pistes ouvertes et aucune finie." },
  { slide_number: 3, title: "Après", body: "Je garde une seule promesse. Les 3 premières semaines suffisent à la tenir." },
  { slide_number: 4, title: "Ce que dit une cliente", body: "« Je sais enfin ce que vous proposez », m'a écrit Claire après le lancement." },
  { slide_number: 5, title: "Et toi ?", body: "Combien d'idées gardes-tu ouvertes en ce moment ?" },
];
const ELIG = schemaEligible(false);
const BA = { type: "before_after", before: { label: "Avant", items: ["toutes les idées", "12 pistes ouvertes"] }, after: { label: "Après", items: ["une seule promesse"] } };

Deno.test("schémas : forme de chaque type vérifiée", () => {
  assert(schemaShapeOk(BA));
  assert(!schemaShapeOk({ type: "before_after", before: { label: "Avant", items: [] }, after: { label: "Après", items: ["x"] } }));
  assert(!schemaShapeOk({ type: "inconnu" }));
  assert(!schemaShapeOk("Un schéma avant/après"), "jamais une chaîne descriptive");
  assert(schemaShapeOk({ type: "process_visible", stages: [{ label: "a" }, { label: "b" }, { label: "c" }] }));
  assert(!schemaShapeOk({ type: "process_visible", stages: [{ label: "a" }, { label: "b" }] }), "exactement trois stages");
});

Deno.test("schémas : aucun chiffre inventé, citation exacte, couverture exclue, jamais consécutifs, 2 au plus", () => {
  assertEquals(validateSchemaPlan({ schemas: [{ slide_number: 2, reason: "r", visual_schema: BA }] }, SLIDES, ELIG).length, 1);
  const invented = { ...BA, before: { label: "Avant", items: ["15 pistes ouvertes"] } };
  assertEquals(validateSchemaPlan({ schemas: [{ slide_number: 2, reason: "r", visual_schema: invented }] }, SLIDES, ELIG).length, 0, "15 absent du texte");
  const quoteOk = { type: "quote_big", quote: "Je sais enfin ce que vous proposez", attribution: "Claire" };
  const quoteKo = { type: "quote_big", quote: "Je comprends enfin votre offre" };
  assertEquals(validateSchemaPlan({ schemas: [{ slide_number: 4, reason: "r", visual_schema: quoteOk }] }, SLIDES, ELIG).length, 1);
  assertEquals(validateSchemaPlan({ schemas: [{ slide_number: 4, reason: "r", visual_schema: quoteKo }] }, SLIDES, ELIG).length, 0, "citation inventée");
  assertEquals(validateSchemaPlan({ schemas: [{ slide_number: 1, reason: "r", visual_schema: BA }] }, SLIDES, ELIG).length, 0, "couverture");
  const three = validateSchemaPlan({ schemas: [
    { slide_number: 2, reason: "r", visual_schema: BA },
    { slide_number: 3, reason: "r", visual_schema: { type: "stats", items: [{ number: "3", label: "premières semaines" }] } },
    { slide_number: 4, reason: "r", visual_schema: quoteOk },
    { slide_number: 5, reason: "r", visual_schema: { type: "checklist", items: [{ text: "idées ouvertes" }, { text: "en ce moment" }] } },
  ] }, SLIDES, ELIG);
  assertEquals(three.map(x => x.slide_number), [2, 4], "jamais consécutifs, 2 au plus");
  assertEquals(validateSchemaPlan("pas du JSON", SLIDES, ELIG), []);
});

Deno.test("schémas : mixte → seulement les slides text_only", () => {
  const mix = [{ slide_number: 1, slide_type: "photo_full", overlay_text: "x" }, { slide_number: 2, slide_type: "photo_integrated", title: "Avant", body: "Je gardais toutes les idées." }, { slide_number: 3, slide_type: "text_only", title: "Avant", body: "Je gardais toutes les idées. Résultat : 12 pistes ouvertes et aucune finie." }];
  const e = schemaEligible(true);
  assertEquals(mix.map((s, i) => e(s, i)), [false, false, true]);
});

Deno.test("schémas : posés sur le texte final, ceux de la rédaction retirés, échec = texte intact sans schéma", async () => {
  const content = JSON.stringify({ slides: SLIDES.map((s, i) => i === 3 ? { ...s, visual_schema: { type: "stats", items: [{ number: "99", label: "x" }] } } : { ...s, visual_schema: null }), caption: { hook: "h" } });
  const usage: any = {};
  const ok = await addSchemasToContent(content, { isMix: false, usage, allowed: true, call: (async (_o: any, sink: any) => { sink.total_tokens = 80; return JSON.stringify({ schemas: [{ slide_number: 2, reason: "r", visual_schema: BA }] }); }) as any });
  const parsed = JSON.parse(ok.content);
  assertEquals(parsed.slides[1].visual_schema.type, "before_after");
  assertEquals(parsed.slides[3].visual_schema, null, "schéma de la rédaction retiré");
  assertEquals(parsed.slides.map((s: any) => s.body), SLIDES.map(s => s.body), "texte identique");
  assertEquals(usage.total_tokens, 80);
  const ko = await addSchemasToContent(content, { isMix: false, usage: {}, allowed: true, call: (async () => { throw new Error("timeout"); }) as any });
  assertEquals(ko.plan?.status, "unavailable");
  assert(JSON.parse(ko.content).slides.every((s: any) => s.visual_schema === null));
  const late = await addSchemasToContent(content, { isMix: false, usage: {}, allowed: false, call: (async () => { throw new Error("ne doit pas être appelé"); }) as any });
  assertEquals(late.plan?.status, "skipped");
  assertEquals((await addSchemasToContent("pas du JSON", { isMix: false, usage: {}, allowed: true })).content, "pas du JSON");
});

// ── GARDE-FOU (03/10/2026) ──────────────────────────────────────────────────
// Les schémas ne dépendent plus de l'écriture. Ces tests échouent si une
// consigne de schéma revient dans les prompts de rédaction, ou si la génération
// ne passe plus par l'étage de schémas.
Deno.test("garde-fou : la rédaction ne décide plus des schémas, l'étage séparé est toujours appelé", async () => {
  const body = { subject: "Trier ses idées", carousel_type: "conseils" };
  for (const p of [textWritingPrompt(body, false, ""), mixWritingPrompt(body, false, "", "")]) {
    for (const shape of ["before_after:{", "comparison:{", "quote_big:{", "Zéro à deux schémas"]) assert(!p.includes(shape), `consigne de schéma revenue dans l'écriture : ${shape}`);
    assert(p.includes("visual_schema:null"), "l'écriture doit laisser visual_schema à null");
  }
  const src = await Deno.readTextFile(new URL("../carousel-ai/index.ts", import.meta.url));
  assert(/addSchemasToContent\(content, \{ isMix: false/.test(src), "étage de schémas absent du carrousel texte");
  assert(/addSchemasToContent\(content, \{ isMix: true/.test(src), "étage de schémas absent du carrousel mixte");
});

Deno.test("schémas : motifs de rejet tracés (télémétrie)", () => {
  const rejected: string[] = [];
  validateSchemaPlan({ schemas: [
    { slide_number: 1, reason: "r", visual_schema: BA },
    { slide_number: 2, reason: "r", visual_schema: { ...BA, before: { label: "Avant", items: ["15 pistes"] } } },
    { slide_number: 4, reason: "r", visual_schema: { type: "quote_big", quote: "Phrase inventée" } },
  ] }, SLIDES, ELIG, rejected);
  assertEquals(rejected, ["before_after@1:slide", "before_after@2:chiffre", "quote_big@4:citation"]);
});

Deno.test("schémas : un numéro d'ordre (« 1. », « Étape 2 : ») n'est pas un chiffre inventé", () => {
  const tl = { type: "timeline", steps: [{ label: "1. Avant", desc: "toutes les idées" }, { label: "Étape 2 : Après", desc: "une seule promesse" }] };
  assertEquals(validateSchemaPlan({ schemas: [{ slide_number: 3, reason: "r", visual_schema: tl }] }, SLIDES, ELIG).length, 1);
  const bad = { type: "timeline", steps: [{ label: "Avant", desc: "40 idées" }, { label: "Après", desc: "une seule promesse" }] };
  assertEquals(validateSchemaPlan({ schemas: [{ slide_number: 3, reason: "r", visual_schema: bad }] }, SLIDES, ELIG).length, 0, "40 n'est pas dans le texte");
});

Deno.test("schémas : repérage obligatoire, formes décrites dans l'outil, repérage tracé", async () => {
  let opts: any;
  const plan = await planSchemas(SLIDES, false, {}, (async (o: any) => {
    opts = o;
    return JSON.stringify({ reperage: [{ slide_number: 2, relation: "avant_apres" }, { slide_number: 5, relation: "aucune" }], schemas: [{ slide_number: 2, reason: "r", visual_schema: BA }] });
  }) as any);
  const props = opts.tool.input_schema.properties;
  assertEquals(opts.tool.input_schema.required, ["reperage", "schemas"]);
  assert(props.schemas.items.properties.visual_schema.description.includes("before_after:{before:{label,items}"), "le modèle doit voir les champs de chaque type");
  assertEquals(props.schemas.items.properties.visual_schema.additionalProperties, true);
  assertEquals(plan.spotted, ["2:avant_apres"]);
  assertEquals(plan.schemas.length, 1);
});
