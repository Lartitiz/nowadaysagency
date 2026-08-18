// Tests de runTextRedacGate — la garde anti-régression de la passe de
// correction texte (diagnostic 18/08 : Haiku peut INTRODUIRE les tics qu'il
// chasse, et tous les appelants gardaient sa version les yeux fermés).
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { installFetchMock, setTestEnv } from "./test-edge-harness.ts";
import { runTextRedacGate } from "./redac-gate.ts";

setTestEnv();

// Un paragraphe neutre pour dépasser le seuil skipIfShorterThan (200 car.)
// sans déclencher aucune famille mesurée.
const FILLER =
  "J'ai passé la matinée à peser mes huiles une par une, à noter chaque température dans mon carnet, " +
  "puis à couler la pâte dans les moules en bois que mon père m'a fabriqués l'hiver dernier. " +
  "Le séchage prendra plusieurs semaines et je vais surveiller chaque bac.";

const REVERSAL_1 = "Ce n'est pas un choix esthétique. C'est une stratégie de survie.";
const REVERSAL_2 = "Ce n'est pas du marketing. C'est une conviction profonde.";
const REVERSAL_3 = "Ce n'est pas un caprice. C'est le cœur du métier.";

const anthropicText = (text: string) => ({
  status: 200,
  body: {
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 100 },
  },
});

Deno.test("texte propre + correction qui INTRODUIT 2 retournements -> original conservé, rejeté", async () => {
  const original = FILLER;
  const corrupted = `${REVERSAL_1} ${REVERSAL_2} ${FILLER}`;
  const mock = installFetchMock({ anthropic: () => anthropicText(corrupted) });
  try {
    const gate = await runTextRedacGate(original, {
      format: "linkedin",
      correction: { model: "claude-haiku-4-5" },
    });
    assertEquals(gate.content, original);
    assertEquals(gate.reverted, true);
    assertEquals(gate.repassed, false);
    assertEquals(gate.after.reversals.length, 0);
    // Original propre -> pas de 2e passe tentée après le rejet.
    assertEquals(mock.anthropicCallCount, 1);
  } finally {
    mock.restore();
  }
});

Deno.test("2 retournements corrigés en 0 -> correction gardée, une seule passe", async () => {
  const original = `${REVERSAL_1} ${REVERSAL_2} ${FILLER}`;
  const cleaned = `C'est une stratégie de survie autant qu'une conviction profonde. ${FILLER}`;
  const mock = installFetchMock({ anthropic: () => anthropicText(cleaned) });
  try {
    const gate = await runTextRedacGate(original, {
      format: "linkedin",
      correction: { model: "claude-haiku-4-5" },
    });
    assertEquals(gate.content, cleaned);
    assertEquals(gate.repassed, true);
    assertEquals(gate.reverted, false);
    assertEquals(gate.violations, 0);
    // 0 violation restante -> pas de passe de rattrapage.
    assertEquals(mock.anthropicCallCount, 1);
  } finally {
    mock.restore();
  }
});

Deno.test("violations restantes après la 1re passe -> UNE passe de rattrapage, puis stop", async () => {
  const original = `${REVERSAL_1} ${REVERSAL_2} ${REVERSAL_3} ${FILLER}`;
  const partial = `${REVERSAL_1} ${REVERSAL_2} ${FILLER}`; // encore 2 -> violations 1
  const cleaned = `${REVERSAL_1} ${FILLER}`; // 1 retournement toléré -> violations 0
  let call = 0;
  const mock = installFetchMock({
    anthropic: () => anthropicText(++call === 1 ? partial : cleaned),
  });
  try {
    const gate = await runTextRedacGate(original, {
      format: "linkedin",
      correction: { model: "claude-haiku-4-5" },
    });
    assertEquals(mock.anthropicCallCount, 2);
    assertEquals(gate.content, cleaned);
    assertEquals(gate.repassed, true);
    assertEquals(gate.after.reversals.length, 1);
    assertEquals(gate.violations, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("rattrapage qui aggrave -> on garde la meilleure version intermédiaire", async () => {
  const original = `${REVERSAL_1} ${REVERSAL_2} ${REVERSAL_3} ${FILLER}`;
  const partial = `${REVERSAL_1} ${REVERSAL_2} ${FILLER}`; // 3 -> 2 : gardée
  const worse = `${REVERSAL_1} ${REVERSAL_2} ${REVERSAL_3} ${REVERSAL_1} ${FILLER}`;
  let call = 0;
  const mock = installFetchMock({
    anthropic: () => anthropicText(++call === 1 ? partial : worse),
  });
  try {
    const gate = await runTextRedacGate(original, {
      format: "linkedin",
      correction: { model: "claude-haiku-4-5" },
    });
    assertEquals(gate.content, partial);
    assertEquals(gate.repassed, true);
    assertEquals(gate.reverted, true);
    assertEquals(gate.after.reversals.length, 2);
  } finally {
    mock.restore();
  }
});

Deno.test("API en erreur -> texte original rendu tel quel, rien de cassé", async () => {
  const original = `${REVERSAL_1} ${REVERSAL_2} ${FILLER}`;
  const mock = installFetchMock({
    anthropic: () => ({ status: 500, body: { error: { message: "down" } } }),
  });
  try {
    const gate = await runTextRedacGate(original, {
      format: "linkedin",
      correction: { model: "claude-haiku-4-5" },
    });
    assertEquals(gate.content, original);
    assertEquals(gate.repassed, false);
  } finally {
    mock.restore();
  }
});

Deno.test("texte sous le seuil de correction -> aucun appel IA, contenu intact", async () => {
  const original = "Texte court sans tic."; // < 200 car. : applyCorrectionPass skip
  const mock = installFetchMock({ anthropic: () => anthropicText("n'importe quoi") });
  try {
    const gate = await runTextRedacGate(original, {
      format: "linkedin",
      correction: { model: "claude-haiku-4-5" },
    });
    assertEquals(gate.content, original);
    assertEquals(mock.anthropicCallCount, 0);
  } finally {
    mock.restore();
  }
});
