import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildReelRecipe,
  estimateOverlayLines,
  layoutOverlayText,
  OVERLAY_FONT_STEPS_PX,
  OVERLAY_MIN_FONT_PX,
  overlayTextHeight,
  splitOverlayText,
  type ReelRenderInput,
} from "./recipe.ts";

const base: ReelRenderInput = {
  voice_mode: "recorded",
  sections: [
    { clip_url: "a.mp4", duration: 4, voice_audio_url: "voix1.mp3" },
    { clip_url: "b.mp4", seek: 2, duration: 10, voice_audio_url: "voix2.mp3" },
  ],
};

Deno.test("format vertical 1080x1920 par défaut", () => {
  const r = buildReelRecipe(base) as any;
  assertEquals(r.width, 1080);
  assertEquals(r.height, 1920);
});

Deno.test("une scène par section, clip coupé et muet en cover", () => {
  const r = buildReelRecipe(base) as any;
  assertEquals(r.scenes.length, 2);
  const vid = r.scenes[1].elements[0];
  assertEquals(vid.type, "video");
  assertEquals(vid.src, "b.mp4");
  assertEquals(vid.seek, 2);
  assertEquals(vid.duration, 10);
  assertEquals(vid.muted, true);
  assertEquals(vid.resize, "cover");
});

Deno.test("mode recorded : la voix de la créatrice est un élément audio", () => {
  const r = buildReelRecipe(base) as any;
  const voix = r.scenes[0].elements[1];
  assertEquals(voix.type, "audio");
  assertEquals(voix.src, "voix1.mp3");
});

Deno.test("mode tts : voix de synthèse depuis le texte", () => {
  const r = buildReelRecipe({
    voice_mode: "tts",
    sections: [{ clip_url: "a.mp4", duration: 4, voice_text: "Bonjour" }],
  }) as any;
  const voix = r.scenes[0].elements[1];
  assertEquals(voix.type, "voice");
  assertEquals(voix.voice, "fr-FR-DeniseNeural");
  assertEquals(voix.text, "Bonjour");
});

Deno.test("mode silent : texte à l'écran, sans voix ni sous-titres audio", () => {
  const r = buildReelRecipe({
    voice_mode: "silent",
    sections: [{ clip_url: "a.mp4", duration: 4, overlay_text: "Le geste compte." }],
  }) as any;
  const texte = r.scenes[0].elements[1];
  assertEquals(texte.type, "text");
  // Casse d'origine (socle 05/10/2026 : plus de majuscules forcées).
  assertEquals(texte.text, "Le geste compte.");
  assertEquals(texte.duration, -2);
  assertEquals(r.elements, undefined);
});

Deno.test("sous-titres au niveau film par défaut, en français", () => {
  const r = buildReelRecipe(base) as any;
  assertEquals(Array.isArray(r.elements), true);
  assertEquals(r.elements[0].type, "subtitles");
  assertEquals(r.elements[0].language, "fr");
  assertEquals(r.elements[0].settings["max-words-per-line"], 3);
});

Deno.test("sous-titres placés vers le bas du centre, pas au ras du bord (bandeau Instagram)", () => {
  const r = buildReelRecipe(base) as any;
  assertEquals(r.elements[0].settings.position, "custom");
  assertEquals(r.elements[0].settings.x, 540);
  assertEquals(r.elements[0].settings.y, 1382);
});

Deno.test("position sous-titres proportionnelle au format (custom width/height)", () => {
  const r = buildReelRecipe({ ...base, width: 720, height: 1280 }) as any;
  assertEquals(r.elements[0].settings.x, 360);
  assertEquals(r.elements[0].settings.y, 922);
});

Deno.test("subtitles:false retire complètement l'élément sous-titres", () => {
  const r = buildReelRecipe({ ...base, subtitles: false }) as any;
  assertEquals(r.elements, undefined);
});

Deno.test("réglages de sous-titres personnalisés fusionnés au défaut", () => {
  const r = buildReelRecipe({ ...base, subtitle_settings: { "font-size": 120 } }) as any;
  assertEquals(r.elements[0].settings["font-size"], 120);
  // le reste du défaut est conservé
  assertEquals(r.elements[0].settings.style, "boxed-word");
});

Deno.test("mode recorded sans audio : ne bascule jamais sur une voix TTS", () => {
  const r = buildReelRecipe({
    voice_mode: "recorded",
    sections: [{ clip_url: "a.mp4", duration: 4, voice_text: "Secours" }],
  }) as any;
  assertEquals(r.scenes[0].elements.length, 1);
});

