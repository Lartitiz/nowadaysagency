// Test réel du 04/10/2026 (post LinkedIn « Pourquoi publier plus souvent sur
// LinkedIn ne fait pas décoller ta portée ») : ouverture en concession de paille
// puis « Sauf que ce n'est pas tout à fait comme ça… », passée hors radar.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { analyzeTextRedac, buildTextFixInstructions, textRedacViolations } from "./redac-gate.ts";
import { linkedinBrief } from "./format-briefs.ts";

const REAL_OPENING = "Je comprends l'idée derrière la question : plus on publie, plus on existe dans le fil des gens, plus on a de chances d'être vu. C'est logique, sur le papier.\n\nSauf que ce n'est pas tout à fait comme ça que ça fonctionne. La portée se joue dans la première heure, selon les réactions des premières personnes qui voient le post.";

Deno.test("retournement « Sauf que » : le passage réel du 04/10 est détecté, une seule fois", () => {
  const a = analyzeTextRedac(REAL_OPENING);
  assertEquals(a.reversals.length, 1, JSON.stringify(a.reversals));
  assertEquals(a.reversals[0].includes("sur le papier"), true);
  assertEquals(a.reversals[0].includes("Sauf que ce n'est pas tout à fait"), true);
  assertEquals(textRedacViolations(a) >= 1, true);
});

Deno.test("retournement « Sauf que » : variantes d'ouverture vides détectées", () => {
  const cases = [
    "On te dit de poster tous les jours. Sauf que non.",
    "Poster plus, ça paraît efficace. Sauf que ça ne marche pas comme ça.",
    "Tout le monde le conseille. Sauf que c'est pas si simple.",
    "Sur le papier, ça se tient. Sauf que la portée dépend d'autre chose.",
    "Publier plus pour exister plus.\nSauf que ce n'est pas vraiment le cas.",
  ];
  for (const s of cases) {
    assertEquals(analyzeTextRedac(s).reversals.length, 1, `non détecté (ou compté deux fois) : ${s}`);
  }
});

Deno.test("retournement « Sauf que » : sauf que factuel et négations factuelles ne déclenchent pas", () => {
  const ok = [
    "Tout est prêt sauf que la livraison a du retard.",
    "La boutique ouvre lundi. Sauf que la livraison des savons a deux jours de retard.",
    "Ce n'est pas tout à fait sec, il faut encore une semaine de cure.",
    "J'ai noté le plan sur le papier. Ensuite je l'ai tapé.",
    "Plus on publie, plus on existe dans le fil, en théorie. En pratique, la portée se joue dans la première heure.",
    "Ça ne marche pas comme ça chez moi : je pèse chaque huile.",
  ];
  for (const s of ok) assertEquals(analyzeTextRedac(s).reversals, [], `faux positif : ${s}`);
});

Deno.test("retournement « Sauf que » : l'instruction de relecture et le brief LinkedIn couvrent le cas", () => {
  const instr = buildTextFixInstructions(analyzeTextRedac(REAL_OPENING));
  assertEquals(instr.includes("RETOURNEMENTS PAR NÉGATION"), true);
  assertEquals(instr.includes("pose directement le mécanisme réel"), true);
  assertEquals(instr.includes("Sauf que ce n'est pas tout à fait"), true);
  const brief = linkedinBrief("conseil_contre_courant");
  assertEquals(brief.includes("ne passe pas par une concession suivie d'un retournement"), true);
  assertEquals(linkedinBrief(null).includes("énonce directement le mécanisme réel"), true);
});
