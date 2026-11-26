// Reel : règles tirées de l'étude Instagram du 26/11/2026 (§ 10, reels en voix
// off). Le creux, la première phrase et les trames de récit sont des consignes
// conditionnées à la matière ; deux filets en code les accompagnent.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reelBrief, REEL_CREUX, REEL_PREMIERE_PHRASE, REEL_TRAMES } from "../_shared/format-briefs/reel.ts";
import { applyReelCreuxTip, buildHooksPrompt, normalizeHooksResponse, REEL_CREUX_TIP } from "./formats/reel.ts";

Deno.test("brief du reel : creux, première phrase et trames présents, jamais sans condition de matière", () => {
  const brief = reelBrief({ subject: "Mes prix", effectiveObjective: "confiance" });
  for (const bloc of [REEL_CREUX, REEL_PREMIERE_PHRASE, REEL_TRAMES]) assert(brief.includes(bloc));
  assert(/seulement si SA matière le contient/.test(REEL_CREUX));
  assert(/n'en invente pas/.test(REEL_CREUX));
  assert(/L'aveu ne s'invente jamais/.test(REEL_PREMIERE_PHRASE));
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
  assert(!/les 3 hooks sont un paradoxe ou un aveu/.test(libre));
  const voixOff = buildHooksPrompt({ ...base, faceCam: "non" }).systemPrompt;
  assert(/les 3 hooks sont un paradoxe ou un aveu/.test(voixOff));
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
