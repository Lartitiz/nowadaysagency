// Brouillon des stories en direct (27/11/2026) : chaque story finie part à
// l'écran pendant l'écriture, jamais une story à moitié écrite.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { storiesDraftPreview, storiesDraftTracker, type StoriesLiveDraft } from "./formats/stories.ts";

const FULL = JSON.stringify({
  structure_type: "storytime", total_stories: 3,
  stories: [
    { number: 1, role: "Hook", text: "Je te fais attendre six semaines.", sticker: { type: "sondage", label: "Sondage", options: ["Oui", "Non"] }, visual: { photo_directive: "savon" } },
    { number: 2, role: "Corps", text: "Un savon frais fond en trois douches.", sticker: null },
    { number: 3, role: "CTA", text: "Écris-moi « savon » en message.", sticker: null },
  ],
  personal_tip: null,
}, null, 2);

Deno.test("storiesDraftTracker : un envoi par story finie, jamais une story coupée", () => {
  const seen: StoriesLiveDraft[] = [];
  const track = storiesDraftTracker((d) => seen.push(d));
  for (let i = 1; i <= FULL.length; i += 3) track(FULL.slice(0, i));
  track(FULL);
  assertEquals(seen.map((d) => d.stories.length), [1, 2, 3]);
  const last = seen[2].stories;
  assertEquals(last.map((s) => s.text), ["Je te fais attendre six semaines.", "Un savon frais fond en trois douches.", "Écris-moi « savon » en message."]);
  assertEquals(last[0].sticker, "Sondage");
  assertEquals(last[0].role, "Hook");
});

Deno.test("storiesDraftTracker : rien tant qu'aucune story n'est finie", () => {
  const seen: StoriesLiveDraft[] = [];
  const track = storiesDraftTracker((d) => seen.push(d));
  track('{ "structure_type": "storytime", "stories": [ { "number": 1, "role": "Hook", "text": "Je te fa');
  assertEquals(seen.length, 0);
});

Deno.test("storiesDraftPreview : sans texte, rien à montrer", () => {
  assertEquals(storiesDraftPreview({ stories: [{ number: 1, text: " " }] }), null);
  assertEquals(storiesDraftPreview(null), null);
  assert(storiesDraftPreview({ stories: [{ text: "Salut" }] })!.stories[0].number === 1);
});
