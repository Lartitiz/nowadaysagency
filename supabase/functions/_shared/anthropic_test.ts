import { assertEquals, assertThrows } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { sanitizeSlop, extractValidatedToolInput, sanitizeDashesDeep, AnthropicError } from "./anthropic.ts";

// ── sanitizeDashesDeep : la règle « jamais de tiret cadratin » traverse le JSON ──

Deno.test("sanitizeDashesDeep nettoie les strings imbriquées (objets + tableaux)", () => {
  const input = {
    questions: [
      { question: "Ta collection — c'est quoi le déclic ?", placeholder: "Ex : un salon – une rencontre" },
    ],
    count: 3,
    nested: { note: "rien à nettoyer" },
  };
  assertEquals(sanitizeDashesDeep(input), {
    questions: [
      { question: "Ta collection, c'est quoi le déclic ?", placeholder: "Ex : un salon, une rencontre" },
    ],
    count: 3,
    nested: { note: "rien à nettoyer" },
  });
});

Deno.test("sanitizeDashesDeep laisse intacts nombres, booléens et null", () => {
  assertEquals(sanitizeDashesDeep({ a: 1, b: true, c: null }), { a: 1, b: true, c: null });
});

// ── extractValidatedToolInput : sortie structurée = JSON valide par construction ──

const toolUseResponse = (input: unknown, stop = "tool_use") => ({
  stop_reason: stop,
  content: [{ type: "tool_use", name: "poser_questions", input }],
});

Deno.test("extrait l'input du tool et le re-sérialise en JSON valide", () => {
  const raw = extractValidatedToolInput(
    toolUseResponse({ questions: [{ question: "Q1 ?", placeholder: "ex" }] }),
    "poser_questions",
  );
  assertEquals(JSON.parse(raw), { questions: [{ question: "Q1 ?", placeholder: "ex" }] });
});

Deno.test("le JSON re-sérialisé survit aux guillemets et sauts de ligne (cause du bug 05/07)", () => {
  // En sortie texte, ce contenu cassait JSON.parse (guillemets non échappés /
  // \n bruts) → 502 « réponse IA illisible ». En sortie structurée, l'API a déjà
  // parsé : la re-sérialisation échappe tout correctement.
  const raw = extractValidatedToolInput(
    toolUseResponse({ questions: [{ question: 'Tu dis "non" comment ?\nEt après ?', placeholder: "" }] }),
    "poser_questions",
  );
  assertEquals(JSON.parse(raw).questions[0].question, 'Tu dis "non" comment ?\nEt après ?');
});

Deno.test("troncature max_tokens → erreur 422 réessayable (pas de JSON amputé)", () => {
  const err = assertThrows(
    () => extractValidatedToolInput(toolUseResponse({ questions: [] }, "max_tokens"), "poser_questions"),
    AnthropicError,
  ) as AnthropicError;
  assertEquals(err.status, 422);
});

Deno.test("pas de bloc tool_use (ou mauvais nom) → erreur 502 réponse vide", () => {
  const err = assertThrows(
    () => extractValidatedToolInput({ stop_reason: "end_turn", content: [{ type: "text", text: "blabla" }] }, "poser_questions"),
    AnthropicError,
  ) as AnthropicError;
  assertEquals(err.status, 502);
  const err2 = assertThrows(
    () => extractValidatedToolInput(toolUseResponse({ q: 1 }), "autre_tool"),
    AnthropicError,
  ) as AnthropicError;
  assertEquals(err2.status, 502);
});

Deno.test("les tirets cadratins sont nettoyés dans l'input structuré", () => {
  const raw = extractValidatedToolInput(
    toolUseResponse({ questions: [{ question: "Ton process — étape par étape ?", placeholder: "" }] }),
    "poser_questions",
  );
  assertEquals(JSON.parse(raw).questions[0].question, "Ton process, étape par étape ?");
});

// ── sanitizeSlop : filet déterministe anti-tics (audit rédactionnel 10/07) ──

Deno.test("sanitizeSlop retire « Spoiler : » en tête de phrase et capitalise", () => {
  assertEquals(
    sanitizeSlop("Là je compte ce qui reste.\nSpoiler : pas grand-chose."),
    "Là je compte ce qui reste.\nPas grand-chose.",
  );
});

Deno.test("sanitizeSlop retire les phrases-signature isolées", () => {
  assertEquals(sanitizeSlop("Il ouvre le four.\nEt là, tout a basculé.\nLa suite."), "Il ouvre le four.\nLa suite.");
  assertEquals(sanitizeSlop("Un plan simple.\nSauf que.\nRien ne marche."), "Un plan simple.\nRien ne marche.");
  assertEquals(sanitizeSlop("Et devinez quoi. Ça a marché."), "Ça a marché.");
});

Deno.test("sanitizeSlop retire les chevilles en ouverture de paragraphe", () => {
  assertEquals(
    sanitizeSlop("Le truc c'est que personne ne compare ce qui est comparable."),
    "Personne ne compare ce qui est comparable.",
  );
  assertEquals(
    sanitizeSlop("Intro.\n\nEn vrai, les premiers mois c'est de la frustration."),
    "Intro.\n\nLes premiers mois c'est de la frustration.",
  );
  assertEquals(
    sanitizeSlop("Le truc c'est qu'on choisit avec les yeux."),
    "On choisit avec les yeux.",
  );
});

Deno.test("sanitizeSlop laisse les chevilles en MILIEU de phrase/paragraphe", () => {
  const s = "Et en vrai, j'ai mis du temps à comprendre. Parce que le truc c'est que ça se joue au four.";
  assertEquals(sanitizeSlop(s), s);
});

Deno.test("sanitizeSlop fonctionne sur du JSON sérialisé (sauts de ligne échappés)", () => {
  const blob = '{"content":"Intro.\\n\\nLe truc c\'est que personne ne le dit.\\nSpoiler : rien."}';
  const out = sanitizeSlop(blob);
  assertEquals(JSON.parse(out).content, "Intro.\n\nPersonne ne le dit.\nRien.");
});
