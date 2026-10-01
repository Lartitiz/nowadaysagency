import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  composePhotoSlide,
  resolvePhotoTemplate,
  type PhotoCharter,
  type PhotoSlideSpec,
} from "./photo-overlay-templates.ts";

const CH: PhotoCharter = {
  color_accent: "#7BC9A3",
  font_title: "Libre Baskerville",
  font_body: "IBM Plex Mono",
};

const base = (over: Partial<PhotoSlideSpec>): PhotoSlideSpec => ({
  slide_number: 2,
  photo_index: 1,
  overlay_text: "Un volume correct, mais zéro mise en valeur : l'étagère croulait sous les dossiers.",
  ...over,
});

const mid = { isFirst: false, isLast: false };

Deno.test("contrat : racine 1080×1350, photo {{PHOTO_N}} du photo_index, ancre overlay verbatim + pptx-editable", () => {
  const out = composePhotoSlide(base({ photo_index: 3 }), CH, mid);
  assert(out.html.startsWith(`<div style="width:1080px;height:1350px;position:relative`));
  assert(out.html.includes("{{PHOTO_3}}"));
  assert(out.html.includes(`data-pptx-photo="3"`));
  assert(out.html.includes(`data-slide-text="overlay"`));
  assert(out.html.includes(`data-pptx-editable="overlay"`));
  assert(out.html.includes("l'étagère croulait sous les dossiers."));
  assertEquals(out.contrast_ok, true);
});

Deno.test("lisibilité : les textes ont un voile ou une surface opaque de marque", () => {
  for (const spec of [
    base({}),
    base({ template: "etiquette", overlay_text: "AVANT" }),
    base({ template: "chiffre", big_number: "-40 %" }),
    base({ template: "citation", attribution: "La propriétaire" }),
  ]) {
    const out = composePhotoSlide(spec, CH, mid);
    assert(out.html.includes(`data-injected-scrim="1"`) || out.html.includes(`data-photo-reading-panel="1"`) || out.html.includes("background:#7BC9A3"), `pas de surface lisible pour ${out.template}`);
  }
});

Deno.test("safe zones : padding bas 220px et haut 110px dans le wrapper de contenu", () => {
  const out = composePhotoSlide(base({}), CH, mid);
  assert(out.html.includes("padding:110px 84px 220px 84px"));
});

Deno.test("voile dosé : photo claire → pic 0.85 ; photo sombre → 0.58 ; sans mesure → 0.78", () => {
  const claire = composePhotoSlide(base({}), CH, { ...mid, luminance: { bottom: 0.8 } });
  assert(claire.html.includes("rgba(0,0,0,0.85)"));
  const sombre = composePhotoSlide(base({}), CH, { ...mid, luminance: { bottom: 0.2 } });
  assert(sombre.html.includes("rgba(0,0,0,0.58)"));
  const sansMesure = composePhotoSlide(base({}), CH, mid);
  assert(sansMesure.html.includes("rgba(0,0,0,0.78)"));
});

Deno.test("résolution : slide 1 avec texte → couverture ; hook court → taille héros ≥ 72px", () => {
  const spec = base({ slide_number: 1, overlay_text: "Ce salon ne racontait rien" });
  assertEquals(resolvePhotoTemplate(spec, { isFirst: true, isLast: false }), "couverture");
  const out = composePhotoSlide(spec, CH, { isFirst: true, isLast: false });
  assert(/font-size:(72|80|84)px/.test(out.html));
  assert(out.html.includes("Libre Baskerville"));
});

Deno.test("résolution : texte ≤ 4 mots → etiquette de marque, sans capitales forcées", () => {
  const spec = base({ overlay_text: "AVANT" });
  assertEquals(resolvePhotoTemplate(spec, mid), "etiquette");
  const out = composePhotoSlide(spec, CH, mid);
  assert(out.html.includes("background:#7BC9A3"));
  assert(!out.html.includes("text-transform:uppercase"));
  assert(out.html.includes("justify-content:flex-end"));
});

