import { describe, it, expect } from "vitest";
import {
  parseAIResponseRaw,
  isAIResponseShapeInvalid,
  cleanTruncatedQuestion,
  normalizeQuestionType,
  clampCompletionPercentage,
  normalizeAIResponse,
  buildCharterAIResponse,
  getInvokeErrorMessage,
  type AIResponse,
} from "@/lib/branding-coaching-response";
import type { InvokeError } from "@/lib/invoke-with-timeout";

describe("parseAIResponseRaw", () => {
  it("parse un objet déjà décodé tel quel", () => {
    const raw = { question: "Salut ?", is_complete: false };
    expect(parseAIResponseRaw(raw)).toBe(raw);
  });

  it("parse une chaîne JSON brute", () => {
    const raw = '{"question":"Salut ?","is_complete":false}';
    expect(parseAIResponseRaw(raw)).toEqual({ question: "Salut ?", is_complete: false });
  });

  it("retire les fences ```json avant de parser", () => {
    const raw = '```json\n{"question":"Salut ?","is_complete":false}\n```';
    expect(parseAIResponseRaw(raw)).toEqual({ question: "Salut ?", is_complete: false });
  });

  it("lève une erreur sur du JSON invalide (comportement attendu par l'appelant)", () => {
    expect(() => parseAIResponseRaw("pas du json")).toThrow();
  });
});

describe("isAIResponseShapeInvalid", () => {
  it("rejette null/undefined", () => {
    expect(isAIResponseShapeInvalid(null)).toBe(true);
    expect(isAIResponseShapeInvalid(undefined)).toBe(true);
  });

  it("rejette une réponse sans question ni is_complete", () => {
    expect(isAIResponseShapeInvalid({ is_complete: false } as AIResponse)).toBe(true);
  });

  it("accepte une réponse avec une question", () => {
    expect(isAIResponseShapeInvalid({ question: "Salut ?", is_complete: false } as AIResponse)).toBe(false);
  });

  it("accepte une réponse marquée complète sans question", () => {
    expect(isAIResponseShapeInvalid({ question: "", is_complete: true } as AIResponse)).toBe(false);
  });
});

describe("cleanTruncatedQuestion", () => {
  it("laisse intacte une question courte se terminant par '...'", () => {
    const q = "Court...";
    expect(cleanTruncatedQuestion(q)).toBe(q);
  });

  // La question tronquée se termine TOUJOURS par "...", donc lastIndexOf(".")
  // trouve toujours le dernier des 3 points littéraux → lastCleanEnd pointe
  // toujours sur le tout dernier caractère → le slice(0, lastCleanEnd + 1) est
  // systématiquement un no-op (renvoie la chaîne entière). Comportement
  // préexistant conservé tel quel par ce refactor : le "nettoyage" ne coupe
  // jamais rien en pratique, il se contente de logger un warn.
  it("ne raccourcit jamais une question longue qui semble tronquée (les points de '...' dominent toujours lastIndexOf)", () => {
    const q = "b".repeat(120) + " Est-ce clair ? " + "c".repeat(20) + "...";
    expect(cleanTruncatedQuestion(q)).toBe(q);
  });

  it("ne raccourcit pas non plus en l'absence de toute autre ponctuation", () => {
    const q = "a".repeat(160) + "...";
    expect(cleanTruncatedQuestion(q)).toBe(q);
  });
});

describe("normalizeQuestionType", () => {
  it("garde les types valides", () => {
    expect(normalizeQuestionType("select")).toBe("select");
    expect(normalizeQuestionType("multi_select")).toBe("multi_select");
  });

  it("retombe sur textarea pour un type invalide", () => {
    expect(normalizeQuestionType("bogus" as AIResponse["question_type"])).toBe("textarea");
  });
});

describe("clampCompletionPercentage", () => {
  it("ramène les valeurs hors bornes à 0 ou 100", () => {
    expect(clampCompletionPercentage(-5)).toBe(0);
    expect(clampCompletionPercentage(150)).toBe(100);
  });

  it("ramène une chaîne à 0 (typeof !== \"number\")", () => {
    expect(clampCompletionPercentage("50" as unknown as number)).toBe(0);
  });

  // NaN passe `typeof === "number"` et échoue silencieusement les deux
  // comparaisons (NaN < 0 et NaN > 100 sont toutes deux false) : elle
  // traverse donc les deux gardes et ressort telle quelle. Comportement
  // préexistant conservé tel quel par ce refactor.
  it("laisse NaN traverser sans le ramener à 0 (comportement préexistant)", () => {
    expect(clampCompletionPercentage(NaN)).toBeNaN();
  });

  it("laisse une valeur valide intacte", () => {
    expect(clampCompletionPercentage(42)).toBe(42);
  });
});

describe("normalizeAIResponse", () => {
  it("applique la normalisation de type et de pourcentage", () => {
    const parsed = { question: "Salut ?", question_type: "bogus", is_complete: false, completion_percentage: 250 } as unknown as AIResponse;
    const normalized = normalizeAIResponse(parsed);
    expect(normalized.question_type).toBe("textarea");
    expect(normalized.completion_percentage).toBe(100);
  });

  it("ne nettoie pas la question si is_complete est true", () => {
    const q = "a".repeat(160) + "...";
    const parsed = { question: q, question_type: "textarea", is_complete: true, completion_percentage: 100 } as AIResponse;
    expect(normalizeAIResponse(parsed).question).toBe(q);
  });
});

describe("buildCharterAIResponse", () => {
  it("mappe le sujet couvert et construit la question suivante quand ce n'est pas la dernière étape", () => {
    const parsed = { feedback: "Beau choix !", suggestion: "On garde ça en tête.", extracted: { mood_keywords: "cosy" } };
    const response = buildCharterAIResponse(parsed, 1);
    expect(response.covered_topic).toBe("mood_place");
    expect(response.is_complete).toBe(false);
    expect(response.completion_percentage).toBe(Math.round((1 / 6) * 100));
    expect(response.question).toContain("Beau choix !");
    expect(response.question).toContain("Quelles couleurs te font vibrer");
    expect(response.remaining_topics).toEqual(["colors", "visual_style", "typography", "logo", "visual_donts"]);
  });

  it("marque la complétion à la 6e étape avec un final_summary", () => {
    const parsed = { feedback: "Parfait.", suggestion: "", ai_generated_brief: "Ta charte en résumé" };
    const response = buildCharterAIResponse(parsed, 6);
    expect(response.is_complete).toBe(true);
    expect(response.completion_percentage).toBe(100);
    expect(response.remaining_topics).toEqual([]);
    expect(response.final_summary).toContain("Ta charte en résumé");
    expect(response.question).not.toContain("---");
  });
});

describe("getInvokeErrorMessage", () => {
  it("choisit le message rate-limit en priorité", () => {
    const err = { isRateLimit: true } as InvokeError;
    expect(getInvokeErrorMessage(err)).toMatch(/petit instant/);
  });

  it("choisit le message timeout", () => {
    const err = { isTimeout: true } as InvokeError;
    expect(getInvokeErrorMessage(err)).toMatch(/prend plus de temps/);
  });

  it("retombe sur le message générique par défaut", () => {
    const err = {} as InvokeError;
    expect(getInvokeErrorMessage(err)).toMatch(/blanc/);
  });
});
