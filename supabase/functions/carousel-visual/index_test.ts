// Régression du fix "photo_retouch jamais gaté" (voir CLAUDE.md, pattern
// checkQuota -> appel IA -> logUsage UNIQUEMENT en cas de succès), sur le bloc
// Illustration de couverture (Recraft) : avant le fix, logUsage("photo_retouch")
// tournait après un succès Recraft SANS qu'aucun checkQuota("photo_retouch")
// n'ait jamais gaté l'entrée dans le bloc — un compte gratuit (plafond
// photo_retouch) pouvait donc générer des couvertures sans limite.
//
// Particularité de ce fichier : carousel-visual utilise `serve()` de std/http
// (pas `Deno.serve` global), qui ouvre un VRAI socket TCP au chargement du
// module — impossible à capturer via _shared/test-edge-harness.ts
// (captureServeHandler), et incompatible avec la commande CI réelle
// (`npm run test:edges` = `deno test --allow-env --allow-read`, SANS
// --allow-net). Le bloc Illustration de couverture a donc été extrait en
// fonction exportée `applyCoverIllustration` (voir index.ts), testable
// directement — même principe que creative-flow/index_test.ts pour
// runDeepResearchWebSearch.
//
// Lancer : deno test --allow-env --allow-read supabase/functions/carousel-visual/index_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { installFetchMock, setTestEnv } from "../_shared/test-edge-harness.ts";

/**
 * installFetchMock() renvoie toujours [] pour un GET /rest/v1/ai_usage
 * générique (voir _shared/test-edge-harness.ts) : pas assez pour simuler un
 * quota "photo_retouch" épuisé (plafond free = 5, voir plan-limiter.ts). On
 * enveloppe localement le fetch déjà installé pour répondre 5 lignes
 * `{category: "photo_retouch"}` sur ce GET précis, tout en réutilisant le
 * mock Anthropic/ai_usage-POST/auth déjà en place. `mock.restore()` reste
 * suffisant pour tout nettoyer : il restaure le VRAI fetch d'origine, ce qui
 * jette aussi cette enveloppe locale au passage.
 */
function installExhaustedPhotoRetouchQuota() {
  const mock = installFetchMock({
    anthropic: () => {
      throw new Error("Anthropic ne doit jamais être appelé quand le quota photo_retouch est refusé");
    },
  });
  const wrapped = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const method = (init?.method || "GET").toUpperCase();
    if (url.includes("/rest/v1/ai_usage") && method === "GET") {
      const rows = Array.from({ length: 5 }, () => ({ category: "photo_retouch" }));
      return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return wrapped(input, init);
  }) as typeof fetch;
  return mock;
}

setTestEnv();

// Importer index.ts exécute AUSSI `serve(handler)` en haut de fichier (effet
// de bord non testé ici, voir en-tête). Sans neutraliser Deno.listen(), ça
// tente un vrai socket TCP et plante en CI (pas de --allow-net). On neutralise
// AVANT l'import (obligatoirement dynamique : un import statique s'exécute
// avant tout le reste du fichier, trop tôt pour patcher Deno.listen).
const realListen = Deno.listen;
// deno-lint-ignore no-explicit-any
(Deno as any).listen = () => ({
  [Symbol.asyncIterator]() {
    return { next: () => new Promise(() => {}) }; // ne se résout jamais : pas de crash, juste une tâche de fond inerte
  },
  accept: () => new Promise(() => {}),
  close() {},
  addr: { transport: "tcp", hostname: "localhost", port: 0 },
  rid: -1,
  ref() {},
  unref() {},
  // deno-lint-ignore no-explicit-any
}) as any;
const { applyCoverIllustration, composeMixStages, enforceTextCover, runComposedByCodeGeneration, stripInventedSurtitres, stripSlideNumberBadges, stripDuplicateStepNumbers, stripDuplicateStepPrefixes, enforceVerbatimAnchorsGuard, enforcePhotoSlideAnchorsGuard, stripVisualHintText, applyTitleBodyContrastGuard, applyTextContrastGuard, applyMinFontSizeGuard } = await import("./index.ts");
// deno-lint-ignore no-explicit-any
(Deno as any).listen = realListen;

const BASE_RESULT = { slides_html: [{ slide_number: 1, html: "<div>couverture</div>" }] };
const BASE_PARAMS = {
  reqBody: { cover_illustration: true },
  slides: [{ slide_number: 1, title: "Titre de couverture" }],
  ch: { mood_keywords: "chaleureux", color_primary: "#FB3D80", color_secondary: "#FFA7C6", color_background: "#FFF4F8" },
  userId: "test-user-id",
  workspaceId: undefined,
  usage: {},
};

Deno.test("quota photo_retouch épuisé -> illustration bloquée avant Recraft/Anthropic, pas de logUsage, échec silencieux", async () => {
  const mock = installExhaustedPhotoRetouchQuota();
  try {
    const result = structuredClone(BASE_RESULT);
    const done = await applyCoverIllustration(result, { ...BASE_PARAMS, reqBody: { cover_illustration: true } });

    assertEquals(mock.anthropicCallCount, 0);
    const photoRetouchLogs = mock.aiUsageInserts.filter((r) => r.category === "photo_retouch");
    assertEquals(photoRetouchLogs.length, 0);
    // Échec silencieux : le carrousel garde sa couverture d'origine, pas d'erreur remontée au client.
    assertEquals(done, false);
    assertEquals(result.slides_html[0].html, "<div>couverture</div>");
  } finally {
    mock.restore();
  }
});

Deno.test("cover_illustration non demandée -> checkQuota jamais consulté, aucun appel réseau", async () => {
  const mock = installFetchMock({
    anthropic: () => {
      throw new Error("Anthropic ne doit pas être appelé quand cover_illustration n'est pas demandée");
    },
  });
  try {
    const result = structuredClone(BASE_RESULT);
    const done = await applyCoverIllustration(result, { ...BASE_PARAMS, reqBody: { cover_illustration: false } });

    assertEquals(mock.anthropicCallCount, 0);
    assertEquals(done, false);
  } finally {
    mock.restore();
  }
});


Deno.test("design photo : charte transmise et contenu conservé après les gardes de production", () => {
  const slides = [
    {slide_number:1,photo_index:1,template:"couverture",overlay_text:"Le point de départ",kicker:"Dans les coulisses",detail:"Une précision fournie"},
    {slide_number:2,photo_index:1,template:"citation",overlay_text:"Ce choix répond à ma situation.",attribution:"Une personne"},
    {slide_number:3,photo_index:1,template:"finale",overlay_text:"Comment avancer ensemble ?",cta_label:"En parler"},
  ];
  const ch = {color_primary:"#914B30",color_secondary:"#663927",color_accent:"#A46827",color_background:"#FFF6E9",color_text:"#312E2A",font_title:"Georgia",font_body:"Arial",border_radius:"24px"};
  const result = runComposedByCodeGeneration({slides,ch,reqBody:{photos:[{}]},usage:{},emitStatus:()=>{},tStart:Date.now()});
  const before = result.slides_html.map((s:any)=>s.html);
  stripInventedSurtitres(result,{isPhotoCarousel:true,slides});
  applyTitleBodyContrastGuard(result,{ch});
  applyTextContrastGuard(result);
  applyMinFontSizeGuard(result);
  assertEquals(result.slides_html.map((s:any)=>s.html),before);
  // Couverture (04/10/2026) : ni pastille ni kicker, voile uniforme sur la photo.
  assert(!before[0].includes("Dans les coulisses"));
  assert(before[0].includes("data-injected-scrim"));
  assert(before[1].includes("background:#FFF6E9"));
  assert(before[1].includes("border-radius:24px"));
  assert(before[0].includes("Une précision fournie"));
  assert(before[1].includes("Une personne"));
});

