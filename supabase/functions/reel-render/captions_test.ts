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
  assertEquals(lines.map((l) => l.words.map((x) => x.text).join(" ")), ["Bonjour, je m’appelle", "Camille et"]);
  assertEquals(lines[0].start, 10);
  assertEquals(lines[0].words[2].at, 10.6);
  // La première ligne s'arrête quand la suivante commence.
  assertEquals(lines[0].duration, 1);
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
