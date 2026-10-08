// Garde anti-redite d'accroche (#915) : le quality_check et la télémétrie ne
// voyaient que l'APRÈS correction, donc hook_echoes vide quand la garde avait
// mordu. Le compteur « avant » (hookEchoesBefore / hook_echoes_before) est la
// seule preuve lisible par le bilan hebdo que la garde mord sur du vrai contenu.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { installFetchMock, setTestEnv } from "./test-edge-harness.ts";
import { hookEchoesBefore, runRedacGate, runTextRedacGate } from "./redac-gate.ts";
import { extractCarouselTexts } from "./correction-pass.ts";
import { logContentQuality } from "./content-quality.ts";

setTestEnv();

// Mêmes accroches réelles que hook-echoes_test.ts (semaine du 24/08).
const SUJET =
  "Je voudrais. Euh. J'ai fait une série sur ça m'énerve, donc j'ai mis ça m'énerve. Les pensions qui maltraitent les chevaux.";
const HOOK_1 = "En 2026, on utilise encore l'immersion sur les chevaux. Et franchement, ça m'énerve.";
const HOOK_2 =
  "En 2026, on désensibilise encore un cheval en secouant un drapeau devant lui jusqu'à ce qu'il arrête de bouger.";
const HOOK_3 =
  "On est en 2026 et il y a encore des pros qui secouent un drapeau devant un cheval jusqu'à ce qu'il arrête de bouger. Ça a un nom : l'immersion.";
const NEW_HOOK = "Ma jument a refusé le van ce matin, et je sais exactement pourquoi.";
const ECHO = { previousHooks: [HOOK_1, HOOK_2], subject: SUJET };
const BODY = "Le mécanisme est simple : on pousse le cheval dans sa zone rouge jusqu'à ce qu'il se fige.";

const anthropicText = (text: string) => ({
  status: 200,
  body: { content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } },
});

Deno.test("hookEchoesBefore : undefined sans accroche précédente, sinon le compte (même 0)", () => {
  assertEquals(hookEchoesBefore({ hookEchoes: [] }), undefined);
  assertEquals(hookEchoesBefore({ hookEchoes: [] }, { previousHooks: [], subject: SUJET }), undefined);
  assertEquals(hookEchoesBefore({ hookEchoes: [] }, ECHO), 0);
  assertEquals(hookEchoesBefore({ hookEchoes: ["a", "b"] }, ECHO), 2);
});

Deno.test("text-gate : la garde mord → avant = 2, après = 0", async () => {
  const original = `${HOOK_3}\n\n${BODY}`;
  const mock = installFetchMock({ anthropic: () => anthropicText(`${NEW_HOOK}\n\n${BODY}`) });
  try {
    const gate = await runTextRedacGate(original, { format: "linkedin", correction: {}, echo: ECHO });
    assertEquals(gate.content.startsWith(NEW_HOOK), true);
    assertEquals(gate.after.hookEchoes, []);
    assertEquals(gate.hookEchoesBefore, 2);
  } finally {
    mock.restore();
  }
});

Deno.test("text-gate : garde non armée → compteur absent", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicText(`${HOOK_3}\n\n${BODY}`) });
  try {
    const gate = await runTextRedacGate(`${HOOK_3}\n\n${BODY}`, { format: "linkedin", correction: {} });
    assertEquals(gate.hookEchoesBefore, undefined);
  } finally {
    mock.restore();
  }
});

// deno-lint-ignore no-explicit-any
const carousel = (title: string): any => ({
  slides: [
    { slide_number: 1, title, body: "" },
    { slide_number: 2, title: "Ce qui se passe", body: BODY },
    { slide_number: 3, title: "À toi", body: "Observe ton cheval avant de le pousser." },
  ],
  caption: { hook: "Immersion, vraiment ?", body: "Je trouve qu'on confond calme et sidération.", cta: "Tu l'as déjà vu ?", hashtags: ["cheval"] },
});

Deno.test("carrousel : quality_check porte hook_echoes_before quand la garde a mordu", async () => {
  const doc = carousel(HOOK_3);
  const block = extractCarouselTexts(doc);
  const mock = installFetchMock({ anthropic: () => anthropicText(block.replace(HOOK_3, NEW_HOOK)) });
  try {
    const gate = await runRedacGate(JSON.stringify(doc), {
      isLinkedIn: false,
      correction: { skipIfShorterThan: 0, model: "claude-haiku-4-5" },
      echo: ECHO,
    });
    const out = JSON.parse(gate.content);
    assertEquals(out.slides[0].title, NEW_HOOK);
    assertEquals(out.quality_check.hook_echoes, []);
    assertEquals(out.quality_check.hook_echoes_before, 2);
    assertEquals(gate.hookEchoesBefore, 2);
  } finally {
    mock.restore();
  }
});

Deno.test("carrousel : sans garde armée, hook_echoes_before = null et compteur absent", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicText("") });
  try {
    const gate = await runRedacGate(JSON.stringify(carousel(NEW_HOOK)), {
      isLinkedIn: false,
      correction: { enabled: false },
    });
    assertEquals(JSON.parse(gate.content).quality_check.hook_echoes_before, null);
    assertEquals(gate.hookEchoesBefore, undefined);
  } finally {
    mock.restore();
  }
});

// deno-lint-ignore no-explicit-any
async function capturedInsert(gate: any): Promise<any> {
  const mock = installFetchMock({ anthropic: () => anthropicText("") });
  const inner = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  let body: any = null;
  globalThis.fetch = (input: Request | URL | string, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rest/v1/content_quality_events") && init?.body) body = JSON.parse(String(init.body));
    return inner(input, init);
  };
  try {
    await logContentQuality("00000000-0000-4000-8000-0000000000aa", "linkedin", gate, "claude-test");
  } finally {
    globalThis.fetch = inner;
    mock.restore();
  }
  return Array.isArray(body) ? body[0] : body;
}

Deno.test("logContentQuality : range hook_echoes_before dans content_preview, seulement s'il est mesuré", async () => {
  const content = JSON.stringify({ subject: "chevaux", content: `${NEW_HOOK}\n\n${BODY}` });
  const bit = await capturedInsert({ score: 100, violations: 0, repassed: true, content, hookEchoesBefore: 2 });
  assertEquals(bit.content_preview.hook_echoes_before, 2);
  assertEquals(bit.content_preview.hook, "chevaux"); // aperçu inchangé à côté du compteur

  const unarmed = await capturedInsert({ score: 100, violations: 0, repassed: false, content });
  assertEquals("hook_echoes_before" in unarmed.content_preview, false);

  const noPreview = await capturedInsert({ score: 100, violations: 0, repassed: true, content: "illisible", hookEchoesBefore: 1 });
  assertEquals(noPreview.content_preview, { hook_echoes_before: 1 });
});