Deno.test("mise en forme photo : les labels d'étape survivent aux gardes de production (toutes les slides)", () => {
  const slides = [
    {slide_number:1,photo_index:1,template:"couverture",overlay_text:"Ce qu'une pièce finie ne raconte pas"},
    {slide_number:2,photo_index:1,overlay_text:"Tout commence par la terre, que je pétris avant de lui donner une forme. On ne voit jamais cette étape.",art_direction:{treatment:"editorial",position:"bottom_left",emphasis:null,reason:"t",surface:"veil",alignment:"left"}},
    {slide_number:3,photo_index:1,overlay_text:"Vient ensuite le tournage. La terre pétrie passe sur le tour et prend sa forme sous la main.",art_direction:{treatment:"editorial",position:"top_left",emphasis:null,reason:"t",surface:"veil",alignment:"left"}},
    {slide_number:4,photo_index:1,overlay_text:"Puis vient l'émaillage. Je choisis un émail et je le pose, mais rien n'est encore joué avant le four.",art_direction:{treatment:"editorial",position:"bottom_left",emphasis:null,reason:"t",surface:"veil",alignment:"left"}},
    {slide_number:5,photo_index:1,overlay_text:"Reste la cuisson. Semaine après semaine, les pages du carnet se remplissent.",art_direction:{treatment:"closing",position:"bottom_left",emphasis:null,reason:"t",surface:"veil",alignment:"left"}},
  ];
  const ch = {color_primary:"#3A4A3C",color_secondary:"#A9BCC8",color_accent:"#3A4A3C",color_background:"#FFFFFF",color_text:"#1A1A1A",font_title:"Georgia",font_body:"Arial"};
  const formatting = {steps:[{slide_number:2,label:"la terre"},{slide_number:3,label:"le tournage"},{slide_number:4,label:"l'émaillage"},{slide_number:5,label:"la cuisson"}],motifs:[]};
  const result = runComposedByCodeGeneration({slides,ch,reqBody:{photos:[{}]},usage:{},emitStatus:()=>{},tStart:Date.now(),formatting});
  stripInventedSurtitres(result,{isPhotoCarousel:true,slides});
  applyTitleBodyContrastGuard(result,{ch});
  applyTextContrastGuard(result);
  applyMinFontSizeGuard(result);
  for (const n of [1,2,3,4]) assert(result.slides_html[n].html.includes(`Étape ${n} · `), `label d'étape ${n} retiré`);
});

Deno.test("mise en forme mixte : étapes et motif survivent aux gardes de production", async () => {
  const { applyMixFormatting, composeMixCarousel } = await import("../_shared/mix-slide-layouts.ts");
  const slides = [
    { slide_number: 1, slide_type: "photo_integrated", photo_index: 1, title: "Ce qu'une pièce finie ne raconte pas", body: "" },
    { slide_number: 2, slide_type: "photo_integrated", photo_index: 2, title: "Le pétrissage", body: "Tout commence avant le tour, par la terre que je pétris." },
    { slide_number: 3, slide_type: "photo_integrated", photo_index: 3, title: "Le tournage", body: "Sur le tour, la forme naît sous la main." },
    { slide_number: 4, slide_type: "photo_integrated", photo_index: 4, title: "L'émaillage", body: "Je pose l'émail, mais rien n'est encore joué." },
    { slide_number: 5, slide_type: "text_only", title: "Le carnet", body: "Semaine après semaine, les pages se remplissent." },
  ];
  const ch = { color_primary: "#3A4A3C", color_secondary: "#3A4A3C", color_background: "#F4EFE8", color_text: "#1A1A1A", color_accent: "#3A4A3C", font_title: "Georgia", font_body: "Arial" };
  const plan = { steps: [{ slide_number: 2, label: "Le pétrissage" }, { slide_number: 3, label: "Le tournage" }, { slide_number: 4, label: "L'émaillage" }],
    motifs: [{ slide_number: 5, reason: "r", elements: [{ k: "rect", x: 0, y: 40, w: 140, h: 100, tone: "soft" }, { k: "rect", x: 170, y: 20, w: 140, h: 120, tone: "accent" }, { k: "text", x: 0, y: 200, text: "les pages se remplissent", tone: "ink", size: 44 }] }] };
  const composed = composeMixCarousel(applyMixFormatting(slides as any, plan as any), ch, 4)!;
  const result: any = { slides_html: composed.map(({ layout: _l, ...x }: any) => x) };
  stripInventedSurtitres(result, { isPhotoCarousel: false, slides });
  applyTitleBodyContrastGuard(result, { ch });
  applyTextContrastGuard(result);
  applyMinFontSizeGuard(result);
  for (const n of [1, 2, 3]) assert(result.slides_html[n].html.includes(`Étape ${n} · `), `label d'étape ${n} retiré`);
  assert(result.slides_html[4].html.includes('<svg data-photo-format="motif"') && result.slides_html[4].html.includes("les pages se remplissent"), "motif retiré");
});

Deno.test("mise en forme texte : étapes et motif survivent aux gardes de production, rien d'autre ne bouge", async () => {
  const { buildCarouselDesignPlan, composeEditorialSlide, formatEditorialSlides } = await import("../_shared/carousel-design-plan.ts");
  const slides = [
    { slide_number: 1, title: "Comment je prépare un lancement", body: "" },
    { slide_number: 2, title: "D'abord, j'écoute", body: "Je relis les messages de mes clientes." },
    { slide_number: 3, title: "Ensuite, je trie", body: "Je garde une seule promesse." },
    { slide_number: 4, title: "Puis j'écris", body: "Un texte court par jour, pendant une semaine." },
    { slide_number: 5, title: "Et toi ?", body: "Dis-le-moi en commentaire." },
  ];
  const ch = { color_primary: "#23395B", color_secondary: "#23395B", color_background: "#F4EFE8", color_text: "#1E2A3A", color_accent: "#B5781A", font_title: "Georgia", font_body: "Arial" };
  const plan = buildCarouselDesignPlan(slides);
  const base = slides.map((s, i) => composeEditorialSlide(s, plan.sequence[i], ch));
  const formatting = { steps: [{ slide_number: 2, label: "j'écoute" }, { slide_number: 3, label: "je trie" }, { slide_number: 4, label: "j'écris" }],
    motifs: [{ slide_number: 4, reason: "r", elements: [{ k: "rect", x: 0, y: 40, w: 140, h: 100, tone: "soft" }, { k: "rect", x: 170, y: 20, w: 140, h: 120, tone: "accent" }, { k: "text", x: 0, y: 200, text: "pendant une semaine", tone: "ink", size: 44 }] }] };
  const run = (b: any[]) => {
    const result: any = { slides_html: b.map((x: any) => ({ ...x })) };
    stripSlideNumberBadges(result);
    stripInventedSurtitres(result, { isPhotoCarousel: false, slides });
    applyTitleBodyContrastGuard(result, { ch });
    applyTextContrastGuard(result);
    applyMinFontSizeGuard(result);
    return result.slides_html.map((x: any) => x.html);
  };
  const formatted = run(formatEditorialSlides(slides, plan, ch, base, formatting as any));
  for (const n of [1, 2, 3]) assert(formatted[n].includes(`Étape ${n} · `), `label d'étape ${n} retiré`);
  assert(formatted[3].includes('<svg data-photo-format="motif"') && formatted[3].includes("pendant une semaine"), "motif retiré");
  const plain = run(base);
  assertEquals(formatted[0], plain[0]); assertEquals(formatted[4], plain[4]);
});

