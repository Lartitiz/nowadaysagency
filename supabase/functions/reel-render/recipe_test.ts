import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildReelRecipe, type ReelRenderInput } from "./recipe.ts";

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

Deno.test("sous-titres au niveau film par défaut, en français", () => {
  const r = buildReelRecipe(base) as any;
  assertEquals(Array.isArray(r.elements), true);
  assertEquals(r.elements[0].type, "subtitles");
  assertEquals(r.elements[0].language, "fr");
  assertEquals(r.elements[0].settings["max-words-per-line"], 3);
});

Deno.test("sous-titres placés en bas, pas en travers du visage", () => {
  const r = buildReelRecipe(base) as any;
  assertEquals(r.elements[0].settings.position, "bottom-center");
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

Deno.test("mode recorded sans audio mais avec texte : bascule sur la voix TTS", () => {
  const r = buildReelRecipe({
    voice_mode: "recorded",
    sections: [{ clip_url: "a.mp4", duration: 4, voice_text: "Secours" }],
  }) as any;
  // pas d'audio fourni → on ne laisse pas la scène muette, on retombe sur le texte
  assertEquals(r.scenes[0].elements[1].type, "voice");
  assertEquals(r.scenes[0].elements[1].text, "Secours");
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