Deno.test("résolution par champs : big_number → chiffre, points → liste, step_number → etape, attribution → citation", () => {
  assertEquals(resolvePhotoTemplate(base({ big_number: "-40 %" }), mid), "chiffre");
  assertEquals(resolvePhotoTemplate(base({ points: ["Désencombrer", "Un vrai canapé"] }), mid), "liste");
  assertEquals(resolvePhotoTemplate(base({ step_number: 2 }), mid), "etape");
  assertEquals(resolvePhotoTemplate(base({ attribution: "La propriétaire" }), mid), "citation");
});

Deno.test("cohérence : gabarit exigeant un champ absent → dégradé en profonde ; couverture hors slide 1 → profonde", () => {
  assertEquals(resolvePhotoTemplate(base({ template: "chiffre" }), mid), "profonde");
  assertEquals(resolvePhotoTemplate(base({ template: "liste" }), mid), "profonde");
  assertEquals(resolvePhotoTemplate(base({ template: "couverture" }), mid), "profonde");
  assertEquals(resolvePhotoTemplate(base({ template: "finale" }), mid), "profonde");
});

Deno.test("finale : dernière slide en question → finale, CTA en data-slide-cta + data-slide-text=cta", () => {
  const spec = base({
    overlay_text: "Et vous, elle raconte quoi, votre pièce à vivre ?",
    cta_label: "Dites-le-moi en commentaire",
  });
  assertEquals(resolvePhotoTemplate(spec, { isFirst: false, isLast: true }), "finale");
  const out = composePhotoSlide(spec, CH, { isFirst: false, isLast: true });
  assert(out.html.includes(`data-slide-cta="1"`));
  assert(out.html.includes(`data-slide-text="cta"`));
  assert(out.html.includes("Dites-le-moi en commentaire"));
});

Deno.test("liste : numéros en couleur d'accent lisible, tous les points conservés", () => {
  const out = composePhotoSlide(
    base({ points: ["Désencombrer avant de décorer", "Un vrai canapé", "Trois matières, pas dix", "Un de trop"] }),
    CH,
    mid,
  );
  assert(out.html.includes("#7BC9A3"));
  assert(out.html.includes("Trois matières, pas dix"));
  assert(out.html.includes("Un de trop"));
});

Deno.test("etape : numéro de processus lisible, pas de pagination décorative", () => {
  const out = composePhotoSlide(base({ step_number: 1, kicker: "On vide, on nettoie le regard" }), CH, mid);
  assert(out.html.includes(">01</div>"));
  assert(!/slide\s*\d/i.test(out.html));
  assert(!/\d\s*\/\s*\d/.test(out.html));
});

Deno.test("photo nue : aucun texte → pas de voile, pas d'ancre (photo dump)", () => {
  const out = composePhotoSlide(base({ overlay_text: null }), CH, mid);
  assertEquals(out.template, "photo_nue");
  assert(!out.html.includes("data-injected-scrim"));
  assert(!out.html.includes("data-slide-text"));
  assert(out.html.includes("{{PHOTO_1}}"));
});

Deno.test("sécurité : le texte est échappé (pas d'injection HTML)", () => {
  const out = composePhotoSlide(base({ overlay_text: `<img src=x onerror=alert(1)> & "fin"` }), CH, mid);
  assert(!out.html.includes("<img src=x"));
  assert(out.html.includes("&lt;img src=x onerror=alert(1)&gt; &amp; &quot;fin&quot;"));
});

Deno.test("position top : dégradé ancré en HAUT et contenu justifié flex-start", () => {
  const out = composePhotoSlide(base({ overlay_position: "top_center" }), CH, mid);
  assert(out.html.includes("top:0;width:1080px;height:54%;background:linear-gradient(180deg"));
  assert(out.html.includes("justify-content:flex-start"));
});

Deno.test("couverture : le repère fourni utilise la couleur de marque, titre blanc", () => {
  const out = composePhotoSlide(
    base({ slide_number: 1, overlay_text: "Ce salon ne racontait rien", kicker: "Home staging · salon" }),
    CH,
    { isFirst: true, isLast: false },
  );
  assert(out.html.includes("background:#7BC9A3"));
  assert(out.html.includes("font-weight:400"));
});

// ── Audit photo 22/07 : dégradations non-vides, etiquette longue, zoom répété ──

