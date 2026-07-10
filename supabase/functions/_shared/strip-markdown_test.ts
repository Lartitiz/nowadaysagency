import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { stripInlineMarkdown, stripMarkdownFromNewsletter } from "./strip-markdown.ts";

// ── stripInlineMarkdown : le markdown résiduel devient du texte brut ──

Deno.test("gras ** (cas de l'audit 09/07)", () => {
  assertEquals(
    stripInlineMarkdown("**Première chose : observe AVANT de choisir.**"),
    "Première chose : observe AVANT de choisir.",
  );
});

Deno.test("italique * et _ dans une phrase", () => {
  assertEquals(
    stripInlineMarkdown("Un aparté *entre nous* et un autre _plus discret_ ici."),
    "Un aparté entre nous et un autre plus discret ici.",
  );
});

Deno.test("gras+italique *** et __", () => {
  assertEquals(stripInlineMarkdown("***très fort*** et __appuyé__"), "très fort et appuyé");
});

Deno.test("titres markdown en début de ligne", () => {
  assertEquals(
    stripInlineMarkdown("## Le point clé\nLe reste # du texte garde son dièse."),
    "Le point clé\nLe reste # du texte garde son dièse.",
  );
});

Deno.test("lien [texte](url) → texte (url)", () => {
  assertEquals(
    stripInlineMarkdown("Va voir [mon site](https://example.com) pour la suite."),
    "Va voir mon site (https://example.com) pour la suite.",
  );
});

Deno.test("les snake_case et astérisques isolés survivent", () => {
  assertEquals(stripInlineMarkdown("la variable user_id reste intacte"), "la variable user_id reste intacte");
  assertEquals(stripInlineMarkdown("2 * 3 = 6, et une note*"), "2 * 3 = 6, et une note*");
});

Deno.test("multi-paragraphes : chaque paire se ferme sur sa ligne", () => {
  assertEquals(
    stripInlineMarkdown("**Titre gras**\n\nParagraphe avec *emphase* au milieu.\n\n- une liste\n- reste une liste"),
    "Titre gras\n\nParagraphe avec emphase au milieu.\n\n- une liste\n- reste une liste",
  );
});

// ── stripMarkdownFromNewsletter : tous les champs texte sont nettoyés ──

Deno.test("nettoie subject/content/cta, laisse le reste", () => {
  const parsed = {
    subject: "**J'ai failli tout annuler**",
    preview_text: "Et *pourquoi* je ne l'ai pas fait",
    content: "**Première chose : observe.**\n\nLa suite en clair.",
    accroche: "**Première chose : observe.**",
    cta_suggestion: "Réponds *franchement* à cet email",
    format: "newsletter",
    word_count: 42,
  };
  const out = stripMarkdownFromNewsletter(parsed);
  assertEquals(out.subject, "J'ai failli tout annuler");
  assertEquals(out.preview_text, "Et pourquoi je ne l'ai pas fait");
  assertEquals(out.content, "Première chose : observe.\n\nLa suite en clair.");
  assertEquals(out.accroche, "Première chose : observe.");
  assertEquals(out.cta_suggestion, "Réponds franchement à cet email");
  assertEquals(out.format, "newsletter");
  assertEquals(out.word_count, 42);
});
