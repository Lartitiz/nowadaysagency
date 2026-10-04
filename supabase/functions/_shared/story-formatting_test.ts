import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { storiesBrief } from "./format-briefs.ts";
import {
  detectStoryList,
  detectStoryQuote,
  finalizeStoriesLayout,
  formatStoriesVisuals,
  STORY_WRITER_LAYOUT_FIELDS,
  stripStoriesWriterLayout,
} from "./story-formatting.ts";

const VALID_GABARITS = ["photo_pills", "interaction", "liste", "citation"];

// ═══ (a) Garde-fou de prompt : la rédaction n'écrit plus la mise en page ═══
// Si quelqu'un remet gabarit / pastilles / fond / position dans le brief
// d'écriture des stories, ce test échoue (séparation écriture / design,
// 04/10/2026).
Deno.test("brief stories : ne demande plus aucun choix de mise en page (toutes variantes)", () => {
  const variants = [
    storiesBrief({}),
    storiesBrief({ objective: "vente", price_range: "petit", time_available: "5min", face_cam: "oui" }),
    storiesBrief({ objective: "education", time_available: "30min", face_cam: "non", pre_gen_answers: { vecu: "v", energy: "e", message_cle: "m" } }),
    storiesBrief({ photo_catalog: [{ index: 1, description: "bol", chosen: true }, { index: 2, description: "four" }] }),
  ];
  const forbidden = [
    "gabarit", "title_pill", "body_pill", "list_pills", "\"quote\"", "\"background\"", "background\":", "text_position",
    "placement", "photo_pills", "fond_pills", "fond_couleur", "\"interaction\"", "\"liste\"", "\"citation\"",
  ];
  for (const brief of variants) {
    for (const word of forbidden) assert(!brief.includes(word), `le brief d'écriture demande encore « ${word} »`);
    for (const field of STORY_WRITER_LAYOUT_FIELDS) assert(!brief.includes(`"${field}"`), `champ de mise en page « ${field} » dans le brief`);
    // Ce qui reste à la rédaction : le texte, le sticker (texte du sondage), la photo à prendre.
    for (const kept of ["\"text\"", "\"sticker\"", "\"label\"", "\"options\"", "photo_directive", "photo_query_en", "350 caractères MAX"]) {
      assert(brief.includes(kept), `le brief a perdu « ${kept} »`);
    }
  }
  assert(variants[3].includes("photo_index"), "photo_index perdu avec la bibliothèque");
});

// ═══ Retrait des champs de mise en page écrits malgré tout ═══
Deno.test("stripStoriesWriterLayout : retire la mise en page, garde texte, sticker et photo", () => {
  const parsed: any = {
    stories: [
      {
        text: "Le texte.",
        sticker: { type: "sondage", label: "Sondage", options: ["Oui", "Non"], placement: "bas" },
        visual: { gabarit: "liste", background: "fond_couleur", title_pill: "T", body_pill: "B", list_pills: ["a"], quote: "q", text_position: "top", photo_directive: "pd", photo_query_en: "pq", photo_index: 2 },
      },
      { text: "Face cam", face_cam: true, visual: null },
      { text: "Visuel cassé", visual: "oops" },
    ],
  };
  stripStoriesWriterLayout(parsed);
  assertEquals(parsed.stories[0].visual, { photo_directive: "pd", photo_query_en: "pq", photo_index: 2 });
  assertEquals(parsed.stories[0].sticker, { type: "sondage", label: "Sondage", options: ["Oui", "Non"] });
  assertEquals(parsed.stories[0].text, "Le texte.");
  assertEquals(parsed.stories[1].visual, null);
  assertEquals(parsed.stories[2].visual, null);
});

// ═══ (b) Chaque story sortie du pipeline a un plan visuel valide ═══
function assertEveryStoryHasVisual(parsed: any) {
  for (const [i, s] of parsed.stories.entries()) {
    if (s?.face_cam === true) {
      assertEquals(s.visual, null, `story ${i + 1} face cam : pas de visuel`);
      continue;
    }
    assert(s.visual && typeof s.visual === "object", `story ${i + 1} sans visuel`);
    assert(VALID_GABARITS.includes(s.visual.gabarit), `story ${i + 1} : gabarit ${s.visual.gabarit}`);
    assertEquals(s.visual.background, "photo", `story ${i + 1} sans fond photo`);
  }
}

