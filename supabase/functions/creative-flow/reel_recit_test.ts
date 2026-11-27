// Reel : règles tirées de l'étude Instagram du 26/11/2026 (§ 10, reels en voix
// off). Le creux, la première phrase et les trames de récit sont des consignes
// conditionnées à la matière ; deux filets en code les accompagnent.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reelBrief, REEL_CREUX, REEL_PREMIERE_PHRASE, REEL_RECIT_PARLE, REEL_TRAMES } from "../_shared/format-briefs/reel.ts";
import { applyReelCreuxTip, buildHooksPrompt, HOOKS_TOOL, normalizeHooksResponse, REEL_CREUX_TIP } from "./formats/reel.ts";

Deno.test("brief du reel : creux, première phrase et trames présents, jamais sans condition de matière", () => {
  const brief = reelBrief({ subject: "Mes prix", effectiveObjective: "confiance" });
  for (const bloc of [REEL_CREUX, REEL_PREMIERE_PHRASE, REEL_TRAMES]) assert(brief.includes(bloc));
  assert(/seulement si SA matière le contient/.test(REEL_CREUX));
  assert(/n'en invente pas/.test(REEL_CREUX));
  assert(/Rien de vécu ne s'invente/.test(REEL_PREMIERE_PHRASE));
  assert(/N'IMPORTE QUI COMPREND L'ENJEU/.test(REEL_PREMIERE_PHRASE));
  assert(/ELLE DIT LE FAIT ET GARDE LE POURQUOI/.test(REEL_PREMIERE_PHRASE));
  assert(brief.includes(REEL_RECIT_PARLE));
  assert(/sans récit vécu dans sa matière, tu n'en prends aucune/.test(REEL_TRAMES));
  // Le portrait à la troisième personne ne sort jamais tout seul.
  assert(/Uniquement quand l'accroche choisie l'ouvre déjà ainsi/.test(REEL_TRAMES));
  // La durée maximale du montage ne bouge pas.
  assert(/55 secondes au plus/.test(REEL_TRAMES));
});

Deno.test("accroches : la règle de première phrase est dans la consigne, plus stricte en voix off", () => {
  const base = { COMMON_PREFIX: "", excludeHooksRaw: null, context: "Mes prix" };
  const libre = buildHooksPrompt({ ...base, faceCam: "oui" }).systemPrompt;
  assert(libre.includes(REEL_PREMIERE_PHRASE));
  assert(!/les 3 hooks sont un paradoxe, un aveu ou sa scène/.test(libre));
  const voixOff = buildHooksPrompt({ ...base, faceCam: "non" }).systemPrompt;
  assert(/les 3 hooks sont un paradoxe, un aveu ou sa scène/.test(voixOff));
});

Deno.test("accroches : celle qui se présente est écartée, sauf s'il ne reste qu'elle", () => {
  const params = { body: {}, rawContent: "", corsHeaders: {} };
  const parsed: any = { hooks: [
    { text: "Bonjour, je m'appelle Léa et je fais des savons." },
    { text: "J'ai fabriqué 300 savons. J'en ai vendu 11." },
  ] };
  assertEquals(normalizeHooksResponse(parsed, params), null);
  assertEquals(parsed.hooks.map((h: any) => h.text), ["J'ai fabriqué 300 savons. J'en ai vendu 11."]);
  const seule: any = { hooks: [{ text: "Bonjour, je m'appelle Léa." }] };
  assertEquals(normalizeHooksResponse(seule, params), null);
  assertEquals(seule.hooks.length, 1);
});

Deno.test("conseil sous le script : le conseil générique devient la question du creux", () => {
  const generique: any = { personal_tip: "💡 Ajoute une anecdote perso pour que ça sonne vraiment toi. L'IA structure, toi tu incarnes." };
  assert(applyReelCreuxTip(generique));
  assertEquals(generique.personal_tip, REEL_CREUX_TIP);
  // Un conseil écrit pour ce script, ou pas de conseil : on ne touche à rien.
  const precis: any = { personal_tip: "Qu'est-ce qui a coincé avant que tes clientes disent oui ?" };
  assert(!applyReelCreuxTip(precis));
  assertEquals(precis.personal_tip, "Qu'est-ce qui a coincé avant que tes clientes disent oui ?");
  assert(!applyReelCreuxTip({ personal_tip: null }));
});

Deno.test("accroches : celle en bouts de phrases est écartée (Loom du 26/11), sauf s'il ne reste qu'elles", () => {
  const params = { body: {}, rawContent: "", corsHeaders: {} };
  const parsed: any = { hooks: [
    { text: "Rien sur les plans. Une cheminée condamnée derrière la cloison. Deux semaines de chantier décalées." },
    { text: "Quand on a ouvert le mur, on est tombés sur une cheminée qui n'était sur aucun plan." },
  ] };
  assertEquals(normalizeHooksResponse(parsed, params), null);
  assertEquals(parsed.hooks.map((h: any) => h.text), ["Quand on a ouvert le mur, on est tombés sur une cheminée qui n'était sur aucun plan."]);
  const seules: any = { hooks: [{ text: "Quatre semaines. Sans exception." }] };
  assertEquals(normalizeHooksResponse(seules, params), null);
  assertEquals(seules.hooks.length, 1);
});

import { enforceReelSpokenSentences } from "./formats/reel.ts";

const scriptHache = () => ({ script: [
  { section: "hook", texte_parle: "Au démoulage, j'ai vu que mes quarante savons avaient des poches de liquide." },
  { section: "body", texte_parle: "Tout était calé : recette testée, étiquettes imprimées, date de livraison fixée." },
] });

Deno.test("remise en phrases : gardée quand le script est moins haché, l'accroche choisie jamais signalée", async () => {
  const parsed: any = scriptHache();
  let consigne = "";
  await enforceReelSpokenSentences(parsed, { body: {}, fullContext: "", hookLocked: true, pass: async (p: any, o: any) => {
    consigne = o.extraInstructions;
    return { ...p, script: [p.script[0], { ...p.script[1], texte_parle: "Tout était calé, j'avais testé la recette, les étiquettes étaient imprimées." }] };
  } });
  assert(consigne.includes("[SECTION 2 - PARLE]"));
  assert(!consigne.includes("- [SECTION 1 - PARLE]"));
  assertEquals(parsed.script[1].texte_parle, "Tout était calé, j'avais testé la recette, les étiquettes étaient imprimées.");
});

Deno.test("remise en phrases : refusée si rien ne change, sans appel si rien n'est haché", async () => {
  const parsed: any = scriptHache();
  await enforceReelSpokenSentences(parsed, { body: {}, fullContext: "", hookLocked: false, pass: async (p: any) => structuredClone(p) });
  assertEquals(parsed.script[1].texte_parle, scriptHache().script[1].texte_parle);
  let appels = 0;
  const propre: any = { script: [{ section: "hook", texte_parle: "J'ai jeté quarante savons la veille de les livrer." }] };
  await enforceReelSpokenSentences(propre, { body: {}, fullContext: "", hookLocked: false, pass: async (p: any) => { appels++; return p; } });
  assertEquals(appels, 0);
});

Deno.test("accroches : une vraie première phrase est gardée, les bouts de phrases qui la suivent tombent", () => {
  const params = { body: {}, rawContent: "", corsHeaders: {} };
  const parsed: any = { hooks: [
    { text: "J'ai jeté 40 savons la veille de les livrer. Tous. À la poubelle.", text_overlay: "J'ai jeté 40 savons" },
    { text: "Le miel a fait rater toute ma fournée. Tous. À la poubelle.", text_overlay: "À la poubelle" },
    { text: "J'ai jeté 40 savons la veille de les livrer. J'étais dégoûtée, je vous raconte." },
  ] };
  assertEquals(normalizeHooksResponse(parsed, params), null);
  assertEquals(parsed.hooks.map((h: any) => h.text), [
    "J'ai jeté 40 savons la veille de les livrer.",
    "J'ai jeté 40 savons la veille de les livrer. J'étais dégoûtée, je vous raconte.",
  ]);
});

Deno.test("accroches : l'enjeu dit en mots simples est demandé avant la phrase, et ne part pas à l'écran", () => {
  const req = (HOOKS_TOOL.input_schema.properties.hooks.items as any).required as string[];
  assert(req.indexOf("enjeu_pour_tous") >= 0 && req.indexOf("enjeu_pour_tous") < req.indexOf("text"));
  const parsed: any = { hooks: [{ text: "J'ai jeté quarante savons la veille de les livrer.", enjeu_pour_tous: "une commande perdue la veille" }] };
  assertEquals(normalizeHooksResponse(parsed, { body: {}, rawContent: "", corsHeaders: {} }), null);
  assertEquals("enjeu_pour_tous" in parsed.hooks[0], false);
});

import { reelHooksUsable } from "./formats/reel.ts";

Deno.test("accroches : une réponse sans accroche lisible se reconnaît (relance côté serveur)", () => {
  assert(reelHooksUsable(JSON.stringify({ hooks: [{ text: "J'ai jeté quarante savons la veille de les livrer." }] })));
  assert(reelHooksUsable(JSON.stringify({ hooks: ["J'ai jeté quarante savons."] })));
  assert(reelHooksUsable(JSON.stringify({ hooks: JSON.stringify([{ text: "Une accroche." }]) })));
  for (const vide of ["", "{}", JSON.stringify({ hooks: [] }), JSON.stringify({ hooks: [{ type: "fait_brut" }] }), JSON.stringify({ hooks: "pas du json" }), "Désolé, je ne peux pas."]) {
    assert(!reelHooksUsable(vide), vide);
  }
});
