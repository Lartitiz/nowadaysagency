import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runWithHeartbeatSSE } from "./anthropic-stream.ts";

// 01/10 : flux carrousel fermé sans done/error (edge coupée pendant l'écriture)
// → le front affichait « Réponse vide du serveur ». La coupure doit produire un error.
Deno.test("SSE : une coupure de la plateforme émet un error explicite avec la raison", async () => {
  let release!: () => void;
  const pending = new Promise<Response>((resolve) => { release = () => resolve(new Response("{}")); });
  const res = runWithHeartbeatSSE({}, () => pending, 60_000);
  const reader = res.body!.getReader(), decoder = new TextDecoder();
  let text = decoder.decode((await reader.read()).value);
  const shutdown = new Event("beforeunload") as Event & { detail?: unknown };
  Object.defineProperty(shutdown, "detail", { value: { reason: "WallClockTime" } });
  globalThis.dispatchEvent(shutdown);
  for (;;) { const { done, value } = await reader.read(); if (done) break; text += decoder.decode(value); }
  assertStringIncludes(text, '"type":"error"');
  assertStringIncludes(text, '"reason":"WallClockTime"');
  release();
});

Deno.test("SSE : fin normale, un beforeunload tardif n'ajoute rien", async () => {
  const res = runWithHeartbeatSSE({}, () => Promise.resolve(new Response('{"ok":true}')), 60_000);
  const text = await res.text();
  globalThis.dispatchEvent(new Event("beforeunload"));
  assertStringIncludes(text, '"type":"done"');
  assertEquals(text.includes('"type":"error"'), false);
});