Deno.test("mode filme : le clip garde son son (muted false)", () => {
  const r = buildReelRecipe({ ...base, mode: "filme" }) as any;
  assertEquals(r.scenes[0].elements[0].muted, false);
  assertEquals(r.scenes[1].elements[0].muted, false);
});

Deno.test("mode filme : aucun élément voix, même si voice_audio_url/voice_text fournis", () => {
  const r = buildReelRecipe({
    voice_mode: "recorded",
    mode: "filme",
    sections: [
      { clip_url: "a.mp4", duration: 4, voice_audio_url: "voix1.mp3", voice_text: "Bonjour" },
    ],
  }) as any;
  assertEquals(r.scenes[0].elements.length, 1);
  assertEquals(r.scenes[0].elements[0].type, "video");
});

Deno.test("mode filme : les sous-titres restent générés (depuis l'audio du clip)", () => {
  const r = buildReelRecipe({ ...base, mode: "filme" }) as any;
  assertEquals(r.elements[0].type, "subtitles");
});

Deno.test("mode cache (défaut, omis) : comportement inchangé", () => {
  const r = buildReelRecipe(base) as any;
  assertEquals(r.scenes[0].elements[0].muted, true);
  assertEquals(r.scenes[0].elements[1].type, "audio");
});

Deno.test("face caméra : un B-roll muet couvre une plage mais conserve la prise et les sous-titres", () => {
  const r = buildReelRecipe({ voice_mode: "recorded", mode: "filme", sections: [{
    clip_url: "prise.mp4", duration: 12, broll_url: "studio.mp4",
    broll_start: 3, broll_duration: 5,
  }] }) as any;
  const [prise, cutaway] = r.scenes[0].elements;
  assertEquals(prise.src, "prise.mp4");
  assertEquals(prise.muted, false);
  assertEquals(prise.duration, 12);
  assertEquals(cutaway.src, "studio.mp4");
  assertEquals(cutaway.start, 3);
  assertEquals(cutaway.duration, 5);
  assertEquals(cutaway.muted, true);
  assertEquals(r.elements[0].type, "subtitles");
});

// ── Texte à l'écran (mode silencieux) : casse d'origine, plancher lisible, découpe ──

function silentTexts(overlay: string, width = 1080, height = 1920, duration = 4) {
  const r = buildReelRecipe({
    voice_mode: "silent",
    width,
    height,
    sections: [{ clip_url: "a.mp4", duration, overlay_text: overlay }],
  }) as any;
  return r.scenes[0].elements.filter((e: any) => e.type === "text");
}
const silentText = (overlay: string, width = 1080, height = 1920) => silentTexts(overlay, width, height)[0];

const words = (t: string) => t.split(/\s+/).filter(Boolean);

/** Chaque mot du texte d'origine est rendu, dans l'ordre, dans sa casse. */
function assertEveryWordRendered(source: string, rendered: string[]) {
  assertEquals(words(rendered.join(" ")), words(source));
}

/** Le texte, à la taille choisie, tient dans la boîte, et la boîte dans l'image. */
function assertFits(el: any, width = 1080, height = 1920) {
  const size = parseInt(el.settings["font-size"], 10);
  const lines = estimateOverlayLines(el.text, size, el.width);
  assert(overlayTextHeight(lines, size) <= el.height, `${lines} lignes à ${size}px > ${el.height}px`);
  assert(el.x >= 0 && el.x + el.width <= width, "boîte hors cadre (largeur)");
  assert(el.y >= Math.round(height * 0.12), "boîte trop haute (zone profil Instagram)");
  assert(el.y + el.height <= Math.round(height * 0.86), "boîte trop basse (bandeau Instagram)");
}

Deno.test("texte à l'écran court (cas normal) : boîte et style validés inchangés, casse d'origine", () => {
  for (const overlay of ["9 pages. Zéro lecture.", "PARFAIT. DONC RATÉ.", "Ton devis tient sur une page entière maintenant"]) {
    const all = silentTexts(overlay);
    assertEquals(all.length, 1);
    const el = all[0];
    assertEquals(el.text, overlay);
    assertEquals({ x: el.x, y: el.y, width: el.width, height: el.height, style: el.style, duration: el.duration }, {
      x: 70, y: 1229, width: 940, height: 422, style: "001", duration: -2,
    });
    assertEquals(el.settings, {
      "font-family": "Montserrat",
      "font-size": "58px",
      "font-weight": "700",
      color: "#FFFFFF",
      "background-color": "#00000099",
      "text-align": "center",
    });
  }
});