Deno.test("resolvePhotoTemplate : chiffre sans big_number mais avec points → liste (pas d'overlay vide)", () => {
  const t = resolvePhotoTemplate(
    { slide_number: 2, photo_index: 1, overlay_text: "", template: "chiffre", points: ["un geste", "un autre geste"] } as any,
    { isFirst: false, isLast: false },
  );
  assertEquals(t, "liste");
});

Deno.test("resolvePhotoTemplate : citation sans texte mais avec big_number → chiffre", () => {
  const t = resolvePhotoTemplate(
    { slide_number: 2, photo_index: 1, overlay_text: "", template: "citation", big_number: "3×" } as any,
    { isFirst: false, isLast: false },
  );
  assertEquals(t, "chiffre");
});

Deno.test("resolvePhotoTemplate : etiquette > 6 mots → profonde (la pastille déborderait)", () => {
  const t = resolvePhotoTemplate(
    { slide_number: 2, photo_index: 1, overlay_text: "une phrase beaucoup trop longue pour une pastille uppercase", template: "etiquette" } as any,
    { isFirst: false, isLast: false },
  );
  assertEquals(t, "profonde");
});

Deno.test("composePhotoSlide : zoomOnRepeat → plan serré (150 %), sinon cover", () => {
  const spec = { slide_number: 2, photo_index: 1, overlay_text: "Une phrase posée sur la photo." } as any;
  const charter = { color_accent: "#91014b", font_title: "Georgia", font_body: "Arial" } as any;
  const zoomed = composePhotoSlide(spec, charter, { isFirst: false, isLast: false, zoomOnRepeat: true });
  const normal = composePhotoSlide(spec, charter, { isFirst: false, isLast: false });
  assert(zoomed.html.includes("background-size:150%"));
  assert(normal.html.includes("background-size:cover"));
});

Deno.test("tplProfonde : texte long → police réduite (jamais clippée par overflow:hidden)", () => {
  const charter = { color_accent: "#91014b", font_title: "Georgia", font_body: "Arial" } as any;
  const long = Array(40).fill("mot").join(" ");
  const out = composePhotoSlide(
    { slide_number: 2, photo_index: 1, overlay_text: long } as any,
    charter,
    { isFirst: false, isLast: false },
  );
  assert(!out.html.includes("font-size:40px"));
});

Deno.test("citation : posée dans le tiers bas par défaut (évite le visage centré)", () => {
  const charter = { color_accent: "#91014b", font_title: "Georgia", font_body: "Arial" } as any;
  const out = composePhotoSlide(
    { slide_number: 2, photo_index: 1, overlay_text: "On a eu trois visites la première semaine.", template: "citation" } as any,
    charter,
    { isFirst: false, isLast: false },
  );
  assert(out.html.includes("justify-content:flex-end"));
});

Deno.test("passage développé : panneau de charte local, texte complet et aucun zoom implicite", () => {
  const text = "Je reprends ensuite cette bordure pour garder la même largeur sur toute la pièce. Ce passage demande plusieurs essais : je conserve ici les deux versions pour montrer précisément ce qui change dans le geste et dans le résultat visible.";
  for (const [background, color] of [["#FFF4E9", "#000000"], ["#182128", "#FFFFFF"]]) {
    const out = composePhotoSlide(base({ overlay_text: text, kicker: "Le même geste", detail: "Une précision utile", overlay_position: "top_left" }), { ...CH, color_background: background, color_text: background }, mid);
    assert(out.html.replace(/<[^>]*>/g, "").includes(text));
    assert(out.html.includes("Le même geste"));
    assert(out.html.includes("Une précision utile"));
    assert(out.html.includes('data-photo-reading-panel="1"'));
    assert(out.html.includes(`data-photo-editorial-surface="1"`));
    assert(out.html.includes(`color:#FFFFFF`));
    assert(!out.html.includes('data-injected-scrim'));
    assert(!out.html.includes('background-size:150%'));
    assert(out.html.includes('justify-content:flex-start'));
  }
});
Deno.test("texte centré : le voile couvre aussi le centre de l’image", () => {
  const out = composePhotoSlide(base({ overlay_position: "center" }), CH, { ...mid, luminance: { center: .9 } });
  assert(out.html.includes('height:1350px;background:rgba(0,0,0,0.85)'));
});

