// Brouillon du reel en direct (27/11/2026) : le texte parlé, l'accroche puis
// chaque scène finie partent à l'écran pendant l'écriture, dans l'ordre où le
// modèle écrit le JSON (format-briefs/reel.ts : lecture_test, accroche, script).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reelDraftTracker, type ReelLiveDraft } from "./formats/reel.ts";

const FULL = JSON.stringify({
  format_type: "face_cam_confession", duree_cible: "30 sec",
  lecture_test: "Tu crois que je te fais attendre pour rien. Un savon frais fond en trois douches. Après six semaines, il dure deux mois.",
  accroche: "Je te fais attendre six semaines.",
  script: [
    { section: "hook", timing: "0-3 sec", texte_parle: "Tu crois que je te fais attendre pour rien.", texte_overlay: "attendre pour rien" },
    { section: "body", timing: "3-20 sec", texte_parle: "Un savon frais fond en trois douches.", texte_overlay: null },
  ],
  sections: [{ section: "hook", texte_parle: "doublon" }],
  caption: { text: "…", accroche: "ne pas confondre" },
}, null, 2);

Deno.test("reelDraftTracker : texte parlé dès les premiers mots, puis accroche, puis scènes finies", () => {
  const seen: ReelLiveDraft[] = [];
  const track = reelDraftTracker((d) => seen.push(d));
  for (let i = 1; i <= FULL.length; i += 3) track(FULL.slice(0, i));
  track(FULL);
  // Premier envoi : du texte parlé, avant toute scène.
  assert(seen[0].monologue.length > 0 && seen[0].sections.length === 0, JSON.stringify(seen[0]));
  assertEquals(seen[0].hook, "");
  // Le texte parlé grossit par paliers (pas un envoi par lettre).
  assert(seen.length < 25, `trop d'envois : ${seen.length}`);
  const last = seen[seen.length - 1];
  assertEquals(last.hook, "Je te fais attendre six semaines.");
  assertEquals(last.sections.map((s) => s.texte_parle), ["Tu crois que je te fais attendre pour rien.", "Un savon frais fond en trois douches."]);
  assert(last.monologue.endsWith("il dure deux mois."));
  // Le nombre de scènes ne recule jamais et le doublon `sections` n'est pas lu.
  for (let i = 1; i < seen.length; i++) assert(seen[i].sections.length >= seen[i - 1].sections.length);
});

Deno.test("reelDraftTracker : rien tant qu'aucun texte n'est écrit", () => {
  const seen: ReelLiveDraft[] = [];
  const track = reelDraftTracker((d) => seen.push(d));
  track('{\n  "format_type": "face_cam_confession",\n  "duree_cible": "30');
  track('{\n  "format_type": "face_cam_confession",\n  "lecture_test": "');
  assertEquals(seen.length, 0);
});
