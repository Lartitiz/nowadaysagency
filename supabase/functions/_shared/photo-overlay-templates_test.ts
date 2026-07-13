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