Deno.test("numéro d'étape en double retiré, les autres chiffres restent", () => {
  const result: any = { slides_html: [
    { slide_number: 4, html: '<div><span style="font-size:32px">2</span><h1 data-slide-text="title">2. Trier les idées</h1><p>En 2 semaines.</p></div>' },
    { slide_number: 5, html: '<div><span style="font-size:120px">73</span><h1 data-slide-text="title">Le chiffre</h1></div>' },
    { slide_number: 6, html: '<div><span>3</span><h1 data-slide-text="title">2. Autre</h1></div>' },
  ] };
  stripDuplicateStepNumbers(result, { slides: [{ slide_number: 4, title: "2. Trier les idées" }, { slide_number: 5, title: "Le chiffre" }, { slide_number: 6, title: "2. Autre" }] });
  assert(!result.slides_html[0].html.includes('px">2</span>'), "le 2 isolé doit partir");
  assert(result.slides_html[0].html.includes("2. Trier les idées") && result.slides_html[0].html.includes("En 2 semaines."));
  assert(result.slides_html[1].html.includes(">73<"), "chiffre-clé conservé");
  assert(result.slides_html[2].html.includes("<span>3</span>"), "autre numéro conservé");
});

Deno.test("contraste texte (vu en live 03/10) : titre non annoté, style entre apostrophes, fond bleu-gris moyen", () => {
  const ch = { color_primary: "#5C7A5A", color_secondary: "#A1BAC6", color_background: "#F8F8F8", color_text: "#1C1C20" };
  const run = (html: string) => { const r: any = { slides_html: [{ slide_number: 1, html }] }; applyTitleBodyContrastGuard(r, { ch }); return r.slides_html[0].html as string; };
  const noTag = run(`<div style="background:#FFFFFF"><div><h2 data-slide-text="title" style="font-size:64px;color:#a1bac6">1. Écouter</h2></div></div>`);
  assert(!/color:#a1bac6/i.test(noTag), "titre bleu-gris sur blanc non corrigé");
  const single = run(`<div style='background:#FFFFFF'><h2 data-slide-text="title" style='font-size:64px;color:#a1bac6'>x</h2></div>`);
  assert(!/color:#a1bac6/i.test(single) && /style='/.test(single), "style entre apostrophes");
  const important = run(`<div style="background:#FFFFFF"><p data-pptx-editable="body" style="color:#a1bac6 !important">x</p></div>`);
  assert(/color:#[0-9A-F]{6} !important/.test(important) && !/a1bac6/i.test(important), "!important conservé, couleur corrigée");
  const mid = run(`<div style="width:1080px;height:1350px;background:rgb(161, 186, 198);"><h2 data-slide-text="title" data-pptx-editable="title" style="color:rgb(248, 248, 248)">2. Trier</h2><p data-slide-text="body" data-pptx-editable="body" style="color:rgb(248, 248, 248)">Une collection</p></div>`);
  assertEquals((mid.match(/color:#1C1C20/g) || []).length, 2, "texte foncé sur bleu-gris (le blanc y fait 1,9:1)");
  const ok = `<div style="background:#5C7A5A"><h2 data-slide-text="title" style="color:#FFFFFF">Lisible</h2></div>`;
  assertEquals(run(ok), ok, "blanc sur vert de charte (4,9:1) inchangé");
});

Deno.test("indication visuelle recopiée en texte : retirée avec son cadre, le vrai texte reste", () => {
  const slides = [{ slide_number: 5, title: "3. Écrire, avec vos mots encore en tête", body: "Une fois les idées choisies, j'écris.",
    visual_suggestion: "Main qui écrit dans un carnet — faïence illustrée floue au premier plan, matière lin" }];
  const html = `<div data-pptx-shape="background" style="background:#f8f8f8"><div style="height:400px;background:linear-gradient(180deg,#e8ece6 0%,#d9e0d5 100%)"><p style="font-size:30px">main qui écrit dans un carnet — faïence illustrée floue au premier plan, matière lin</p><svg width="300" height="20"><path d="M0,10 Q150,0 300,10" stroke="#aaa"/></svg></div><h2 data-slide-text="title" style="color:#1C1C20">3. Écrire, avec vos mots encore en tête</h2><p data-slide-text="body">Une fois les idées choisies, j'écris.</p></div>`;
  const r: any = { slides_html: [{ slide_number: 5, html }] };
  stripVisualHintText(r, { slides });
  const out = r.slides_html[0].html as string;
  assert(!/carnet/.test(out), "texte d'indication retiré");
  assert(!/linear-gradient/.test(out), "cadre vide retiré");
  assert(out.includes("3. Écrire, avec vos mots encore en tête") && out.includes("Une fois les idées choisies"), "vrai texte conservé");
  const nested = `<div data-pptx-shape="background" style="background:#f8f8f8"><div style="position:absolute;right:80px;top:80px;width:420px;height:560px;background:#eef0ec"><div style="padding:40px"><p>main qui écrit dans un carnet, faïence illustrée floue au premier plan</p></div></div><h2 data-slide-text="title">3. Écrire, avec vos mots encore en tête</h2></div>`;
  const r3: any = { slides_html: [{ slide_number: 5, html: nested }] };
  stripVisualHintText(r3, { slides });
  assert(!/#eef0ec|carnet/.test(r3.slides_html[0].html), "cadre imbriqué vidé retiré");
  assert(r3.slides_html[0].html.includes("3. Écrire"), "vrai texte conservé");
  const photo = `<div><div style="background:#eee"><div data-pptx-photo="1" style="background-image:url({{PHOTO_1}})"></div><p>main qui écrit dans un carnet faïence illustrée floue</p></div></div>`;
  const r2: any = { slides_html: [{ slide_number: 5, html: photo }] };
  stripVisualHintText(r2, { slides });
  assert(r2.slides_html[0].html.includes("{{PHOTO_1}}"), "jamais de photo retirée");
});

Deno.test("nettoyage photo : garde les précisions source mais retire encore les surtitres inventés", () => {
  const result={slides_html:[{slide_number:1,html:'<div><span data-pptx-editable="caption">Un détail fourni</span><span data-pptx-editable="caption">LA MÉTHODE MAGIQUE</span></div>'},{slide_number:2,html:"<div>Fin</div>"}]};
  stripInventedSurtitres(result,{isPhotoCarousel:true,slides:[{slide_number:1,overlay_text:"Le récit",detail:"Un détail fourni"}]});
  assert(result.slides_html[0].html.includes("Un détail fourni"));
  assert(!result.slides_html[0].html.includes("LA MÉTHODE MAGIQUE"));
});

// ═══ GARDE-FOU DE NON-RÉGRESSION : carrousel PHOTO de référence (04/10/2026) ═══
// Demande de Laetitia : « sécuriser contre les régressions ». Ce carrousel passe
// par la composition de production ET par toutes les gardes déterministes, dans
// l'ordre de production. Si UN élément de design ou UN mot de texte disparaît,
// ce test échoue : couverture, habillages alternés (bord/carte/verre/colonne),
// « Étape n · … », motif, titres de slide, sous-titre, invitation, texte entier,
// et jamais de gros numéro d'étape ni de pagination.
Deno.test("NON-RÉGRESSION photo : carrousel de référence complet après les gardes de production", async () => {
  const { validatePhotoFormatting } = await import("../_shared/photo-formatting.ts");
  const art = (treatment: string, position = "bottom_left") => ({ treatment, position, emphasis: null, reason: "t", surface: "veil", alignment: "left" });
  const slides = [
    { slide_number: 1, photo_index: 1, overlay_text: "Peindre à main levée, puis laisser le four révéler les couleurs", detail: "Amélie, céramiste", art_direction: art("opening") },
    { slide_number: 2, photo_index: 2, kicker: "Avant la couleur, la forme", overlay_text: "Tout commence par la forme nue. Un bol encore blanc, sans aucun motif. Avant de peindre, je laisse la pièce exister telle qu'elle est : c'est sur elle que le décor viendra ensuite trouver sa place.", art_direction: art("editorial") },
    { slide_number: 3, photo_index: 3, kicker: "Puis vient l'engobe", overlay_text: "Il habille la terre et prépare la surface qui accueillera le dessin. Rien n'est encore illustré, mais la pièce change déjà de visage.", art_direction: art("editorial", "top_left") },
    { slide_number: 4, photo_index: 1, kicker: "Le geste à main levée", overlay_text: "Ensuite, le motif, à main levée. Chaque trait se pose directement sur la pièce, sans modèle reproduit. C'est pour cela que deux faïences au même motif ne sont jamais tout à fait identiques.", art_direction: art("editorial") },
    { slide_number: 5, photo_index: 2, overlay_text: "Pourtant, à ce stade, les couleurs ne sont pas encore celles que vous découvrirez. C'est la cuisson qui les révèle. Je peins donc en sachant que le four aura le dernier mot.", art_direction: art("editorial", "top_left") },
    { slide_number: 6, photo_index: 3, overlay_text: "Forme nue, engobe, motif, cuisson : quatre temps, une seule main.", cta_label: "Découvrir l'atelier", art_direction: art("closing") },
  ];
  const formatting = { version: "test", status: "completed", ...validatePhotoFormatting({
    steps: [{ slide_number: 2, label: "la forme nue" }, { slide_number: 3, label: "l'engobe" }, { slide_number: 4, label: "le motif" }, { slide_number: 5, label: "la cuisson" }],
    motifs: [{ slide_number: 6, reason: "Quatre temps", elements: [
      { k: "text", x: 0, y: 40, text: "Forme nue", tone: "ink", size: 44 }, { k: "text", x: 260, y: 40, text: "engobe", tone: "ink", size: 44 },
      { k: "text", x: 500, y: 40, text: "motif", tone: "ink", size: 44 }, { k: "text", x: 720, y: 40, text: "cuisson", tone: "accent", size: 44 }] }],
  }, slides) };
  assertEquals(formatting.steps.length, 4, "étapes validées");
  assertEquals(formatting.motifs.length, 1, "motif validé");
  const ch = { color_primary: "#3A4A3C", color_secondary: "#A9BCC8", color_accent: "#3A4A3C", color_background: "#FFFFFF", color_text: "#1A1A1A", font_title: "Georgia", font_body: "Arial" };
  const result = runComposedByCodeGeneration({ slides, ch, reqBody: { photos: [{}, {}, {}] }, usage: {}, emitStatus: () => {}, tStart: Date.now(), formatting } as any);
  // Mêmes gardes, même ordre que la production.
  stripSlideNumberBadges(result);
  stripDuplicateStepNumbers(result, { slides });
  stripVisualHintText(result, { slides });
  stripInventedSurtitres(result, { isPhotoCarousel: true, slides });
  applyTitleBodyContrastGuard(result, { ch });
  applyTextContrastGuard(result);
  enforceVerbatimAnchorsGuard(result, { slides });
  enforcePhotoSlideAnchorsGuard(result, { slides });
  stripDuplicateStepPrefixes(result);
  applyMinFontSizeGuard(result);

  const html: string[] = result.slides_html.map((s: any) => s.html);
  const text = (h: string) => h.replace(/<[^>]*>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
  assertEquals(html.length, 6, "nombre de slides");
  // Texte entier, titres de slide, sous-titre, invitation : rien ne disparaît.
  slides.forEach((s: any, i) => {
    for (const field of ["overlay_text", "kicker", "detail", "cta_label"]) {
      if (s[field]) assert(text(html[i]).includes(s[field]), `slide ${i + 1} : ${field} perdu (« ${s[field]} »)`);
    }
  });
  // Étapes « Étape n · … » sur les 4 slides prévues.
  [1, 2, 3, 4].forEach((n) => assert(html[n].includes(`Étape ${n} · `), `« Étape ${n} · » perdu`));
  // Motif dessiné.
  assert(html[5].includes('data-photo-format="motif"'), "motif perdu");
  // Habillages : au moins trois habillages différents sur les passages éditoriaux.
  const styles = new Set(html.flatMap((h) => [...h.matchAll(/data-photo-style="([a-z]+)"/g)].map((m) => m[1])));
  assert(styles.size >= 3, `alternance des habillages perdue : ${[...styles]}`);
  // Jamais de gros numéro d'étape ni de pagination.
  for (const [i, h] of html.entries()) {
    assert(!/>\s*0[1-9]\s*</.test(h), `slide ${i + 1} : gros numéro d'étape`);
    assert(!/\b\d+\s*\/\s*6\b/.test(text(h)), `slide ${i + 1} : pagination`);
  }
});

// ═══ Numéro d'étape lu deux fois : « Étape 2 · Le tour » + titre « 2. Le tour » (audit 04/10/2026) ═══
// Gardes de production dans l'ordre de production (sous-ensemble utile au texte).
function productionGuards(result: any, slides: any[], ch: any, isPhotoCarousel: boolean) {
  stripSlideNumberBadges(result);
  stripDuplicateStepNumbers(result, { slides });
  stripVisualHintText(result, { slides });
  stripInventedSurtitres(result, { isPhotoCarousel, slides });
  applyTitleBodyContrastGuard(result, { ch });
  applyTextContrastGuard(result);
  enforceVerbatimAnchorsGuard(result, { slides });
  enforcePhotoSlideAnchorsGuard(result, { slides });
  stripDuplicateStepPrefixes(result);
  applyMinFontSizeGuard(result);
}
const visibleText = (h: string) => h.replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]*>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

Deno.test("étape numérotée deux fois — PHOTO : le titre « 2. Le tour » perd son « 2. » sous « Étape 2 · Le tour »", async () => {
  const { validatePhotoFormatting } = await import("../_shared/photo-formatting.ts");
  const art = (treatment: string, position = "bottom_left") => ({ treatment, position, emphasis: null, reason: "t", surface: "veil", alignment: "left" });
  const slides = [
    { slide_number: 1, photo_index: 1, overlay_text: "Ma façon de faire un bol, du pain de terre au four", art_direction: art("opening") },
    { slide_number: 2, photo_index: 2, kicker: "1. La terre", overlay_text: "Je pétris longtemps pour chasser l'air de la terre.", art_direction: art("editorial") },
    { slide_number: 3, photo_index: 1, kicker: "2. Le tour", overlay_text: "Sur le tour, la forme monte sous mes doigts en 2 minutes.", art_direction: art("editorial", "top_left") },
    { slide_number: 4, photo_index: 2, kicker: "4. La cuisson", overlay_text: "Le four révèle les couleurs, toujours un peu autrement.", art_direction: art("editorial") },
    { slide_number: 5, photo_index: 1, overlay_text: "Trois temps, une seule main.", cta_label: "Voir l'atelier", art_direction: art("closing") },
  ];
  const formatting = { version: "test", status: "completed", ...validatePhotoFormatting({
    steps: [{ slide_number: 2, label: "La terre" }, { slide_number: 3, label: "Le tour" }, { slide_number: 4, label: "La cuisson" }], motifs: [] }, slides) };
  assertEquals(formatting.steps.length, 3, "étapes validées");
  const ch = { color_primary: "#3A4A3C", color_secondary: "#A9BCC8", color_accent: "#3A4A3C", color_background: "#FFFFFF", color_text: "#1A1A1A", font_title: "Georgia", font_body: "Arial" };
  const result = runComposedByCodeGeneration({ slides, ch, reqBody: { photos: [{}, {}] }, usage: {}, emitStatus: () => {}, tStart: Date.now(), formatting } as any);
  productionGuards(result, slides, ch, true);
  const html: string[] = result.slides_html.map((s: any) => s.html);
  assert(html[1].includes("Étape 1 · La terre") && html[2].includes("Étape 2 · Le tour"), "étapes dessinées conservées");
  assert(!visibleText(html[1]).includes("1. La terre") && visibleText(html[1]).includes("La terre"), "« 1. » en double sous « Étape 1 »");
  assert(!visibleText(html[2]).includes("2. Le tour"), "« 2. » en double sous « Étape 2 »");
  // Numéro différent de l'étape dessinée (3) : rien n'est retiré.
  assert(html[3].includes("Étape 3 · La cuisson") && visibleText(html[3]).includes("4. La cuisson"), "un numéro différent reste");
  // Aucun autre chiffre ni mot ne bouge, et les données restent intactes.
  assert(visibleText(html[2]).includes("en 2 minutes."), "chiffre du texte conservé");
  for (const [i, s] of slides.entries()) assert(visibleText(html[i]).includes(s.overlay_text), `texte slide ${i + 1} perdu`);
  assertEquals(slides[2].kicker, "2. Le tour", "les données de la slide ne changent pas");
});

Deno.test("étape numérotée deux fois — TEXTE composé par le code : survit à la garde verbatim", async () => {
  const { buildCarouselDesignPlan, composeEditorialSlide, formatEditorialSlides } = await import("../_shared/carousel-design-plan.ts");
  const slides = [
    { slide_number: 1, slide_type: "text_only", title: "Comment je prépare un lancement", body: "" },
    { slide_number: 2, slide_type: "text_only", title: "1. J'écoute", body: "Je relis les messages de mes clientes." },
    { slide_number: 3, slide_type: "text_only", title: "Étape 2 : je trie", body: "Je garde une seule promesse." },
    { slide_number: 4, slide_type: "text_only", title: "3) J'écris", body: "Un texte court par jour, pendant 7 jours." },
    { slide_number: 5, slide_type: "text_only", title: "Et toi ?", body: "Dis-le-moi en commentaire." },
  ];
  const ch = { color_primary: "#23395B", color_secondary: "#23395B", color_background: "#F4EFE8", color_text: "#1E2A3A", color_accent: "#B5781A", font_title: "Georgia", font_body: "Arial" };
  const plan = buildCarouselDesignPlan(slides);
  const base = slides.map((s, i) => composeEditorialSlide(s, plan.sequence[i], ch));
  const formatting = { steps: [{ slide_number: 2, label: "J'écoute" }, { slide_number: 3, label: "je trie" }, { slide_number: 4, label: "J'écris" }], motifs: [] };
  const result: any = { slides_html: formatEditorialSlides(slides, plan, ch, base, formatting as any).map((x: any) => ({ ...x })) };
  productionGuards(result, slides, ch, false);
  const html: string[] = result.slides_html.map((s: any) => s.html);
  for (const n of [1, 2, 3]) assert(html[n].includes(`Étape ${n} · `), `étape ${n} dessinée`);
  const title = (h: string) => /<h1[^>]*data-slide-text="title"[^>]*>([^<]*)<\/h1>/.exec(h)?.[1];
  assertEquals(title(html[1]), "J'écoute");
  assertEquals(title(html[2]), "je trie");
  assertEquals(title(html[3]), "J'écris");
  assert(visibleText(html[3]).includes("pendant 7 jours."), "chiffre du corps conservé");
  assertEquals(slides[2].title, "Étape 2 : je trie", "les données de la slide ne changent pas");
});

Deno.test("étape numérotée deux fois — MIXTE : titre dédoublonné, sans étape rien ne bouge", async () => {
  const { applyMixFormatting, composeMixCarousel } = await import("../_shared/mix-slide-layouts.ts");
  const slides = [
    { slide_number: 1, slide_type: "photo_integrated", photo_index: 1, title: "Ce qu'une pièce finie ne raconte pas", body: "" },
    { slide_number: 2, slide_type: "photo_integrated", photo_index: 2, title: "1. Le pétrissage", body: "Tout commence avant le tour, par la terre que je pétris." },
    { slide_number: 3, slide_type: "photo_integrated", photo_index: 3, title: "2. Le tournage", body: "Sur le tour, la forme naît sous la main." },
    { slide_number: 4, slide_type: "photo_integrated", photo_index: 4, title: "3. L'émaillage", body: "Je pose l'émail, mais rien n'est encore joué." },
    { slide_number: 5, slide_type: "text_only", title: "4. Le carnet", body: "Semaine après semaine, les pages se remplissent." },
  ];
  const ch = { color_primary: "#3A4A3C", color_secondary: "#3A4A3C", color_background: "#F4EFE8", color_text: "#1A1A1A", color_accent: "#3A4A3C", font_title: "Georgia", font_body: "Arial" };
  const plan = { steps: [{ slide_number: 2, label: "Le pétrissage" }, { slide_number: 3, label: "Le tournage" }, { slide_number: 4, label: "L'émaillage" }], motifs: [] };
  const composed = composeMixCarousel(applyMixFormatting(slides as any, plan as any), ch, 4)!;
  const result: any = { slides_html: composed.map(({ layout: _l, ...x }: any) => x) };
  productionGuards(result, slides, ch, false);
  const html: string[] = result.slides_html.map((s: any) => s.html);
  for (const n of [1, 2, 3]) {
    assert(html[n].includes(`Étape ${n} · `), `étape ${n} dessinée`);
    assert(!visibleText(html[n]).includes(`${n}. `), `numéro ${n} en double`);
  }
  assert(visibleText(html[4]).includes("4. Le carnet"), "sans étape dessinée, le titre numéroté reste entier");
});

// ═══ GARDE-FOU DE NON-RÉGRESSION : carrousel MIXTE de référence (04/10/2026) ═══
// La disposition est décidée APRÈS l'écriture (mix-layout-formatting.ts). Ce
// carrousel passe par la lecture de la réponse de l'IA (propositions valides ET
// invalides), la composition de production et toutes les gardes, dans l'ordre de
// production : aucun mot ni aucune photo ne disparaît, chaque disposition vient
// du catalogue validé, jamais deux voisines identiques, et une proposition
// refusée laisse exactement le choix d'avant.
Deno.test("NON-RÉGRESSION mixte : dispositions proposées après l'écriture, rien ne se perd après les gardes de production", async () => {
  const { applyMixFormatting, composeMixCarousel, mixLayoutOptions } = await import("../_shared/mix-slide-layouts.ts");
  const { applyMixLayouts, validateMixLayoutPlan } = await import("../_shared/mix-layout-formatting.ts");
  const slides = [
    { slide_number: 1, slide_type: "photo_integrated", photo_index: 2, title: "Pourquoi deux bols de la même série ne sont jamais pareils", body: "" },
    { slide_number: 2, slide_type: "photo_integrated", photo_index: 1, title: "Le pétrissage", body: "Tout commence avant le tour. Je pétris chaque boule d'argile à la main pour chasser l'air, et aucune n'a tout à fait la même humidité." },
    { slide_number: 3, slide_type: "photo_full", photo_index: 4, overlay_text: "Sur le tour, un millimètre change tout." },
    { slide_number: 4, slide_type: "photo_integrated", photo_index: 3, title: "L'émail", body: "Le même bleu, posé de la même façon, coule différemment selon sa place dans le four." },
    { slide_number: 5, slide_type: "photo_integrated", photo_index: 5, title: "", body: "Chaque fournée a sa page dans mon carnet : température, place dans le four, couleur obtenue." },
    { slide_number: 6, slide_type: "text_only", title: "Trois gestes, une seule main", body: "Pétrir, tourner, cuire.", visual_schema: { type: "checklist", items: [{ text: "Pétrir" }, { text: "Tourner" }, { text: "Cuire" }] } },
    { slide_number: 7, slide_type: "text_only", title: "Ce carnet ne sert pas à effacer ces écarts.", body: "Il m'aide à les comprendre. Le bol que tu choisis dans la série n'existe qu'une fois.", cta_label: "Voir la série" },
  ];
  const ch = { color_primary: "#3A4A3C", color_secondary: "#A9BCC8", color_accent: "#3A4A3C", color_background: "#FFFFFF", color_text: "#1A1A1A", font_title: "Georgia", font_body: "Arial" };
  const options = new Map(slides.map((s, i) => [s.slide_number, mixLayoutOptions(s as any, ch, { isFirst: i === 0, photoCount: 5 })] as const).filter(([, o]) => o.length >= 2));
  const plan = validateMixLayoutPlan(JSON.stringify({ layouts: [
    { slide_number: 1, layout: "passe_partout", reason: "couverture : refusée" },
    { slide_number: 2, layout: "cote_a_cote", side: "right", reason: "photo verticale" },
    { slide_number: 3, layout: "sur_photo", position: "top", reason: "phrase courte, mains en bas" },
    { slide_number: 4, layout: "sur_photo", reason: "trop long : refusée" },
    { slide_number: 5, layout: "photo_aplat", reason: "voisine d'une pause : refusée" },
    { slide_number: 6, layout: "respiration", reason: "slide texte : refusée" },
  ] }), options);
  const formatting = { steps: [{ slide_number: 2, label: "Le pétrissage" }, { slide_number: 3, label: "" }, { slide_number: 4, label: "L'émail" }], motifs: [] };
  const numbered = slides.map(s => ({ ...s }));
  const base = composeMixCarousel(applyMixFormatting(numbered as any, formatting as any), ch, 5)!;
  const composed = composeMixCarousel(applyMixFormatting(applyMixLayouts(numbered as any, plan), formatting as any), ch, 5)!;
  const layouts = composed.map(s => s.layout);
  assertEquals(layouts, ["couverture_photo", "cote_a_cote", "sur_photo", "photo_aplat", "passe_partout", "pause", "respiration"]);
  assertEquals(composed.map(s => s.layout_proposal?.status ?? null), [null, "accepted", "accepted", null, "rejected", null, null]);
  // Slide 4 (proposition refusée dès la lecture) et slide 5 (refusée à la
  // composition) : même choix que sans proposition à disposition égale.
  assertEquals(base[0].html, composed[0].html, "couverture inchangée");
  assertEquals(base[5].html, composed[5].html, "slide pause inchangée");
  const result: any = { slides_html: composed.map(({ layout: _l, schema_dropped: _d, layout_proposal: _p, ...x }: any) => x) };
  productionGuards(result, slides, ch, false);
  const html: string[] = result.slides_html.map((s: any) => s.html);
  assertEquals(html.length, 7, "nombre de slides");
  slides.forEach((s: any, i) => {
    for (const field of ["title", "body", "overlay_text", "cta_label"]) if (s[field]) assert(visibleText(html[i]).includes(s[field]), `slide ${i + 1} : ${field} perdu (« ${s[field]} »)`);
    if (s.slide_type !== "text_only") assert(html[i].includes(`{{PHOTO_${s.photo_index}}}`) && html[i].includes(`data-pptx-photo="${s.photo_index}"`), `slide ${i + 1} : photo perdue`);
  });
  const catalog = ["couverture_photo", "couverture_aplat", "photo_aplat", "passe_partout", "cote_a_cote", "sur_photo", "respiration", "pause", "vignette"];
  for (const [i, h] of html.entries()) assert(catalog.some(l => h.includes(`data-carousel-layout="mix-${l}"`)), `slide ${i + 1} : disposition hors catalogue`);
  for (let i = 1; i < layouts.length; i++) assert(layouts[i] !== layouts[i - 1], `slides ${i} et ${i + 1} identiques`);
  [1, 2, 3].forEach(n => assert(html[n].includes(`Étape ${n}`), `« Étape ${n} » perdu`));
  assert(/top:96px/.test(html[2]), "bloc de l'overlay en haut, comme proposé");
  assert(visibleText(html[5]).includes("Tourner"), "schéma de la slide pause perdu");
});

Deno.test("couverture texte (04/10/2026) : la slide 1 dessinée par l'IA est remplacée par la couverture du code", () => {
  // Vu en réel : illustration décorative au-dessus de l'accroche + mot coloré.
  const slides = [
    { slide_number: 1, title: "Publier tous les jours use plus qu'il ne vend", body: "Pour les petites marques artisanales qui s'essoufflent sur Instagram" },
    { slide_number: 2, title: "Instagram juge chaque publication une par une", body: "Corps." },
  ];
  const aiCover = `<div style="width:1080px;height:1350px;background:#f8f8f8"><div data-editor-shape="decor" data-decorative="1" style="width:220px;height:160px"><svg></svg></div><h1 data-slide-text="title">Publier tous les jours <span style="color:#5a765c;font-style:italic">use</span> plus qu'il ne vend</h1><p data-slide-text="body">Pour les petites marques artisanales qui s'essoufflent sur Instagram</p></div>`;
  const result: any = { slides_html: [{ slide_number: 1, html: aiCover }, { slide_number: 2, html: "<div>slide 2</div>" }] };
  const ch = { color_background: "#F8F8F8", color_text: "#1C1C20", color_secondary: "#1C1C20", font_title: "Spectral", font_body: "Open Sans" };
  enforceTextCover(result, { slides, ch, isText: true });
  const html = result.slides_html[0].html;
  assert(html.includes('data-carousel-layout="opening"'));
  assert(!html.includes("data-decorative") && !html.includes("<svg") && !html.includes("font-style:italic"));
  assert(html.includes(slides[0].title) && html.includes(slides[0].body));
  assertEquals((html.match(/text-align:center/g) || []).length, 2);
  assertEquals(result.slides_html[1].html, "<div>slide 2</div>");
  // Photo / mixte : jamais touchés par cette garde.
  const photo: any = { slides_html: [{ slide_number: 1, html: aiCover }] };
  enforceTextCover(photo, { slides, ch, isText: false });
  assertEquals(photo.slides_html[0].html, aiCover);
});

// ═══ VRAI CHEMIN du mixte automatique (test en ligne du 04/10/2026) ═══
// Récit continu (carousel-ai) → slides envoyées par le front
// (visualSlidePayload) → étages de carousel-visual (composeMixStages) → mémoire
// gardée par le front (applyMixLayoutMemos) → régénération. En ligne, aucune
// disposition n'était mémorisée et chaque photo_integrated portait
// photo_layout « top_photo », un défaut inventé en deux endroits.
Deno.test("VRAI CHEMIN mixte auto : l'étage de disposition est consulté, la mémoire revient et la régénération la reprend", async () => {
  const { composeNarrative } = await import("../carousel-ai/continuous-narrative.ts");
  const { visualSlidePayload } = await import("../../../src/lib/visual-slide-payload.ts");
  const { applyMixLayoutMemos } = await import("../../../src/lib/mix-layout-memo.ts");
  const { composeMixCarousel } = await import("../_shared/mix-slide-layouts.ts");
  const narrative = {
    idea: "Deux bols d'une même série ne sont jamais pareils",
    hook: "Pourquoi deux bols de la même série ne sont jamais pareils",
    paragraphs: [
      "Tout commence avant le tour : chaque boule d'argile a sa propre humidité.",
      "Sur le tour, un millimètre change tout.",
      "Le même bleu, posé de la même façon, coule différemment selon sa place dans le four.",
      "Chaque fournée a sa page dans mon carnet : température, place, couleur obtenue.",
      "Ces écarts ne sont pas des défauts à effacer.",
      "Le bol que tu choisis n'existe qu'une fois.",
    ],
    caption: { hook: "", body: "", cta: "", hashtags: [] },
  };
  const body = { carousel_type: "mix", scenario_origin: "automatic", slide_count: 7, photo_contexts: [{}, {}, {}] };
  const raw = composeNarrative(narrative, body);
  // 1. carousel-ai n'invente plus de disposition.
  for (const s of raw.slides as any[]) assert(!("photo_layout" in s), `slide ${s.slide_number} : photo_layout inventé`);
  // 2. Le front n'en invente pas non plus.
  const send = (slides: any[]) => slides.map((s: any) => visualSlidePayload(s, s.slide_type, Number.isInteger(s.photo_index) ? s.photo_index : undefined));
  const sent = send(raw.slides);
  for (const s of sent as any[]) assert(!("photo_layout" in s), `slide ${s.slide_number} : photo_layout par défaut envoyé`);
  // 3. carousel-visual : l'étage de disposition est bien interrogé.
  const tiny = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 3, 0x20, 0, 0, 4, 0xb0, 8, 2, 0, 0, 0));
  const photos = [{ base64: tiny }, { base64: tiny }, { base64: tiny }];
  const ch = { color_primary: "#3A4A3C", color_secondary: "#A9BCC8", color_accent: "#3A4A3C", color_background: "#FFFFFF", color_text: "#1A1A1A", font_title: "Georgia", font_body: "Arial" };
  const calls: Record<string, number> = {};
  const call = async (req: any) => {
    calls[req.tool.name] = (calls[req.tool.name] || 0) + 1;
    if (req.tool.name === "choisir_dispositions") {
      const payload = JSON.parse(req.messages[0].content[0].text);
      return JSON.stringify({ layouts: payload.slides.filter((s: any) => s.options.length).map((s: any) => ({ slide_number: s.slide_number, layout: s.options.includes("passe_partout") && s.slide_number % 2 ? "passe_partout" : s.options.at(-1), side: "right", position: "top", reason: "r" })) });
    }
    return JSON.stringify({ steps: [], motifs: [] });
  };
  const render = async (slides: any[]) => {
    const payload = send(slides);
    const initial = composeMixCarousel(payload, ch, photos.length)!;
    assert(initial, "le mixte doit être composé par le code");
    return { payload, ...(await composeMixStages({ slides: payload, ch, photos, photoCount: photos.length, usage: {}, initial, call: call as any })) };
  };
  const first = await render(raw.slides);
  assertEquals(calls.choisir_dispositions, 1, "étage de disposition non consulté");
  assertEquals(first.layouts.status, "completed");
  assert(first.composed.some(c => c.layout_proposal?.status === "accepted"), "aucune disposition proposée retenue");
  // 4. La mémoire revient pour chaque slide photo hors couverture.
  const photoSlides = (raw.slides as any[]).map((s, i) => i > 0 && s.slide_type !== "text_only");
  assertEquals(first.memos.map(m => !!m), photoSlides, "mémoire absente");
  const saved = applyMixLayoutMemos(raw.slides as any[], first.memos);
  assertEquals(saved.map((s: any) => !!s.mix_layout_memo), photoSlides, "mémoire non gardée sur les slides");
  // 5. Régénération : mêmes visuels, pas de nouvel appel de disposition.
  const second = await render(saved);
  assertEquals(calls.choisir_dispositions, 1, "l'IA de disposition rappelée à la régénération");
  assertEquals(second.composed.map(c => c.html), first.composed.map(c => c.html));
  assertEquals(applyMixLayoutMemos(saved, second.memos), saved, "mémoire stable");
});

Deno.test("ancien carrousel : une disposition explicite garde son rendu ; « top_photo » reste neutre", async () => {
  const { visualSlidePayload } = await import("../../../src/lib/visual-slide-payload.ts");
  const { composeMixCarousel } = await import("../_shared/mix-slide-layouts.ts");
  const ch = { color_primary: "#3A4A3C", color_secondary: "#A9BCC8", color_accent: "#3A4A3C", color_background: "#FFFFFF", color_text: "#1A1A1A", font_title: "Georgia", font_body: "Arial" };
  const slides = [
    { slide_number: 1, slide_type: "photo_full", photo_index: 1, overlay_text: "Pourquoi deux bols ne sont jamais pareils" },
    { slide_number: 2, slide_type: "photo_integrated", photo_index: 2, photo_layout: "right_photo", title: "Le tour", body: "Un millimètre change tout." },
    { slide_number: 3, slide_type: "photo_integrated", photo_index: 1, photo_layout: "top_photo", title: "L'émail", body: "Le bleu coule selon sa place dans le four." },
    { slide_number: 4, slide_type: "text_only", title: "Une seule fois", body: "Ce bol n'existe qu'une fois." },
  ];
  const sent = slides.map((s: any) => visualSlidePayload(s, s.slide_type, s.photo_index));
  assertEquals((sent[1] as any).photo_layout, "right_photo");
  assertEquals((sent[2] as any).photo_layout, "top_photo");
  // Même rendu qu'avant : la disposition confirmée est respectée, top_photo = rendu sans disposition.
  const out = composeMixCarousel(sent as any, ch, 2)!;
  assertEquals(out[1].layout, "cote_a_cote");
  const neutral = composeMixCarousel(sent.map((s: any, i: number) => i === 2 ? { ...s, photo_layout: undefined } : s) as any, ch, 2)!;
  assertEquals(out.map(c => c.html), neutral.map(c => c.html));
});

// ═══ Régénérations successives du VRAI carrousel du test en ligne (04/10/2026) ═══
// 7 slides, photo_full / photo_integrated alternés, 3 photos. Au 1er rendu, le
// motif de la slide 5 la mettait en côte-à-côte juste après un côte-à-côte
// (repli déterministe) ; à la régénération, la mise en forme redécidée (sans
// motif) et la règle « jamais deux voisines identiques » appliquée à la seule
// mémoire faisaient basculer la slide 5, puis la 6.
async function regenerationRig() {
  const { visualSlidePayload } = await import("../../../src/lib/visual-slide-payload.ts");
  const { applyMixLayoutMemos } = await import("../../../src/lib/mix-layout-memo.ts");
  const { composeMixCarousel } = await import("../_shared/mix-slide-layouts.ts");
  const words = (n: number) => Array.from({ length: n }, (_, i) => ["la", "terre", "garde", "chaque", "geste", "du", "four", "et", "de", "la", "main"][i % 11]).join(" ") + ".";
  const raw: any = { carousel_type: "mix", slides: [
    { slide_number: 1, slide_type: "photo_full", role: "hook", photo_index: 1, overlay_text: "Pourquoi deux bols ne sont jamais pareils" },
    { slide_number: 2, slide_type: "photo_integrated", role: "developpement", photo_index: 1, title: "", body: words(30) },
    { slide_number: 3, slide_type: "photo_full", role: "developpement", photo_index: 2, overlay_text: words(25) },
    { slide_number: 4, slide_type: "photo_integrated", role: "developpement", photo_index: 3, title: "", body: words(30) },
    { slide_number: 5, slide_type: "photo_full", role: "developpement", photo_index: 2, overlay_text: words(60) },
    { slide_number: 6, slide_type: "photo_integrated", role: "developpement", photo_index: 3, title: "", body: words(30) },
    { slide_number: 7, slide_type: "text_only", role: "conclusion", title: "Une seule fois", body: "Ce bol n'existe qu'une fois." },
  ] };
  const ch = { color_primary: "#3A4A3C", color_secondary: "#A9BCC8", color_accent: "#3A4A3C", color_background: "#FFFFFF", color_text: "#1A1A1A", font_title: "Georgia", font_body: "Arial" };
  const tiny = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 3, 0x20, 0, 0, 4, 0xb0, 8, 2, 0, 0, 0));
  const photos = [{ base64: tiny }, { base64: tiny }, { base64: tiny }];
  const calls: Record<string, number> = {};
  // Comme en ligne : la mise en forme répond différemment à chaque appel (motif
  // sur la slide 5 la première fois seulement).
  const call = async (req: any) => {
    const n = calls[req.tool.name] = (calls[req.tool.name] || 0) + 1;
    if (req.tool.name === "choisir_dispositions") return JSON.stringify({ layouts: [{ slide_number: 4, layout: "cote_a_cote", side: "right", reason: "r" }] });
    return JSON.stringify(n === 1
      ? { steps: [], motifs: [{ slide_number: 5, reason: "r", elements: [{ k: "rect", x: 0, y: 0, w: 300, h: 300, tone: "soft" }, { k: "rect", x: 400, y: 0, w: 300, h: 300, tone: "accent" }] }] }
      : { steps: [], motifs: [] });
  };
  const send = (r: any) => r.slides.map((s: any) => visualSlidePayload(s, s.slide_type, Number.isInteger(s.photo_index) ? s.photo_index : undefined));
  /** Un clic « Regénérer les visuels » : front → carousel-visual → front. */
  const render = async (r: any, keepFormatting = true) => {
    const slides = send(r);
    const out = await composeMixStages({ slides, ch, photos, photoCount: 3, usage: {}, initial: composeMixCarousel(slides, ch, 3)!, call: call as any, formattingMemo: keepFormatting ? r.mix_formatting_memo : undefined });
    const saved = { ...r, slides: applyMixLayoutMemos(r.slides, out.memos), ...(out.formattingMemo ? { mix_formatting_memo: out.formattingMemo } : {}) };
    return { out, saved };
  };
  return { raw, render, calls };
}

Deno.test("régénération : trois rendus successifs du vrai carrousel → mêmes dispositions, mêmes visuels, une seule consultation de l'IA", async () => {
  const { raw, render, calls } = await regenerationRig();
  const r1 = await render(raw);
  const layouts = r1.out.composed.map(c => c.layout);
  assertEquals(layouts.slice(3, 5), ["cote_a_cote", "cote_a_cote"], "le cas réel : deux côte-à-côte voisins au 1er rendu");
  const r2 = await render(r1.saved);
  const r3 = await render(r2.saved);
  for (const r of [r2, r3]) {
    assertEquals(r.out.composed.map(c => c.layout), layouts);
    assertEquals(r.out.composed.map(c => c.html), r1.out.composed.map(c => c.html), "visuels identiques");
  }
  assertEquals(r3.saved, r1.saved, "données sauvegardées stables");
  assertEquals([calls.choisir_dispositions, calls.mettre_en_forme], [1, 1], "l'IA n'est consultée qu'au premier rendu");
});

Deno.test("régénération : même si la mise en forme est redécidée, une disposition dessinée et inchangée est reprise telle quelle", async () => {
  const { raw, render } = await regenerationRig();
  const r1 = await render(raw);
  // Mise en forme non gardée : l'IA répond cette fois sans motif.
  const r2 = await render(r1.saved, false);
  assertEquals(r2.out.composed.map(c => c.layout), r1.out.composed.map(c => c.layout));
  assert(r2.out.composed.slice(1).every(c => !c.layout_proposal || c.layout_proposal.status === "accepted"), JSON.stringify(r2.out.composed.map(c => c.layout_proposal)));
  // Texte modifié sur la slide 5 : la mémoire redevient une simple proposition (mêmes règles qu'au 1er rendu).
  const edited = { ...r1.saved, slides: r1.saved.slides.map((s: any) => s.slide_number === 5 ? { ...s, overlay_text: s.overlay_text + " Encore." } : s) };
  const r3 = await render(edited, false);
  assertEquals(r3.out.composed[4].layout_proposal?.status, "rejected");
  assert(visibleText(r3.out.composed[4].html).includes(edited.slides[4].overlay_text), "texte perdu");
});
