import { assertEquals, assertThrows } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { sanitizeSlop, extractValidatedToolInput, sanitizeDashes, sanitizeDashesDeep, sanitizeStyle, sanitizeStyleDeep, AnthropicError } from "./anthropic.ts";

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

// ── sanitizeDashes : exceptions structurelles (régression « 1, 2, 3 » perdus) ──
// La règle de style (incise « — » → virgule) reste ; seuls les tirets qui ne
// sont PAS des incises (puce, numéro d'ordre, plage) sont protégés.

Deno.test("sanitizeDashes : l'incise au milieu d'une phrase devient toujours une virgule", () => {
  assertEquals(sanitizeDashes("Ta collection — c'est quoi le déclic ?"), "Ta collection, c'est quoi le déclic ?");
  assertEquals(sanitizeDashes("un salon – une rencontre"), "un salon, une rencontre");
  assertEquals(sanitizeDashes("J'ai lancé en 2019 — 5 ans plus tard, tout a changé."), "J'ai lancé en 2019, 5 ans plus tard, tout a changé.");
  assertEquals(sanitizeDashes("Le pain — 3 ingrédients — suffit."), "Le pain, 3 ingrédients, suffit.");
});

Deno.test("sanitizeDashes (b) : le tiret après un numéro d'ordre en tête de ligne n'est pas changé en virgule", () => {
  assertEquals(sanitizeDashes("1 — Le pétrissage"), "1 – Le pétrissage");
  assertEquals(sanitizeDashes("2 – La pousse"), "2 – La pousse");
  assertEquals(sanitizeDashes("Étape 3 — Le façonnage"), "Étape 3 – Le façonnage");
  assertEquals(sanitizeDashes("1. — Le choix"), "1. – Le choix");
  assertEquals(sanitizeDashes("## 4 — La cuisson"), "## 4 – La cuisson");
  assertEquals(sanitizeDashes("**5 — Le repos**"), "**5 – Le repos**");
  assertEquals(
    sanitizeDashes("Mes conseils :\n1 — Le pétrissage\n2 — La pousse\n3 — La cuisson — sans stress"),
    "Mes conseils :\n1 – Le pétrissage\n2 – La pousse\n3 – La cuisson, sans stress",
  );
});

Deno.test("sanitizeDashes (a) : une puce en début de ligne reste une puce, jamais « , item »", () => {
  assertEquals(sanitizeDashes("– item"), "– item");
  assertEquals(sanitizeDashes("— item"), "– item"); // cadratin interdit → demi-cadratin, même rôle
  assertEquals(sanitizeDashes("Liste :\n– farine\n  — eau\n– sel"), "Liste :\n– farine\n  – eau\n– sel");
  assertEquals(sanitizeDashes("- tiret simple"), "- tiret simple");
});

Deno.test("sanitizeDashes (c) : une plage entre nombres/heures devient un trait d'union", () => {
  assertEquals(sanitizeDashes("Ouvert 9h–12h"), "Ouvert 9h-12h");
  assertEquals(sanitizeDashes("Ouvert 9h30–12h"), "Ouvert 9h30-12h");
  assertEquals(sanitizeDashes("Ouvert 9h – 12h"), "Ouvert 9h - 12h");
  assertEquals(sanitizeDashes("De 2020–2024"), "De 2020-2024");
  assertEquals(sanitizeDashes("2–3 fois par semaine"), "2-3 fois par semaine");
  assertEquals(sanitizeDashes("entre 10%–20%"), "entre 10%-20%");
});

Deno.test("sanitizeDashes : texte JSON sérialisé (stream tool) protégé aussi", () => {
  const raw = JSON.stringify({ slides: [{ title: "1 — Le pétrissage", body: "Ligne\n– puce\nHoraires 9h–12h — en semaine" }] });
  assertEquals(JSON.parse(sanitizeDashes(raw)), {
    slides: [{ title: "1 – Le pétrissage", body: "Ligne\n– puce\nHoraires 9h-12h, en semaine" }],
  });
});

Deno.test("sanitizeStyle/Deep : jamais de cadratin en sortie, numérotation intacte", () => {
  const out = sanitizeStyleDeep({ titles: ["1 — Le pétrissage", "Étape 2 — La pousse"], note: "— puce" });
  assertEquals(out, { titles: ["1 – Le pétrissage", "Étape 2 – La pousse"], note: "– puce" });
  assertEquals(JSON.stringify(out).includes("—"), false);
  assertEquals(sanitizeStyle("Une idée — une seule.").includes("—"), false);
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
