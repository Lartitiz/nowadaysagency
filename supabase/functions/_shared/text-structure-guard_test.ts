// Garde de structure après correction (04/10/2026) + accroche dérivée du texte.
// Même famille de cause que la perte des « 1, 2, 3 » (PR #1191) : la passe de
// correction demande de fusionner les phrases courtes et de casser les
// énumérations ; une liste VOULUE ne doit jamais y passer.
//
// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/text-structure-guard_test.ts

// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { analyzeTextStructure, keepStructureOrRevert, structureLossReason } from "./text-structure-guard.ts";
import { applyCorrectionPass, type CorrectionFormat } from "./correction-pass.ts";
import { alignLinkedInHookFields, deriveLinkedInHook } from "./linkedin-hook.ts";

const WITH_LISTS = `J'ai mis trois ans à comprendre pourquoi mes posts ne prenaient pas.

Voici ce que j'ai changé, dans l'ordre :

1. J'écris d'abord pour une seule personne.
2. Je garde une seule idée par post.
3. Je relis à voix haute avant de publier.

Ce que j'ai arrêté :
– les listes de conseils génériques
– les accroches qui promettent tout`;

Deno.test("analyzeTextStructure : listes numérotées et à puces, paragraphes", () => {
  const s = analyzeTextStructure(WITH_LISTS);
  assertEquals(s.listLines, 5);
  assertEquals(s.orderedLines, 3);
  assertEquals(s.paragraphs, 4);
  // Lignes vides entre les items : c'est toujours une liste.
  assertEquals(analyzeTextStructure("Intro\n\n1. un\n\n2. deux").orderedLines, 2);
  // Une ligne isolée ne fait pas une liste ; « 2026. » n'est pas un numéro d'ordre.
  assertEquals(analyzeTextStructure("1. seul\nTexte").listLines, 0);
  assertEquals(analyzeTextStructure("2026. Une année\n2027. Une autre").listLines, 0);
  // Autres marqueurs : « 2) », « • », « → », pastilles emoji.
  assertEquals(analyzeTextStructure("1) a\n2) b").orderedLines, 2);
  assertEquals(analyzeTextStructure("• a\n• b\n→ c").listLines, 3);
  assertEquals(analyzeTextStructure("1️⃣ a\n2️⃣ b").orderedLines, 2);
});

Deno.test("structureLossReason : liste fusionnée en prose → perte détectée", () => {
  const fused = WITH_LISTS.replace(
    "1. J'écris d'abord pour une seule personne.\n2. Je garde une seule idée par post.\n3. Je relis à voix haute avant de publier.",
    "J'écris d'abord pour une seule personne, je garde une seule idée par post et je relis à voix haute avant de publier.",
  );
  assert(structureLossReason(WITH_LISTS, fused)?.includes("liste perdue"));
});

Deno.test("structureLossReason : numéros retirés mais lignes gardées → perte détectée", () => {
  const unnumbered = WITH_LISTS.replace("1. J'", "J'").replace("2. Je", "Je").replace("3. Je", "Je");
  assert(structureLossReason(WITH_LISTS, unnumbered) !== null);
});

Deno.test("structureLossReason : paragraphes fusionnés en un bloc → perte détectée", () => {
  const before = "Premier paragraphe assez long.\n\nDeuxième paragraphe.\n\nTroisième paragraphe.";
  assert(structureLossReason(before, "Premier paragraphe assez long. Deuxième paragraphe. Troisième paragraphe.") !== null);
});

Deno.test("structureLossReason : vraie correction qui garde la structure → acceptée", () => {
  const edited = WITH_LISTS.replace("ne prenaient pas", "ne trouvaient pas leur public").replace("2. Je garde une seule idée", "2) Je garde une idée");
  assertEquals(structureLossReason(WITH_LISTS, edited), null);
  // Pas de liste au départ : la garde ne s'en mêle pas.
  assertEquals(structureLossReason("Un texte.\n\nDeux paragraphes.", "Un texte corrigé.\n\nDeux paragraphes."), null);
  // Une correction qui AJOUTE de la structure n'est pas une perte.
  assertEquals(structureLossReason("Intro.\n\nSuite.", "Intro.\n\n1. a\n2. b"), null);
});

