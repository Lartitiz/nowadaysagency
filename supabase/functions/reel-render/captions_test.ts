import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { captionLines, captionsHtml, voiceTracks, type CaptionWord } from "./captions.ts";

const w = (text: string, start: number, end: number): CaptionWord => ({ text, start, end });

Deno.test("sous-titres : 3 mots par ligne au plus, temps décalés au début de la section", () => {
  const lines = captionLines(
    [w("Bonjour,", 0, 0.4), w("je", 0.5, 0.6), w("m’appelle", 0.6, 1), w("Camille", 1, 1.5), w("et", 1.6, 1.7)],
    10,
    5,
    "c0",
  );
  assertEquals(lines.map((l) => l.words.map((x) => x.text).join(" ")), ["Bonjour,", "je m’appelle", "Camille et"]);
  assertEquals(lines[1].start, 10.5);
  assertEquals(lines[1].words[1].at, 10.6);
  // Une ligne s'arrête quand la suivante commence.
  assertEquals(lines[0].duration, 0.5);
});

Deno.test("sous-titres : fin de phrase et silence ouvrent une ligne", () => {
  const lines = captionLines([w("Oui.", 0, 0.3), w("Alors", 0.4, 0.7), w("voilà", 1.6, 1.9)], 0, 4, "c");
  assertEquals(lines.map((l) => l.words.length), [1, 1, 1]);
});

Deno.test("sous-titres : rien ne déborde sur la section suivante", () => {
  const lines = captionLines([w("un", 0, 0.2), w("deux", 2.9, 3.4), w("trois", 3.2, 3.5)], 0, 3, "c");
  assertEquals(lines.flatMap((l) => l.words.map((x) => x.text)), ["un", "deux"]);
  const last = lines[lines.length - 1];
  assert(last.start + last.duration <= 3 + 1e-9);
});

Deno.test("sous-titres : mots vides ou temps illisibles ignorés, HTML échappé", () => {
  const lines = captionLines([w(" ", 0, 1), w("<b>", 0.1, 0.3), { text: "x", start: NaN, end: 1 }], 0, 2, "c");
  assertEquals(lines.length, 1);
  assert(captionsHtml(lines).includes("&lt;b&gt;"));
  assert(captionsHtml(lines).includes('data-track-index="5"'));
});

Deno.test("pistes à écouter : son du clip en mode filmé, voix enregistrée en mode caché, rien sans voix", () => {
  const sections = [
    { clip_url: "https://x/a.mp4", seek: 2, duration: 6, voice_audio_url: "https://x/v1.mp3" },
    { clip_url: "https://x/p.jpg", clip_type: "image" as const, duration: 4, voice_audio_url: "https://x/v2.mp3" },
  ];
  assertEquals(voiceTracks({ sections, voice_mode: "recorded", mode: "filme" }), [{ section: 0, url: "https://x/a.mp4", seek: 2, duration: 6 }]);
  assertEquals(voiceTracks({ sections, voice_mode: "recorded", mode: "cache" }).map((t) => t.url), ["https://x/v1.mp3", "https://x/v2.mp3"]);
  assertEquals(voiceTracks({ sections, voice_mode: "silent", mode: "cache" }), []);
});

import { transcribeVoiceTracks } from "./transcribe-gateway.ts";