Deno.test("pipeline stories : toutes les stories non face cam ont un visuel, même sur une sortie d'écriture abîmée", () => {
  const parsed: any = {
    stories: [
      { text: "Une story sans aucun visuel." },
      { text: "Visuel qui n'est pas un objet.", visual: "oops" },
      { text: "Visuel tableau.", visual: [1, 2] },
      { text: "", visual: {} },
      { text: "Avec sticker sans gabarit.", sticker: { type: "question", label: "Ta question" } },
      { text: "Face cam.", face_cam: true, visual: { gabarit: "photo_pills" } },
      { texte: "Ancien champ texte.", visual: { gabarit: "inconnu", background: "fond_couleur" } },
      null,
    ],
  };
  stripStoriesWriterLayout(parsed);
  finalizeStoriesLayout(parsed, { storiesPhotoCatalog: [] });
  assertEveryStoryHasVisual({ stories: parsed.stories.filter(Boolean) });
  assertEquals(parsed.stories[4].visual.gabarit, "interaction");
  assertEquals(parsed.stories[6].visual.body_pill, "Ancien champ texte.");
  assertEquals(parsed.stories[5].visual, null);
});

Deno.test("pipeline stories : une panne de la mise en forme retombe sur photo_pills avec le texte complet", () => {
  // Story dont la lecture du sticker lève : simule un pépin imprévu au milieu
  // de la mise en forme. Le texte reste, la story garde une image.
  const exploding = new Proxy({ text: "Le texte complet de la story reste affiché." } as Record<string, unknown>, {
    get(target, prop) {
      if (prop === "sticker") throw new Error("boom");
      return target[prop as string];
    },
  });
  const parsed: any = { stories: [exploding, { text: "Deuxième story normale." }] };
  finalizeStoriesLayout(parsed, { storiesPhotoCatalog: [] });
  assertEveryStoryHasVisual(parsed);
  assertEquals(parsed.stories[0].visual.gabarit, "photo_pills");
  assertEquals(parsed.stories[0].visual.body_pill, "Le texte complet de la story reste affiché.");
});

Deno.test("pipeline stories : sticker → interaction ; photo_index → photo_id ; photos choisies toujours placées", () => {
  const parsed: any = {
    stories: [
      { text: "Je pèse les huiles.", visual: { photo_directive: "la balance", photo_query_en: "scale", photo_index: 2 } },
      { text: "Vous préférez quoi ?", sticker: { type: "sondage", label: "Sondage", options: ["A", "B"] }, visual: { photo_directive: "deux savons", photo_query_en: "soap", photo_index: null } },
    ],
  };
  finalizeStoriesLayout(parsed, {
    storiesPhotoCatalog: [
      { index: 1, id: "uuid-1", description: "bols", preferred: true },
      { index: 2, id: "uuid-2", description: "balance" },
    ],
  });
  assertEquals(parsed.stories[0].visual.photo_id, "uuid-2");
  assertEquals(parsed.stories[0].visual.photo_directive, "la balance");
  assertEquals(parsed.stories[1].visual.gabarit, "interaction");
  assertEquals(parsed.stories[1].visual.photo_id, "uuid-1", "photo choisie non placée");
  assert(!("photo_index" in parsed.stories[0].visual));
});

// ═══ (d) Les extraits de design sont des extraits EXACTS du texte ═══
Deno.test("liste : seulement une vraie énumération qui couvre tout le texte ; extraits exacts", () => {
  const ok = [
    "Trois choses que je vérifie avant de démouler : la couleur ; l'odeur ; la texture sous le doigt.",
    "Mes trois règles :\n- Peser deux fois\n- Couper à froid\n- Attendre six semaines",
    "Ce que je prépare ce soir\n1. Les huiles pesées\n2. Les moules graissés\n3. La soude à part",
    "Au programme : le lin, le coton, le chanvre",
  ];
  for (const text of ok) {
    const list = detectStoryList(text);
    assert(list, `liste non détectée : ${text}`);
    if (list.title) assert(text.includes(list.title), `titre inventé : ${list.title}`);
    for (const it of list.items) assert(text.includes(it), `item inventé : ${it}`);
  }
  const notLists = [
    "Pendant longtemps je faisais tout dans le mauvais ordre. Résultat : deux fois plus de temps.",
    "Moi : oui, souvent",
    "Ce que je retiens : la couleur, l'odeur et la texture",
    "Une phrase.\nPuis une autre phrase.\nEt une troisième.",
    "Ma liste : un, deux, trois, quatre, cinq",
    "Un titre beaucoup trop long pour tenir dans une pastille de titre : a ; b",
    "Trois choses : la couleur ; l'odeur. Et après je démoule enfin la fournée.",
  ];
  for (const text of notLists) assertEquals(detectStoryList(text), null, `fausse liste : ${text}`);
});

