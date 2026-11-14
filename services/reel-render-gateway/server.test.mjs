// Tests du relais (sans Google Cloud) : NODE_ENV=test node --test server.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { parseTranscribeItems, transcriptKey } from "./server.mjs";

test("écoute : morceaux valides acceptés, durée arrondie", () => {
  assert.deepEqual(parseTranscribeItems({ items: [{ url: "https://x.supabase.co/a.mp4", seek: "1.23456", duration: 8 }] }), [
    { url: "https://x.supabase.co/a.mp4", seek: 1.235, duration: 8 },
  ]);
});

test("écoute : refuse http, vide, trop long au total", () => {
  assert.equal(parseTranscribeItems({ items: [{ url: "http://x.fr/a.mp4", duration: 5 }] }), null);
  assert.equal(parseTranscribeItems({ items: [] }), null);
  assert.equal(parseTranscribeItems({ items: [{ url: "https://x.fr/a.mp4", duration: 40 }, { url: "https://x.fr/b.mp4", duration: 40 }] }), null);
});

test("écoute : même lien et même coupe = même clé de cache", () => {
  const a = transcriptKey({ url: "https://x.fr/a.mp4", seek: 0, duration: 8 });
  assert.equal(a, transcriptKey({ url: "https://x.fr/a.mp4", seek: 0, duration: 8 }));
  assert.notEqual(a, transcriptKey({ url: "https://x.fr/a.mp4", seek: 2, duration: 8 }));
  assert.match(a, /^transcripts\/[0-9a-f]{64}\.json$/);
});