Deno.test("identité : primaire, police et angles de marque, sans graisse/italique imposés", () => {
  const spec = base({ template: "etiquette", overlay_text: "Un geste précis" });
  const a = composePhotoSlide(spec, { ...CH, color_primary: "#914B30", font_title: "Georgia", border_radius: "square" }, mid).html;
  const b = composePhotoSlide(spec, { ...CH, color_primary: "#BDE8C5", font_title: "Arial", border_radius: "rounded" }, mid).html;
  assert(a.includes("background:#914B30"));
  assert(a.includes("border-radius:0px"));
  assert(a.includes("font-family:'Georgia'"));
  assert(b.includes("background:#BDE8C5"));
  assert(b.includes("border-radius:24px"));
  assert(b.includes("font-family:'Arial'"));
  for (const html of [a, b]) {
    assert(html.includes("Un geste précis"));
    assert(!html.includes("font-style:italic"));
    assert(!html.includes("text-transform:uppercase"));
    assert(!html.includes("border-radius:999px"));
  }
});

Deno.test("surfaces claires/sombres : titres, corps et accent pâle restent contrastés", () => {
  for (const [background, ink] of [["#FFFFFF", "#000000"], ["#000000", "#FFFFFF"]]) {
    const out = composePhotoSlide(base({template:"liste", points:["Un détail essentiel", "Une suite concrète"]}), {
      ...CH, color_background:background, color_text:background, color_secondary:background, color_accent:background,
    }, mid).html;
    assert(out.includes(`background:${background}`));
    assert(out.includes(`color:${ink}`));
    assert(!out.includes(`color:${background};`));
  }
});

Deno.test("charte invalide : les champs CSS n'injectent pas de HTML ni une ressource", () => {
  const out = composePhotoSlide(base({template:"citation", attribution:"Une personne"}), {
    ...CH, color_background:'red; background:url(https://invalid.test)', border_radius:'0;position:fixed',
    font_title:'Arial\"><img src=x onerror=alert(1)>',
  }, mid).html;
  assert(!out.includes('<img src=x'));
  assert(!out.includes('https://invalid.test'));
  assert(!out.includes('position:fixed'));
});

Deno.test("chiffre et finale : les compléments fournis sont conservés avec une ancre export", () => {
  for (const template of ["chiffre", "finale"] as const) {
    const out = composePhotoSlide(base({template, big_number:"48 h", kicker:"Un repère", detail:"Une précision utile", cta_label:"La suite ensemble"}), CH, {isFirst:false,isLast:true}).html;
    assert(out.includes('Un repère'));
    assert(out.includes('Une précision utile'));
    if (template === "chiffre") assert(out.includes('data-pptx-editable="title"'));
    else assert(out.includes('data-slide-text="cta"'));
  }
});

Deno.test("editorial photo keeps exact prose, one source anchor, full photo and native fragments", () => {
  const text = "La première condition, c'est de reconnaître la pièce. Une vaisselle ne raconte pas encore votre histoire. Elle accompagne les repas de tous les jours, les mains et les tables que l'on partage.";
  const out = composePhotoSlide(base({ overlay_text: text }), CH, mid);
  assertEquals((out.html.match(/data-slide-text="overlay"/g)||[]).length, 1);
  assert(out.html.replace(/<[^>]*>/g, "").includes(text));
  assert(out.html.includes('data-photo-text-part="emphasis"'));
  assert(out.html.includes('data-photo-editorial-veil="1"'));
  assert(out.html.includes('background-size:cover'));
  assert(!out.html.includes('data-pptx-shape="card"'));
});

Deno.test("photo veil uses canvas-compatible percentage stops, never calc gradient stops", () => {
  const text = Array(65).fill("développement").join(" ");
  const html = composePhotoSlide(base({overlay_text:text}), CH, mid).html;
  assert(!html.includes("calc("));
  assert(html.includes(".92) 8%"));
  assert(html.includes(".92) 92%"));
});
