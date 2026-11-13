import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildReelComposition, escapeHtml, isHyperframesEligible, screenFontSize, screenWords, splitScreens } from "./hyperframes.ts";
import { hyperframesStatus, isHyperframesProject, submitHyperframes } from "./hyperframes-gateway.ts";
import { REEL_OVERLAY_MIN_FONT_PX } from "../_shared/socle.ts";

const clip = (n: number) => `https://videos.example.test/clip-${n}.mp4`;

Deno.test("HyperFrames ne prend que le reel sans voix monté sur clips", () => {
  assertEquals(isHyperframesEligible({ voice_mode: "silent" }), true);
  assertEquals(isHyperframesEligible({ voice_mode: "silent", mode: "cache" }), true);
  assertEquals(isHyperframesEligible({ voice_mode: "silent", mode: "filme" }), false);
  assertEquals(isHyperframesEligible({ voice_mode: "recorded" }), false);
  assertEquals(isHyperframesEligible({ voice_mode: "tts" }), false);
});

Deno.test("durée totale = somme des passages, fondu de 0,4 s entre deux plans", () => {
  const { html, duration } = buildReelComposition({
    voice_mode: "silent",
    sections: [
      { clip_url: clip(1), duration: 5, overlay_text: "Premier écran du reel" },
      { clip_url: clip(2), duration: 7, seek: 2, overlay_text: "Deuxième écran" },
    ],
  });
  assertEquals(duration, 12);
  assertStringIncludes(html, 'data-composition-id="main" data-start="0" data-duration="12"');
  assertStringIncludes(html, `src="${clip(1)}" data-start="0" data-duration="5.4"`);
  assertStringIncludes(html, `src="${clip(2)}" data-start="5" data-duration="7" data-track-index="1" data-media-start="2"`);
  assertStringIncludes(html, 'window.__timelines["main"] = tl;');
});

Deno.test("chaque mot du texte passe à l'écran, dans l'ordre, jamais raccourci", () => {
  const text = "La situation, c'est l'exposition, l'étage, la vue sur cour ou sur rue. Ces tantièmes fixent les charges de chaque lot, pour toujours, et personne ne les recalcule ensuite sans un vote unanime de toute la copropriété réunie en assemblée.";
  const { html } = buildReelComposition({ voice_mode: "silent", sections: [{ clip_url: clip(1), duration: 12, overlay_text: text }] });
  const shown = [...html.matchAll(/<span class="w(?: k)?">([^<]*)<\/span>/g)].map((m) => m[1]).join(" ");
  assertEquals(shown, escapeHtml(text));
  assert(/id="t0_1"/.test(html), "un texte long est découpé en plusieurs écrans");
});

Deno.test("le texte est échappé (pas de HTML injecté par la cliente)", () => {
  const { html } = buildReelComposition({
    voice_mode: "silent",
    sections: [{ clip_url: 'https://x.test/a.mp4" onerror="alert(1)', duration: 4, overlay_text: "<script>alert(1)</script> & co" }],
  });
  assert(!html.includes("<script>alert(1)</script>"));
  assert(!html.includes('" onerror="'));
  assertStringIncludes(html, "&lt;script&gt;alert(1)&lt;/script&gt;");
});

Deno.test("mot clé : dernier mot, avec le précédent quand l'un des deux est court", () => {
  assertEquals(screenWords("jamais celle calculée au m²").filter((w) => w.key).map((w) => w.word), ["au", "m²"]);
  assertEquals(screenWords("se revend bien moins facilement").filter((w) => w.key).map((w) => w.word), ["facilement"]);
  assertEquals(screenWords("Le T1 reste en stock.").filter((w) => w.key).map((w) => w.word), ["en", "stock."]);
  assertEquals(screenWords("Deux mots").filter((w) => w.key).length, 0);
});

Deno.test("taille du texte : grande pour un écran court, jamais sous le plancher lisible", () => {
  assertEquals(screenFontSize("Le T1 reste en stock.", false), 96);
  const long = "mot ".repeat(60).trim();
  assert(screenFontSize(long, false) >= REEL_OVERLAY_MIN_FONT_PX);
});

