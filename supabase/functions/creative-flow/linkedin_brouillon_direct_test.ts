// Brouillon du post LinkedIn en direct (27/11/2026) : le texte écrit part à
// l'écran par paliers pendant l'écriture, avant la relecture.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { linkedinDraftTracker } from "./formats/linkedin.ts";

const POST = "J'ai arrêté les remises il y a un an.\n\nUne cliente m'a demandé dix pour cent de moins. J'ai dit non, et elle a signé quand même.\n\nDepuis, ma grille est publique.";
const FULL = "```json\n" + JSON.stringify({ content: POST, accroche: "J'ai arrêté les remises il y a un an.", format: "linkedin" }, null, 2) + "\n```";

Deno.test("linkedinDraftTracker : le texte grandit par paliers et finit entier", () => {
  const seen: string[] = [];
  const track = linkedinDraftTracker((t) => seen.push(t));
  for (let i = 1; i <= FULL.length; i += 2) track(FULL.slice(0, i));
  track(FULL);
  assert(seen.length >= 3 && seen.length <= 8, `envois : ${seen.length}`);
  for (let i = 1; i < seen.length; i++) assert(seen[i].length > seen[i - 1].length);
  assertEquals(seen[seen.length - 1], POST);
  // Jamais de JSON brut ni d'échappement à l'écran.
  for (const t of seen) assert(!t.includes('"content"') && !t.includes("\\n"), t);
});

Deno.test("linkedinDraftTracker : rien avant le texte, et `accroche` n'est pas pris pour le post", () => {
  const seen: string[] = [];
  const track = linkedinDraftTracker((t) => seen.push(t));
  track('{ "accroche": "Une accroche assez longue pour dépasser six mots", "format": "linkedin"');
  track('{ "content": "');
  assertEquals(seen.length, 0);
});