const track = { section: 0, url: "https://x/a.mp4", seek: 0, duration: 5 };
const fakeFetch = (status: number, body: unknown) => (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch;

Deno.test("écoute : mots rendus par le relais", async () => {
  const words = await transcribeVoiceTracks([track], "Bearer t", fakeFetch(200, { items: [{ words: [{ text: "Oui", start: 0, end: 0.3 }] }] }));
  assertEquals(words, [[{ text: "Oui", start: 0, end: 0.3 }]]);
});

Deno.test("écoute : échec, réponse incomplète ou rien entendu → null (repli JSON2Video)", async () => {
  assertEquals(await transcribeVoiceTracks([track], "Bearer t", fakeFetch(502, { error: "transcribe_failed" })), null);
  assertEquals(await transcribeVoiceTracks([track], "Bearer t", fakeFetch(200, { items: [] })), null);
  assertEquals(await transcribeVoiceTracks([track], "Bearer t", fakeFetch(200, { items: [{ words: [] }] })), null);
  assertEquals(await transcribeVoiceTracks([track], null, fakeFetch(200, {})), null);
});

import { buildReelComposition, isHyperframesEligible, isSpokenHyperframesEligible } from "./hyperframes.ts";

const filmed = {
  mode: "filme" as const,
  voice_mode: "tts" as const,
  sections: [
    { clip_url: "https://x/take1.mp4", seek: 1.5, duration: 4, overlay_text: "Texte qui ne doit pas s'afficher" },
    { clip_url: "https://x/take2.mp4", duration: 3 },
  ],
};

Deno.test("reel parlé : qui passe par HyperFrames", () => {
  assert(isSpokenHyperframesEligible(filmed));
  assert(!isHyperframesEligible(filmed));
  const recorded = { voice_mode: "recorded" as const, sections: [{ clip_url: "https://x/a.mp4", duration: 3, voice_audio_url: "https://x/v.mp3" }] };
  assert(isSpokenHyperframesEligible(recorded));
  // Un passage sans enregistrement : JSON2Video le complète par une voix générée.
  assert(!isSpokenHyperframesEligible({ ...recorded, sections: [...recorded.sections, { clip_url: "https://x/b.mp4", duration: 2 }] }));
  assert(!isSpokenHyperframesEligible({ voice_mode: "silent", sections: recorded.sections }));
});

Deno.test("reel filmé : son du clip en piste séparée, sous-titres à 72 %, pas de texte à l'écran", () => {
  const { html, duration } = buildReelComposition(filmed, {
    captions: [[{ text: "Bonjour", start: 0.2, end: 0.6 }, { text: "à", start: 0.7, end: 0.8 }, { text: "toi", start: 0.8, end: 1.1 }], [{ text: "Suite", start: 0.1, end: 0.5 }]],
  });
  assertEquals(duration, 7);
  assert(html.includes('<audio id="voice0" src="https://x/take1.mp4" data-start="0" data-duration="4" data-media-start="1.5" data-track-index="6"'));
  assert(html.includes('<audio id="voice1" src="https://x/take2.mp4" data-start="4" data-duration="3" data-track-index="6"'));
  assert(html.includes('id="cap1_0" data-start="4.1"'));
  assert(html.includes("top: 1252px"));
  assert(!html.includes("ne doit pas"));
  // Les vidéos restent muettes à l'image : le son passe par la piste séparée, une seule fois.
  assertEquals((html.match(/<video[^>]*muted/g) ?? []).length, 2);
  // Pas de montée ni de coup sourd sur la fin d'un reel parlé.
  assert(!html.includes("riser"));
  assert(html.includes('id="bed"') && html.includes('data-volume="0.15"'));
});

Deno.test("reel parlé : couleur du mot dit = accent de la charte, éclairci si trop sombre", () => {
  const { html } = buildReelComposition({ ...filmed, subtitle_settings: { "word-color": "#000000" } }, { captions: [[{ text: "Oui", start: 0, end: 0.3 }], []] });
  assert(!html.includes('color: "#000000"'));
  const plain = buildReelComposition(filmed, { captions: [[{ text: "Oui", start: 0, end: 0.3 }], []] }).html;
  assert(plain.includes('"#ffe561"'));
});

Deno.test("reel sans voix : page inchangée quand il n'y a pas d'écoute", () => {
  const silent = { voice_mode: "silent" as const, sections: [{ clip_url: "https://x/a.mp4", duration: 3, overlay_text: "Bonjour" }] };
  assertEquals(buildReelComposition(silent).html, buildReelComposition(silent, { captions: null }).html);
  assert(!buildReelComposition(silent).html.includes("voice0"));
});