Deno.test("sons : whoosh à chaque coupe, montée et coup sourd sur le dernier plan", () => {
  const { html } = buildReelComposition({
    voice_mode: "silent",
    sections: [
      { clip_url: clip(1), duration: 5, overlay_text: "Un" },
      { clip_url: clip(2), duration: 5, overlay_text: "Deux trois quatre" },
      { clip_url: clip(3), duration: 5, overlay_text: "Pour quel lot a-t-elle été pensée ?" },
    ],
  });
  assertEquals((html.match(/assets\/sfx\/whoosh/g) ?? []).length, 2);
  assertStringIncludes(html, 'src="assets/sfx/riser.mp3"');
  assertStringIncludes(html, 'src="assets/sfx/impact-bass-1.mp3" data-start="10.05"');
  assertStringIncludes(html, 'class="line clip final"');
  assertStringIncludes(html, 'id="bed" src="assets/pad.mp3"');
});

Deno.test("photo de départ et plan de coupe", () => {
  const { html } = buildReelComposition({
    voice_mode: "silent",
    sections: [{ clip_url: "https://x.test/p.jpg", clip_type: "image", duration: 6, overlay_text: "Photo",
      broll_url: clip(9), broll_start: 1, broll_duration: 2, broll_seek: 3 }],
  });
  assertStringIncludes(html, '<img id="m0" class="clip" src="https://x.test/p.jpg"');
  assertStringIncludes(html, `src="${clip(9)}" data-start="1" data-duration="2" data-media-start="3" data-track-index="3"`);
});

Deno.test("relais : lancement, identifiant préfixé, jeton transmis", async () => {
  let seen: Request | null = null;
  const fake = ((input: string, init?: RequestInit) => {
    seen = new Request(input, init);
    return Promise.resolve(new Response(JSON.stringify({ id: "u-abc.exec1" }), { status: 200 }));
  }) as typeof fetch;
  const r = await submitHyperframes({ html: "<html></html>", duration: 10 }, "Bearer jeton", fake);
  assertEquals(r, { ok: true, project: "hf:u-abc.exec1" });
  assertEquals(seen!.headers.get("Authorization"), "Bearer jeton");
  assert(isHyperframesProject("hf:u-abc.exec1"));
  assert(!isHyperframesProject("abc123"));
});

Deno.test("relais : un refus au lancement rend la main (repli JSON2Video)", async () => {
  const fake = (() => Promise.resolve(new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }))) as typeof fetch;
  const r = await submitHyperframes({ html: "x", duration: 10 }, "Bearer j", fake);
  assertEquals(r.ok, false);
  assertEquals((await submitHyperframes({ html: "x", duration: 10 }, null, fake)).ok, false);
  const down = (() => Promise.reject(new Error("réseau"))) as typeof fetch;
  assertEquals((await submitHyperframes({ html: "x", duration: 10 }, "Bearer j", down)).ok, false);
});

Deno.test("relais : avancement traduit au format de l'écran", async () => {
  const reply = (body: unknown, status = 200) => (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as typeof fetch;
  assertEquals((await hyperframesStatus("hf:x", "Bearer j", reply({ status: "done", url: "https://u" }))).url, "https://u");
  assertEquals((await hyperframesStatus("hf:x", "Bearer j", reply({ status: "running" }))).status, "running");
  assertEquals((await hyperframesStatus("hf:x", "Bearer j", reply({ status: "error", message: "raté" }))).status, "error");
  assertEquals((await hyperframesStatus("hf:x", "Bearer j", reply({ error: "x" }, 502))).status, "running");
});

Deno.test("un passage long est découpé en écrans courts, lisibles à 64 px au moins", () => {
  const text = "Trois critères comptent : la consistance, la superficie et la situation. La situation, c'est l'exposition, l'étage, la vue sur cour ou sur rue. Ces tantièmes fixent les charges de chaque lot, pour toujours.";
  const screens = splitScreens(text);
  assert(screens.length >= 2);
  assertEquals(screens.join(" "), text);
  for (const sc of screens) assert(screenFontSize(sc, false) >= 64, sc);
});

Deno.test("une ponctuation isolée reste collée au mot d'avant", () => {
  const words = screenWords("pour quel lot a-t-elle été pensée ?");
  assertEquals(words[words.length - 1], { word: "pensée ?", key: true });
});
