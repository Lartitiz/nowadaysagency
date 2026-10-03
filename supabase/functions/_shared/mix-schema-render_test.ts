import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MIX_SCHEMA_TYPES, mixSchemaBlock } from "./mix-schema-render.ts";
import { composeMixCarousel, type MixCharter, type MixSlideSpec } from "./mix-slide-layouts.ts";
import { SCHEMA_TYPES, schemaShapeOk, validateSchemaPlan, schemaEligible, planSchemas } from "./schema-formatting.ts";

const CH: MixCharter = { color_primary: "#5E7A5E", color_secondary: "#5E7A5E", color_background: "#F4EFE8", color_text: "#1E2A22", color_accent: "#B5781A", font_title: "Libre Baskerville", font_body: "IBM Plex Sans", border_radius: "rounded" };
const COLORS = { card: "#F4EFE8", cardAlt: "#E5ECE3", ink: "#1E2A22", soft: "rgba(30,42,34,.18)", accent: "#5E7A5E" };
const FONTS = { title: "'Libre Baskerville', serif", body: "'IBM Plex Sans', sans-serif" };
const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

// Un exemple valide par type dessiné (formes de l'étage de schémas).
const SAMPLES: Record<string, any> = {
  before_after: { type: "before_after", before: { label: "Avant", items: ["40 références", "tout ce qu'on me demandait"] }, after: { label: "Aujourd'hui", items: ["12 pièces"] } },
  comparison: { type: "comparison", left: { label: "Grès", items: ["robuste"] }, right: { label: "Faïence", items: ["légère", "illustrée"] } },
  timeline: { type: "timeline", steps: [{ label: "Trier", desc: "je la referais ?" }, { label: "Regrouper" }, { label: "Garder" }] },
  process_visible: { type: "process_visible", stages: [{ label: "Trier" }, { label: "Regrouper" }, { label: "Garder" }] },
  story_arc: { type: "story_arc", steps: [{ label: "Le doute" }, { label: "Le tri" }, { label: "Le calme" }, { label: "La série" }, { label: "Le stand" }] },
  checklist: { type: "checklist", title: "Ce que je garde", items: [{ text: "les bols du matin", checked: true }, { text: "les tasses sans anse", checked: true }] },
  stats: { type: "stats", items: [{ number: "40", label: "références avant" }, { number: "12", label: "pièces aujourd'hui" }] },
  quote_big: { type: "quote_big", quote: "Je ne tourne plus tout ce qu'on me demande", attribution: "L'atelier" },
  objection_response: { type: "objection_response", objection: "Moins de choix, moins de ventes ?", response: "Mes ventes ont tenu, et j'ai retrouvé du temps." },
};

Deno.test("schémas mixte : chaque type dessiné garde tous ses libellés, sans cercle ni numéro ajouté", () => {
  for (const type of MIX_SCHEMA_TYPES) {
    assert((SCHEMA_TYPES as readonly string[]).includes(type), type);
    const schema = SAMPLES[type];
    assert(schema && schemaShapeOk(schema), `exemple invalide pour ${type}`);
    const block = mixSchemaBlock(schema, 920, COLORS, FONTS, 16);
    assert(block, `${type} non dessiné`);
    assert(block!.height > 60 && block!.height < 900, `${type} hauteur ${block!.height}`);
    const text = textOf(block!.html);
    const strings = JSON.stringify(schema).match(/"(?:label|desc|text|title|number|quote|attribution|objection|response)":"([^"]+)"|"items":\[("[^\]]+")\]/g) || [];
    for (const m of JSON.stringify(schema).matchAll(/"(?:label|desc|text|title|number|quote|attribution|objection|response)":"([^"]+)"/g)) assert(text.includes(m[1]), `${type} : « ${m[1]} » absent`);
    assert(strings.length > 0);
    assert(!/border-radius:50%/.test(block!.html), `${type} : cercle`);
    const digits = (text.match(/\d+/g) || []).filter(d => !JSON.stringify(schema).includes(d));
    assertEquals(digits, [], `${type} : chiffre ajouté`);
  }
  assertEquals(mixSchemaBlock({ type: "pyramid", levels: [{ label: "a" }, { label: "b" }] }, 920, COLORS, FONTS, 16), null);
  assert(mixSchemaBlock({ type: "quote_big", quote: "<script>x</script>" }, 920, COLORS, FONTS, 16)!.html.includes("&lt;script&gt;"));
});

const BA_BODY = "Chaque nouvelle demande devenait une nouvelle référence. Résultat : 40 pièces différentes à émailler, à cuire et à stocker, et jamais le temps d'en perfectionner une seule. Aujourd'hui, je n'en garde que 12, que je maîtrise du tournage à la cuisson.";
const MIX: MixSlideSpec[] = [
  { slide_number: 1, slide_type: "photo_integrated", photo_index: 1, title: "De 40 références à 12 : trois étapes dans mon atelier", body: "" },
  { slide_number: 2, slide_type: "photo_integrated", photo_index: 2, title: "", body: "Il y a deux ans, je remballais la moitié du stand à chaque marché." },
  { slide_number: 3, slide_type: "text_only", title: "Avant, je tournais tout ce qu'on me demandait", body: BA_BODY, visual_schema: SAMPLES.before_after },
  { slide_number: 4, slide_type: "photo_integrated", photo_index: 3, title: "", body: "Le tri s'est fait sur l'établi, pièce par pièce." },
  { slide_number: 5, slide_type: "text_only", title: "Et toi ?", body: "Combien de références gardes-tu ?" },
];

