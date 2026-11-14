import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  applyCut, biggerText, DEFAULT_TWEAKS, isDefaultTweaks, quickTweakFromText, readableFloor, sanitizeTweaks, shorter, toggleSounds,
} from "./tweaks.ts";
import { tweaksFromAi, tweakPrompt } from "./ai-tweak.ts";
import { buildReelComposition, escapeHtml } from "./hyperframes.ts";
import type { ReelRenderInput } from "./recipe.ts";

const clip = (n: number) => `https://videos.example.test/clip-${n}.mp4`;
const sections = [
  { clip_url: clip(1), duration: 6, overlay_text: "Premier écran du reel" },
  { clip_url: clip(2), duration: 8, overlay_text: "Deuxième écran, un peu plus long que le premier" },
  { clip_url: clip(3), duration: 5, overlay_text: "Fin" },
];
const input: ReelRenderInput = { voice_mode: "silent", sections };

Deno.test("sans retouche, la page de montage est exactement celle de départ", () => {
  assertEquals(buildReelComposition(input, { look: DEFAULT_TWEAKS }).html, buildReelComposition(input).html);
  assertEquals(applyCut(sections, DEFAULT_TWEAKS), sections);
  assert(isDefaultTweaks(sanitizeTweaks({}, 3)));
});

Deno.test("réglages hors bornes ramenés dans les bornes, ordre invalide oublié", () => {
  const t = sanitizeTweaks({ textScale: 9, durationScale: 0.01, volume: -3, durations: [0.1, 999, "x"], order: [0, 0, 1], calm: "oui" }, 3);
  assertEquals([t.textScale, t.durationScale, t.volume, t.calm], [1.4, 0.5, 0, false]);
  assertEquals(t.durations, [1.5, 20, null]);
  assertEquals(t.order, null);
  assertEquals(sanitizeTweaks({ order: [2, 0, 1] }, 3).order, [2, 0, 1]);
  assertEquals(sanitizeTweaks({ order: [2, 0, 1] }, 4).order, null, "réglage d'un autre plan oublié");
});

Deno.test("« Plus court » raccourcit sans passer sous le temps de lecture du texte", () => {
  let t = DEFAULT_TWEAKS;
  for (let i = 0; i < 10; i++) t = shorter(t);
  assertEquals(t.durationScale, 0.5);
  const cut = applyCut(sections, t);
  assertEquals(cut[0].duration, 3);
  assert(cut[1].duration >= readableFloor(sections[1].overlay_text));
  assertEquals(cut[2].duration, 2.5);
});

Deno.test("un passage n'est jamais allongé au-delà de son clip, le reel reste ≤ 60 s", () => {
  const long = sanitizeTweaks({ durationScale: 1.3, durations: [20, 20, 20] }, 3);
  const cut = applyCut(sections, long, [7, null, null]);
  assertEquals(cut[0].duration, 7, "clip de 7 s disponibles");
  assert(cut.reduce((a, s) => a + s.duration, 0) <= 60.01);
});

Deno.test("l'ordre est une permutation : aucun passage ajouté ni perdu", () => {
  const cut = applyCut(sections, sanitizeTweaks({ order: [2, 0, 1] }, 3));
  assertEquals(cut.map((s) => s.clip_url), [clip(3), clip(1), clip(2)]);
});

Deno.test("plan de coupe recadré ou retiré quand le passage raccourcit", () => {
  const withBroll = [{ ...sections[0], broll_url: clip(9), broll_start: 4, broll_duration: 2 }];
  const cut = applyCut(withBroll, sanitizeTweaks({ durationScale: 0.5 }, 1));
  assertEquals(cut[0].duration, 3);
  assert(!("broll_url" in cut[0]) || (cut[0].broll_start! + cut[0].broll_duration! <= cut[0].duration + 0.01));
});

Deno.test("texte plus grand : chaque mot passe toujours, découpé en plus d'écrans", () => {
  const text = "La situation, c'est l'exposition, l'étage, la vue sur cour ou sur rue. Ces tantièmes fixent les charges de chaque lot, pour toujours.";
  const plain = buildReelComposition({ voice_mode: "silent", sections: [{ clip_url: clip(1), duration: 12, overlay_text: text }] }).html;
  const big = buildReelComposition({ voice_mode: "silent", sections: [{ clip_url: clip(1), duration: 12, overlay_text: text }] }, { look: { textScale: 1.4 } }).html;
  const words = (html: string) => [...html.matchAll(/<span class="w(?: k)?">([^<]*)<\/span>/g)].map((m) => m[1]).join(" ");
  assertEquals(words(big), escapeHtml(text));
  assert((big.match(/class="line clip/g) || []).length >= (plain.match(/class="line clip/g) || []).length);
});

Deno.test("sans sons : aucune piste audio ; volume et adresse des sons réglables", () => {
  const silent = buildReelComposition(input, { look: { sounds: false } }).html;
  assert(!silent.includes("<audio"));
  const preview = buildReelComposition(input, { assetBase: "https://site.test/reel-assets/", look: { volume: 0.5 } }).html;
  assertStringIncludes(preview, 'src="https://site.test/reel-assets/pad.mp3"');
  assertStringIncludes(preview, 'src="https://site.test/reel-assets/sfx/whoosh.mp3"');
  assertStringIncludes(preview, 'data-volume="0.4"');
});

Deno.test("plus calme : pas de flou ni de coup sourd final", () => {
  const html = buildReelComposition(input, { look: { calm: true } }).html;
  assert(!html.includes("blur("));
  assert(!html.includes("impact-bass"));
  assertStringIncludes(html, 'window.__timelines["main"] = tl;');
});

Deno.test("demandes simples comprises sans IA, le reste part à l'IA", () => {
  assertEquals(quickTweakFromText("C'est trop long", DEFAULT_TWEAKS)?.durationScale, 0.85);
  assertEquals(quickTweakFromText("texte plus gros stp", DEFAULT_TWEAKS)?.textScale, 1.15);
  assertEquals(quickTweakFromText("enlève les sons", DEFAULT_TWEAKS)?.sounds, false);
  assertEquals(quickTweakFromText("plus calme", DEFAULT_TWEAKS)?.calm, true);
  assertEquals(toggleSounds(toggleSounds(DEFAULT_TWEAKS)).sounds, true);
  assertEquals(biggerText(DEFAULT_TWEAKS).textScale, 1.15);
  assertEquals(quickTweakFromText("mets le passage 3 en premier", DEFAULT_TWEAKS), null);
  assertEquals(quickTweakFromText("change la couleur en bleu", DEFAULT_TWEAKS), null);
});

Deno.test("réponse de l'IA : seuls les réglages bornés passent, un refus ne change rien", () => {
  const ok = tweaksFromAi({ understood: true, message: "Passage 3 en premier.", order: [3, 1, 2], durations: [{ passage: 2, seconds: 99 }], html: "<script>" }, DEFAULT_TWEAKS, 3);
  assertEquals(ok.tweaks.order, [2, 0, 1]);
  assertEquals(ok.tweaks.durations, [null, 20, null]);
  assert(!("html" in ok.tweaks));
  const no = tweaksFromAi({ understood: false, message: "Change le texte avec Éditer le texte.", textScale: 1.4 }, DEFAULT_TWEAKS, 3);
  assertEquals(no.understood, false);
  assertEquals(no.tweaks.textScale, 1);
  assertStringIncludes(tweakPrompt("plus court", [{ duration: 4, text: "Bonjour" }], DEFAULT_TWEAKS), "Passage 1 (4.0 s) : Bonjour");
});