Deno.test("plus de majuscules forcées : le texte garde la casse écrite", () => {
  assertEquals(silentText("parfait. donc raté.").text, "parfait. donc raté.");
  assertEquals(silentText("Écrire à l'œil").text, "Écrire à l'œil");
});

const LONG_SPOKEN =
  "J'étais tellement fière de tout détailler dans mon devis, chaque option, chaque variante, chaque petite ligne de " +
  "conditions, mais la cliente m'a répondu ok pour la formule du milieu alors qu'il n'y avait pas de formules du tout. " +
  "Ce jour-là j'ai compris qu'un devis trop long ne rassure personne : il fatigue, il noie la décision, et la cliente " +
  "choisit au hasard ou ne choisit pas. Depuis, je n'écris plus que trois lignes et une seule question.";

Deno.test("texte long : découpé en écrans successifs, jamais sous le plancher lisible, aucun mot perdu", () => {
  const all = silentTexts(LONG_SPOKEN);
  assert(all.length > 1, "le texte long aurait dû être découpé");
  assertEveryWordRendered(LONG_SPOKEN, all.map((e: any) => e.text));
  for (const el of all) {
    assertFits(el);
    assert(parseInt(el.settings["font-size"], 10) >= OVERLAY_MIN_FONT_PX, "police sous le plancher");
    assertEquals([el.y, el.height], [1229, 422]); // la boîte validée, jamais agrandie
  }
  // Les écrans se suivent dans la scène : départs croissants, le dernier va jusqu'au bout.
  const starts = all.map((e: any) => e.start);
  assertEquals(starts[0], 0);
  for (let i = 1; i < starts.length; i++) assert(starts[i] > starts[i - 1]);
  assertEquals(all[all.length - 1].duration, -2);
});

Deno.test("découpe : à la fin d'une phrase quand la phrase tient", () => {
  const chunks = splitOverlayText(LONG_SPOKEN, 1080, 1920);
  // Chaque écran sauf peut-être un morceau de phrase trop longue finit sur une ponctuation forte.
  assert(chunks.filter((c) => /[.!?…]$/.test(c)).length >= chunks.length - 2, chunks.join(" | "));
});

Deno.test("texte intermédiaire : police réduite par palier, un seul écran, boîte d'origine", () => {
  const medium = "Un devis trop long ne rassure personne : il fatigue, il noie la décision et la cliente choisit au hasard.";
  const all = silentTexts(medium);
  assertEquals(all.length, 1);
  const el = all[0];
  assertEveryWordRendered(medium, [el.text]);
  assertFits(el);
  assert((OVERLAY_FONT_STEPS_PX as readonly number[]).includes(parseInt(el.settings["font-size"], 10)));
  assertEquals([el.y, el.height], [1229, 422]);
});

Deno.test("texte très long : autant d'écrans qu'il faut, jamais de coupe ni de police minuscule", () => {
  const huge = Array(4).fill(LONG_SPOKEN).join(" ");
  const all = silentTexts(huge, 1080, 1920, 40);
  assertEveryWordRendered(huge, all.map((e: any) => e.text));
  for (const el of all) {
    assertFits(el);
    assert(parseInt(el.settings["font-size"], 10) >= OVERLAY_MIN_FONT_PX);
  }
});

Deno.test("mot unique plus long qu'une ligne : rendu entier et la boîte en tient compte", () => {
  const el = silentText("anticonstitutionnellementanticonstitutionnellement");
  assertEquals(el.text, "anticonstitutionnellementanticonstitutionnellement");
  assertFits(el);
});

Deno.test("format réduit (720x1280) : la garde suit les proportions", () => {
  const all = silentTexts(LONG_SPOKEN, 720, 1280);
  assertEveryWordRendered(LONG_SPOKEN, all.map((e: any) => e.text));
  for (const el of all) assertFits(el, 720, 1280);
});

Deno.test("layoutOverlayText est pur, garde la casse et ne coupe rien", () => {
  const l = layoutOverlayText("  trois mots ici  ", 1080, 1920);
  assertEquals(l.text, "trois mots ici");
  assertEquals(l.fontSizePx, 58);
  assertEquals(OVERLAY_FONT_STEPS_PX[OVERLAY_FONT_STEPS_PX.length - 1], OVERLAY_MIN_FONT_PX);
});