Deno.test("citation : verbatim entre guillemets retrouvé mot pour mot, sinon rien", () => {
  assertEquals(detectStoryQuote("Une cliente m'a écrit : « j'ai enfin osé montrer mes mains ». J'ai souri."), "j'ai enfin osé montrer mes mains");
  assertEquals(detectStoryQuote("Elle m'a dit “ça change tout pour moi” hier."), "ça change tout pour moi");
  assertEquals(detectStoryQuote("Le mot « slow » me fatigue."), null); // trop court pour une citation
  assertEquals(detectStoryQuote("Aucune citation ici."), null);
});

Deno.test("mise en forme : titre, items et citation sont toujours des extraits exacts du texte final", () => {
  const parsed: any = {
    stories: [
      { text: "Trois choses que je vérifie avant de démouler : la couleur ; l'odeur ; la texture sous le doigt." },
      { text: "Une cliente m'a écrit : « j'ai enfin osé montrer mes mains ». J'ai relu trois fois." },
      { text: "Et une story normale, racontée comme un message vocal." },
    ],
  };
  formatStoriesVisuals(parsed);
  const [liste, citation, normale] = parsed.stories.map((s: any) => s.visual);
  assertEquals(liste.gabarit, "liste");
  assert(parsed.stories[0].text.includes(liste.title_pill));
  for (const it of liste.list_pills) assert(parsed.stories[0].text.includes(it));
  assertEquals(citation.gabarit, "citation");
  assert(parsed.stories[1].text.includes(citation.quote));
  assertEquals(normale.gabarit, "photo_pills");
  assertEquals(normale.title_pill, null);
  assertEquals(normale.body_pill, parsed.stories[2].text);
});

Deno.test("mise en forme : deux listes ou deux citations d'affilée → la seconde repasse en photo_pills (texte complet)", () => {
  const parsed: any = {
    stories: [
      { text: "Au programme : le lin, le coton, le chanvre" },
      { text: "Et ensuite : la teinture, le rinçage, le séchage" },
    ],
  };
  formatStoriesVisuals(parsed);
  assertEquals(parsed.stories[0].visual.gabarit, "liste");
  assertEquals(parsed.stories[1].visual.gabarit, "photo_pills");
  assertEquals(parsed.stories[1].visual.body_pill, parsed.stories[1].text);
});

// ═══ Ordre réel dans creative-flow : retrait → correction du texte → mise en forme ═══
// La mise en forme dérive titre / items / citation du texte : elle doit tourner
// APRÈS la correction, sinon un texte corrigé aurait des pastilles périmées.
Deno.test("creative-flow : stripStoriesWriterLayout → applyStoriesCorrectionPass → finalizeStoriesLayout, dans cet ordre", async () => {
  const src = await Deno.readTextFile(new URL("../creative-flow/index.ts", import.meta.url));
  const block = src.slice(src.indexOf('if (isStories && step === "generate") {'));
  const strip = block.indexOf("stripStoriesWriterLayout(parsed)");
  const correction = block.indexOf("applyStoriesCorrectionPass(parsed");
  const finalize = block.indexOf("finalizeStoriesLayout(parsed");
  assert(strip >= 0 && correction > strip && finalize > correction, `ordre cassé : ${strip}, ${correction}, ${finalize}`);
  assert(!src.includes("enforceStoriesPhotoFirst(parsed)"), "la garde photo doit passer par finalizeStoriesLayout (après la mise en forme)");
});