Deno.test("mix : slide à schéma = « pause » sur l'aplat, texte entier, photos voisines sur fond clair", () => {
  const out = composeMixCarousel(MIX, CH, 3)!;
  assert(out, "le carrousel reste composé par le code");
  const pause = out[2];
  assertEquals(pause.layout, "pause");
  assert(pause.html.includes('data-mix-schema="before_after"'));
  assert(pause.html.includes("background:#5E7A5E"), "aplat de charte");
  const text = textOf(pause.html);
  assert(text.includes(BA_BODY) && text.includes(MIX[2].title!), "texte entier");
  assert(pause.html.includes('data-slide-text="title"') && pause.html.includes('data-slide-text="body"'), "texte éditable");
  assert(out[1].layout !== "photo_aplat" && out[3].layout !== "photo_aplat", `voisines ${out[1].layout} / ${out[3].layout}`);
  assertEquals(out[4].layout, "respiration");
  assert(!out[4].html.includes("background:#5E7A5E;font-family"), "après une pause, la respiration reste claire");
});

Deno.test("mix : texte trop long pour le schéma → le schéma cède, le texte reste entier", () => {
  const long = Array(9).fill(BA_BODY).join(" ");
  const out = composeMixCarousel([MIX[0], { ...MIX[2], slide_number: 2, body: long }], CH, 3);
  if (!out) return; // texte démesuré même sans schéma : rendu modèle, comme avant
  assertEquals(out[1].schema_dropped, true);
  assert(!out[1].html.includes("data-mix-schema"));
});

Deno.test("étage de schémas, mixte : seulement les types dessinés", async () => {
  const slides = [{ slide_number: 1, slide_type: "photo_integrated", title: "x" }, { slide_number: 2, slide_type: "text_only", title: "Trois niveaux", body: "La base, le milieu, le sommet." }];
  const rejected: string[] = [];
  const out = validateSchemaPlan({ schemas: [{ slide_number: 2, visual_schema: { type: "pyramid", levels: [{ label: "La base" }, { label: "le sommet" }] } }] }, slides, schemaEligible(true), rejected, MIX_SCHEMA_TYPES);
  assertEquals(out, []);
  assertEquals(rejected, ["pyramid@2:type"]);
  let opts: any;
  await planSchemas(slides, true, {}, (async (o: any) => { opts = o; return JSON.stringify({ reperage: [], schemas: [] }); }) as any);
  assertEquals(opts.tool.input_schema.properties.schemas.items.properties.visual_schema.properties.type.enum, [...MIX_SCHEMA_TYPES]);
  assert(opts.system.includes("Carrousel mixte"));
});

Deno.test("schémas mixte : aucun texte sous 32 px (plancher bloquant de l'éditeur)", () => {
  for (const type of MIX_SCHEMA_TYPES) {
    const html = mixSchemaBlock(SAMPLES[type], 920, COLORS, FONTS, 16)!.html;
    const sizes = [...html.matchAll(/font-size:(\d+)px/g)].map(m => Number(m[1]));
    assert(sizes.length && sizes.every(n => n >= 32), `${type} : ${sizes}`);
  }
});

Deno.test("étage de schémas, mixte : seulement les slides texte qui ont la place (texte jamais raccourci)", () => {
  const long = Array(5).fill("Chaque nouvelle demande devenait une nouvelle référence, à émailler, à cuire et à stocker.").join(" ");
  const slides = [
    { slide_number: 1, slide_type: "photo_integrated", title: "x" },
    { slide_number: 2, slide_type: "text_only", title: "Avant, je tournais tout", body: BA_BODY },
    { slide_number: 3, slide_type: "photo_integrated", title: "y" },
    { slide_number: 4, slide_type: "text_only", title: "Un passage très développé", body: long + " " + long },
  ];
  const eligible = schemaEligible(true);
  assertEquals([eligible(slides[1], 1), eligible(slides[3], 3)], [true, false]);
  const rejected: string[] = [];
  const big = { type: "checklist", items: Array(6).fill(0).map(() => ({ text: "Chaque nouvelle demande devenait une nouvelle référence" })) };
  validateSchemaPlan({ schemas: [{ slide_number: 2, visual_schema: big }] }, slides, () => true, rejected, MIX_SCHEMA_TYPES, (s, sc) => composeMixCarousel([{ ...s, visual_schema: sc } as any], CH, 0)?.[0]?.layout === "pause");
  assertEquals(rejected, ["checklist@2:place"]);
});
