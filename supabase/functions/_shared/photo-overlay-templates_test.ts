import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assignPhotoStyles,
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
  const claire = composePhotoSlide(base({overlay_text:"Une phrase courte pour ce lieu."}), CH, { ...mid, luminance: { bottom: 0.8 } });
  assert(claire.html.includes("rgba(0,0,0,0.85)"));
  const sombre = composePhotoSlide(base({overlay_text:"Une phrase courte pour ce lieu."}), CH, { ...mid, luminance: { bottom: 0.2 } });
  assert(sombre.html.includes("rgba(0,0,0,0.58)"));
  const sansMesure = composePhotoSlide(base({overlay_text:"Une phrase courte pour ce lieu."}), CH, mid);
  assert(sansMesure.html.includes("rgba(0,0,0,0.78)"));
});

Deno.test("résolution : slide 1 avec texte → couverture ; hook court → taille héros ≥ 72px", () => {
  const spec = base({ slide_number: 1, overlay_text: "Ce salon ne racontait rien" });
  assertEquals(resolvePhotoTemplate(spec, { isFirst: true, isLast: false }), "couverture");
  const out = composePhotoSlide(spec, CH, { isFirst: true, isLast: false });
  assert(/font-size:(8[4-9]|9[0-9]|10[0-9])px/.test(out.html));
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

Deno.test("résolution par champs : big_number → chiffre, points → liste, attribution → citation ; step_number ne fait plus de gabarit", () => {
  assertEquals(resolvePhotoTemplate(base({ big_number: "-40 %" }), mid), "chiffre");
  assertEquals(resolvePhotoTemplate(base({ points: ["Désencombrer", "Un vrai canapé"] }), mid), "liste");
  assertEquals(resolvePhotoTemplate(base({ step_number: 2 }), mid), "profonde");
  assertEquals(resolvePhotoTemplate(base({ template: "etape", step_number: 2 }), mid), "profonde");
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

Deno.test("ancienne slide « etape » : plus de gros numéro, le titre de slide reste, pas de pagination", () => {
  const out = composePhotoSlide(base({ template: "etape", step_number: 1, kicker: "On vide, on nettoie le regard" }), CH, mid);
  assert(!/>0?1<\/div>/.test(out.html), "gros numéro supprimé");
  assert(out.html.includes("On vide, on nettoie le regard"), "titre de slide conservé");
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
  const out = composePhotoSlide(base({ overlay_position: "top_center", overlay_text:"Une phrase courte pour ce lieu." }), CH, mid);
  assert(out.html.includes("top:0;width:1080px;height:54%;background:linear-gradient(180deg"));
  assert(out.html.includes("justify-content:flex-start"));
});

Deno.test("couverture (04/10/2026) : accroche + sous-titre centrés, voile uniforme, jamais de kicker ni de direction éditoriale", () => {
  const out = composePhotoSlide(
    base({ slide_number: 1, overlay_text: "Ce salon ne racontait rien", kicker: "Home staging · salon", detail: "Avant / après d'un home staging", overlay_position: "bottom_left", template: "profonde", points: ["a", "b"], art_direction: { treatment: "statement", surface: "veil", alignment: "left", emphasis: "" } as any }),
    CH,
    { isFirst: true, isLast: false },
  );
  assertEquals(out.template, "couverture");
  assert(!out.html.includes("Home staging · salon"), "kicker affiché");
  assert(out.html.includes("Avant / après d'un home staging"));
  assert(out.html.includes('data-photo-text-layout="center"'));
  assert(out.html.includes("text-align:center"));
  assert(out.html.includes("height:1350px;background:rgba("), "voile uniforme attendu");
  assert(!out.html.includes("linear-gradient"), "pas de dégradé sur la couverture");
  assert(!out.html.includes("data-photo-editorial-text"));
  assert(out.html.includes("font-size:100px"), "accroche de 5 mots en très grand");
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
  const out = composePhotoSlide(base({ overlay_position: "center", overlay_text:"Une phrase courte pour ce lieu." }), CH, { ...mid, luminance: { center: .9 } });
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
  assert(html.includes(".74) 8%"));
  assert(html.includes(".74) 92%"));
});

Deno.test("art direction : local paper uses brand colours and exact chosen phrase, without dropping CTA",()=>{
  const text="Une première idée. Une deuxième idée. Une conclusion.";
  const html=composePhotoSlide(base({overlay_text:text,cta_label:"En savoir plus",art_direction:{treatment:"editorial",position:"top_left",emphasis:"Une deuxième idée.",reason:"Lisibilité",surface:"paper",alignment:"center"}}),{...CH,color_background:"#fffafa",color_text:"#202020"},mid).html;
  assert(html.includes('data-pptx-shape="card"'));assert(html.includes("background:#fffafa"));assert(html.includes('text-align:center'));
  assert(!html.includes('data-photo-editorial-veil'));
  assert(html.replace(/<[^>]*>/g,"").includes(text));assert(html.includes("En savoir plus"));
});

Deno.test("voile de marque : charte foncée → dégradé teinté, reconnu par l'export ; charte sans couleur foncée → noir", () => {
  const brand = { ...CH, color_primary: "#23395B" };
  const html = composePhotoSlide(base({ overlay_text: "Une phrase courte pour ce lieu." }), brand, { ...mid, luminance: { bottom: 0.8 } }).html;
  assert(html.includes("rgba(35,57,91,0.85) 0%,rgba(35,57,91,0) 100%"));
  const neutral = composePhotoSlide(base({ overlay_text: "Une phrase courte pour ce lieu." }), CH, { ...mid, luminance: { bottom: 0.8 } }).html;
  assert(neutral.includes("rgba(0,0,0,0.85)"));
});

Deno.test("voile éditorial : teinte de la marque et bouton d'invitation lisible", () => {
  const text = "Ce carnet ne sert pas à effacer ces écarts, il m'aide à les comprendre. Le bol que tu choisis n'existe qu'une fois.";
  const html = composePhotoSlide(base({ overlay_text: text, cta_label: "Viens voir la série", art_direction: { treatment: "closing", position: "bottom_left", emphasis: null, reason: "Fin", surface: "veil", alignment: "left" } }),
    { ...CH, color_primary: "#91014b", color_background: "#FFF4F8", color_text: "#1A1A1A" }, { isFirst: false, isLast: true }).html;
  assert(/rgba\(1[23]\d,1,6\d,\.74\) 8%/.test(html), "framboise assombrie");
  assert(/data-slide-text="cta"[^>]*background:#FFF4F8;color:#1A1A1A/.test(html));
  assert(html.replace(/<[^>]*>/g, "").includes("Viens voir la série"));
});

Deno.test("voile de marque : couleur moyenne (vert) assombrie, jamais le gris par défaut", () => {
  const green = { ...CH, color_primary: "#5C7A5A" };
  const html = composePhotoSlide(base({ overlay_text: "Une phrase courte pour ce lieu." }), green, { ...mid, luminance: { bottom: 0.8 } }).html;
  const m = /rgba\((\d+),(\d+),(\d+),0\.85\) 0%/.exec(html);
  assert(m, "voile teinté attendu");
  const [r, g, b] = m!.slice(1).map(Number);
  assert(g > r && g > b, `teinte verte conservée (${r},${g},${b})`);
  assert(r + g + b > 0 && r + g + b < 200, "assez foncé pour un texte blanc");
  const editorial = composePhotoSlide(base({ overlay_text: "Une première idée. Une deuxième idée qui se développe un peu plus longuement pour la lecture." }), green, mid).html;
  assert(!editorial.includes("rgba(22,22,22,.74)"), "le voile éditorial prend la teinte de marque");
});

Deno.test("voile éditorial ancré au bord de la photo (plus de bande flottante), qui suit la position du texte", () => {
  const text = "Une première idée. Une deuxième idée qui se développe un peu plus longuement pour la lecture.";
  const html = composePhotoSlide(base({ overlay_text: text, overlay_position: "bottom_left" }), { ...CH, color_primary: "#5C7A5A" }, mid).html;
  assert(html.includes('[data-photo-text-layout^="bottom"] [data-photo-editorial-text]::before'));
  assert(html.includes('[data-photo-text-layout^="top"] [data-photo-editorial-text]::before'));
  assert(/\[data-photo-text-layout\^="bottom"\][^}]*linear-gradient\(180deg,rgba\(\d+,\d+,\d+,0\) 0%,rgba\(\d+,\d+,\d+,\.82\) 18%,rgba\(\d+,\d+,\d+,\.92\) 100%\)/.test(html));
  assert(!/::before\{[^}]*calc\(/.test(html));
});


// ── Alternance des habillages (02/10/2026) ───────────────────────────────────
const art = (treatment: string, position = "bottom_left") => ({ treatment, position, emphasis: null, reason: "t", surface: "veil" as const, alignment: "left" as const });
const words = (n: number) => Array(n).fill("argile").join(" ") + ".";

Deno.test("alternance : couverture intacte, jamais deux fois le même style, une seule colonne sur un passage moyen", () => {
  const slides = [
    base({ slide_number: 1, template: "couverture", overlay_text: "Une pièce unique", art_direction: art("opening") }),
    ...[30, 45, 28, 55, 33, 40].map((n, i) => base({ slide_number: i + 2, overlay_text: words(n), art_direction: art(i === 5 ? "closing" : "editorial") })),
  ];
  const out = assignPhotoStyles(slides);
  assertEquals(out[0].photo_style, undefined);
  const styles = out.slice(1).map(s => s.photo_style);
  for (let i = 1; i < styles.length; i++) assert(styles[i] !== styles[i - 1], `répétition : ${styles.join(",")}`);
  assertEquals(styles.filter(s => s === "colonne").length, 1);
  assertEquals(out[4].photo_style, "colonne"); // 55 mots : le plus long qui tient dans la colonne
  assert(styles.includes("carte") && styles.includes("bord") && styles.includes("verre"));
});

Deno.test("alternance : chiffre/liste non concernés, style explicite conservé, pas de colonne au-delà de 60 mots", () => {
  const out = assignPhotoStyles([
    base({ slide_number: 1, template: "chiffre", big_number: "1 mm", overlay_text: "Un millimètre change tout." }),
    base({ slide_number: 2, overlay_text: words(80), art_direction: art("editorial") }),
    base({ slide_number: 3, overlay_text: words(70), art_direction: art("editorial"), photo_style: "verre" }),
    base({ slide_number: 4, overlay_text: words(90), art_direction: art("editorial") }),
  ]);
  assertEquals(out[0].photo_style, undefined);
  assertEquals(out[2].photo_style, "verre");
  assert(!out.some(s => s.photo_style === "colonne"));
});

Deno.test("habillages : texte verbatim et ancre unique ; carte = shape natif, verre = flou sans photo d'export, colonne = photo à droite", () => {
  const text = "Devant une faïence illustrée, on reconnaît une pièce unique. C'est vrai, mais ce n'est qu'une partie de l'histoire.";
  const ch = { ...CH, color_primary: "#5C7A5A" };
  for (const style of ["bord", "carte", "verre", "colonne"] as const) {
    const html = composePhotoSlide(base({ photo_index: 2, overlay_text: text, cta_label: "Viens voir", photo_style: style, art_direction: art("editorial", "top_left") }), ch, mid).html;
    assertEquals((html.match(/data-slide-text="overlay"/g) || []).length, 1, style);
    assert(html.replace(/<[^>]*>/g, "").includes(text), style);
    assert(html.includes('data-slide-text="cta"'), style);
    assertEquals((html.match(/data-pptx-photo="2"/g) || []).length, 1, `${style} : une seule photo d'export`);
  }
  const carte = composePhotoSlide(base({ overlay_text: text, photo_style: "carte", art_direction: art("editorial") }), ch, mid).html;
  assert(carte.includes('data-photo-style="carte" data-pptx-shape="card"'));
  const verre = composePhotoSlide(base({ photo_index: 2, overlay_text: text, overlay_position: "top_left", photo_style: "verre", art_direction: art("editorial", "top_left") }), ch, mid).html;
  assert(verre.includes('data-photo-glass-blur="1"') && verre.includes("filter:blur(28px)") && verre.includes("top:-110px"));
  assert(!verre.includes("backdrop-filter"));
  const colonne = composePhotoSlide(base({ photo_index: 2, overlay_text: text, photo_style: "colonne", art_direction: art("editorial") }), ch, mid).html;
  assert(colonne.includes('data-pptx-photo="2" style="position:absolute;top:0;left:560px;width:520px'));
  assert(!colonne.includes("data-photo-text-layout"), "pas de réglage haut/bas sur la colonne");
});

Deno.test("couverture photo (socle, règle 7) : mot clé de l'accroche en italique, texte rendu inchangé ; extrait invalide ignoré", () => {
  const cover = (cover_accent: string) => composePhotoSlide(base({ slide_number: 1, overlay_text: "Ce salon ne racontait rien", cover_accent }), CH, { isFirst: true, isLast: false }).html;
  const html = cover("racontait rien");
  assert(html.includes('<span style="font-style:italic">racontait rien</span>'), "mot clé en italique attendu");
  assert(/data-slide-text="overlay"[^>]*color:#FFFFFF/.test(html), "couleur de l'accroche inchangée");
  assertEquals(html.replace(/<[^>]*>/g, "").includes("Ce salon ne racontait rien"), true);
  for (const bad of ["ne racontait plus rien", "Ce salon ne racontait rien", ""]) assert(!cover(bad).includes("font-style:italic"), `extrait « ${bad} » accepté`);
});
