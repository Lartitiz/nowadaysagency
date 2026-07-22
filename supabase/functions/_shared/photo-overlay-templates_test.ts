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

Deno.test("lisibilité : un voile/scrim est TOUJOURS présent quand il y a du texte", () => {
  for (const spec of [
    base({}),
    base({ template: "etiquette", overlay_text: "AVANT" }),
    base({ template: "chiffre", big_number: "-40 %" }),
    base({ template: "citation", attribution: "La propriétaire" }),
  ]) {
    const out = composePhotoSlide(spec, CH, mid);
    assert(out.html.includes(`data-injected-scrim="1"`), `pas de scrim pour ${out.template}`);
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
  assert(/font-size:(72|84)px/.test(out.html));
  assert(out.html.includes("Libre Baskerville"));
});

Deno.test("résolution : texte ≤ 4 mots → etiquette (pastille), position center par défaut", () => {
  const spec = base({ overlay_text: "AVANT" });
  assertEquals(resolvePhotoTemplate(spec, mid), "etiquette");
  const out = composePhotoSlide(spec, CH, mid);
  assert(out.html.includes("border-radius:999px"));
  assert(out.html.includes("justify-content:center"));
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

Deno.test("liste : numéros en couleur d'accent de la charte, 3 points max", () => {
  const out = composePhotoSlide(
    base({ points: ["Désencombrer avant de décorer", "Un vrai canapé", "Trois matières, pas dix", "Un de trop"] }),
    CH,
    mid,
  );
  assert(out.html.includes("#7BC9A3"));
  assert(out.html.includes("Trois matières, pas dix"));
  assert(!out.html.includes("Un de trop"));
});

Deno.test("etape : numéro d'étape fantôme (pas un stamp de pagination), survivrait au kill-badges", () => {
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

Deno.test("un seul accent : la couverture n'utilise PAS la couleur d'accent (texte blanc)", () => {
  const out = composePhotoSlide(
    base({ slide_number: 1, overlay_text: "Ce salon ne racontait rien", kicker: "Home staging · salon" }),
    CH,
    { isFirst: true, isLast: false },
  );
  assert(!out.html.includes("#7BC9A3"));
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