Deno.test("keepStructureOrRevert : rejette la correction entière et logue la raison", () => {
  const logs: string[] = [];
  const out = keepStructureOrRevert(WITH_LISTS, "Tout en un bloc.", "linkedin", (m) => logs.push(m));
  assertEquals(out.text, WITH_LISTS);
  assertEquals(out.reverted, true);
  assert(logs[0].startsWith("[structure-guard:linkedin] correction rejetée"));
});

/** Simule la passe de correction (Anthropic) avec une réponse donnée. */
async function withCorrection<T>(reply: string, fn: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalKey = Deno.env.get("ANTHROPIC_API_KEY");
  Deno.env.set("ANTHROPIC_API_KEY", "test-no-network");
  globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({
    content: [{ type: "text", text: reply }],
    usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn",
  }), { status: 200, headers: { "content-type": "application/json" } }))) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) Deno.env.delete("ANTHROPIC_API_KEY");
    else Deno.env.set("ANTHROPIC_API_KEY", originalKey);
  }
}

for (const format of ["linkedin", "newsletter", "instagram_caption"] as CorrectionFormat[]) {
  Deno.test(`applyCorrectionPass(${format}) : une correction qui casse la liste est rejetée, le texte d'avant reste intact`, async () => {
    const broken = WITH_LISTS
      .replace(/\n1\. /, "\n").replace(/\n2\. /, " ").replace(/\n3\. /, " ")
      .replace("\n– les listes de conseils génériques\n– les accroches qui promettent tout", " les conseils génériques et les accroches qui promettent tout.");
    const result = await withCorrection(broken, () => applyCorrectionPass(WITH_LISTS, format, { skipIfShorterThan: 1, logger: () => {} }));
    assertEquals(result, WITH_LISTS);
  });
}

Deno.test("applyCorrectionPass : une correction qui garde la liste est conservée", async () => {
  const good = WITH_LISTS.replace("ne prenaient pas", "ne trouvaient pas leur public");
  const result = await withCorrection(good, () => applyCorrectionPass(WITH_LISTS, "linkedin", { skipIfShorterThan: 1 }));
  assertEquals(result, good);
});

// ── Accroche dérivée du début exact de content ──────────────────────────────

Deno.test("deriveLinkedInHook : accroche = début exact du post, jamais une reformulation", () => {
  const content = "J'ai mis trois ans à comprendre.\nEt pourtant c'était simple.\n\n1. Un\n2. Deux";
  // Accroche exacte, coupée en fin de ligne : gardée (même sur 2 lignes).
  assertEquals(deriveLinkedInHook(content, "J'ai mis trois ans à comprendre."), "J'ai mis trois ans à comprendre.");
  assertEquals(deriveLinkedInHook(content, "J'ai mis trois ans à comprendre.\nEt pourtant c'était simple."), "J'ai mis trois ans à comprendre.\nEt pourtant c'était simple.");
  // Reformulée, ou coupée au milieu d'une phrase (« 210 premiers caractères ») → première ligne.
  assertEquals(deriveLinkedInHook(content, "Trois ans pour comprendre."), "J'ai mis trois ans à comprendre.");
  assertEquals(deriveLinkedInHook(content, "J'ai mis trois ans"), "J'ai mis trois ans à comprendre.");
  assertEquals(deriveLinkedInHook(content, undefined), "J'ai mis trois ans à comprendre.");
  // Première ligne trop longue pour LinkedIn → pas d'accroche séparée.
  assertEquals(deriveLinkedInHook("x".repeat(260) + "\nsuite", "autre"), "");
});

Deno.test("alignLinkedInHookFields : aligne accroche/hook, ne touche jamais content", () => {
  const content = "Première ligne.\n\nLe reste du post.";
  const parsed: any = { content, accroche: "Une accroche inventée", hook: "Une accroche inventée" };
  alignLinkedInHookFields(parsed, () => {});
  assertEquals(parsed.content, content);
  assertEquals(parsed.accroche, "Première ligne.");
  assertEquals(parsed.hook, "Première ligne.");
});
