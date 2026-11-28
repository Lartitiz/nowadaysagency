// Recherche d'actus lue en flux (28/11/2026) : les actus terminées et les
// recherches lancées partent à l'écran avant la fin de la réponse.
//
// Lancer : deno test --no-check --no-lock supabase/functions/newsjacking-ai/flux_test.ts

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { actusCompletes, lireFluxRecherche } from "./flux.ts";
import { garderActusFraiches, actusDeSecours } from "./sources.ts";
import { construireConsigne, axesDuMoment } from "./consigne.ts";

const flux = (evenements: unknown[]) =>
  new Response(evenements.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join("")).body!;

Deno.test("actusCompletes : rend seulement les actus entièrement écrites", () => {
  const debut = 'Voici.\n{"actus":[{"titre":"A","resume":"un } piège \\" dans le texte"},{"titre":"B","faits_cles":["x"]},{"titre":"C","res';
  assertEquals(actusCompletes(debut).map((a) => a.titre), ["A", "B"]);
  assertEquals(actusCompletes('{"actus":[').length, 0);
  assertEquals(actusCompletes("pas de json").length, 0);
  // Un objet après la fin du tableau n'est pas une actu.
  assertEquals(actusCompletes('{"actus":[{"titre":"A"}],"autre":{"titre":"Z"}}').map((a) => a.titre), ["A"]);
});

Deno.test("lireFluxRecherche : reconstruit les blocs, signale recherches et texte", async () => {
  const requetes: string[] = [];
  const textes: string[] = [];
  let blocsVus = 0;
  const data = await lireFluxRecherche(flux([
    { type: "message_start", message: { usage: { input_tokens: 100, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "s1", name: "web_search", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"query":"actu de la' } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: ' semaine"}' } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "web_search_tool_result", tool_use_id: "s1", content: [{ type: "web_search_result", url: "https://lemonde.fr/a", page_age: "2 days ago" }] } },
    { type: "content_block_stop", index: 1 },
    { type: "content_block_start", index: 2, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: '{"actus":[{"titre":"A"}' } },
    { type: "content_block_delta", index: 2, delta: { type: "citations_delta", citation: { url: "https://lemonde.fr/a" } } },
    { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "]}" } },
    { type: "content_block_stop", index: 2 },
    { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 50 } },
    { type: "message_stop" },
  ]), { onRequete: (r) => requetes.push(r), onTexte: (t, blocs) => { textes.push(t); blocsVus = blocs.length; } });

  assertEquals(requetes, ["actu de la semaine"]);
  assertEquals(textes.at(-1), '{"actus":[{"titre":"A"}]}');
  assertEquals(blocsVus, 3); // le résultat de recherche est visible pendant l'écriture
  assertEquals(data.stop_reason, "end_turn");
  assertEquals(data.usage, { input_tokens: 100, output_tokens: 50 });
  assertEquals(data.content.map((b: { type: string }) => b.type), ["server_tool_use", "web_search_tool_result", "text"]);
  assertEquals(data.content[0].input, { query: "actu de la semaine" });
  assertEquals(data.content[2].citations.length, 1);
});

Deno.test("lireFluxRecherche : un flux coupé ou en erreur n'est jamais pris pour une réponse", async () => {
  await assertRejects(() => lireFluxRecherche(flux([{ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }])));
  await assertRejects(() => lireFluxRecherche(flux([{ type: "error", error: { type: "overloaded_error" } }])));
});

Deno.test("garderActusFraiches : écarte ce qui a plus de 3 semaines, garde le sans-date", () => {
  const maintenant = new Date("2026-11-28T10:00:00Z").getTime();
  const { gardees, retirees } = garderActusFraiches([
    { titre: "Cette semaine", date_publication: "2026-11-24" },
    { titre: "Janvier", date_publication: "2026-01-01" },
    { titre: "Septembre", date_publication: "2026-09-25" },
    { titre: "Sans date" },
    { titre: "Limite", date_publication: "2026-11-08" },
  ], 21, maintenant);
  assertEquals(gardees.map((a) => a.titre), ["Cette semaine", "Sans date", "Limite"]);
  assertEquals(retirees.length, 2);
});

Deno.test("actusDeSecours : remet les actus chaudes, sans évènement ni lien déjà vu", () => {
  const secours = actusDeSecours([
    { titre: "Polémique", resume: "R", source: "Le Monde", source_url: "https://lemonde.fr/a", date_publication: "2026-11-26" },
    { titre: "Webinaire", resume: "R", source_url: "https://x.fr/w" },
    { titre: "Déjà vue", resume: "R", source_url: "https://Vu.fr/a" },
  ], (t) => /webinaire/i.test(t), ["https://vu.fr/a"], (t) => t);
  assertEquals(secours.map((a) => a.titre), ["Polémique"]);
  assertEquals(secours[0].angle_mode, "reaction");
  assertEquals(secours[0].date_publication, "2026-11-26");
});

Deno.test("consigne par défaut : part du grand public, plus de micro-phénomènes ni de quota de pont fort", () => {
  const base = {
    brandingContext: "PROFIL", universe: { univers_emotionnel: ["confiance"], moments_de_vie_cible: ["lancement"], valeurs_combat: ["éthique"], themes_lifestyle: [] },
    nicheLabel: "communication", cibleRaw: "indépendantes", combatCause: "com' éthique", activityRaw: "communication", monthLabel: "novembre 2026",
    hotNews: [{ titre: "Sortie du film", resume: "R", source: "Télérama", source_url: "https://telerama.fr/f" }],
    intentVibeLabels: [], intentCustom: "", macroMode: false, scoopMode: false,
    pickedAxes: axesDuMoment("novembre 2026").slice(0, 3), nicheQueries: ["q1", "q2", "q3"], excludedUrls: ["https://deja.fr/a"],
  };
  const consigne = construireConsigne(base);
  for (const attendu of ["DONT TOUT LE MONDE PARLE", "TOUT LE MONDE EN PARLE", "CE QUI N'EST PAS UNE ACTU", "Idéalement 4 actus \"globale\"", "MATIÈRE PREMIÈRE", "novembre 2026", "https://deja.fr/a", "https://telerama.fr/f"]) {
    if (!consigne.includes(attendu)) throw new Error(`absent de la consigne : ${attendu}`);
  }
  for (const interdit of ["MICRO-PHÉNOMÈNES", "⌈N×2/3⌉", "France 2026\"", "q3"]) {
    if (consigne.includes(interdit)) throw new Error(`encore dans la consigne : ${interdit}`);
  }
  // Le mode « actu choc » garde sa consigne propre.
  const scoop = construireConsigne({ ...base, scoopMode: true });
  if (!scoop.includes("ACTU CHOC À REBONDIR") || scoop.includes("RECHERCHES SECTEUR")) throw new Error("consigne scoop altérée");
});
