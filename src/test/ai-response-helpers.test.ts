import { describe, it, expect } from "vitest";
import { parseAIResponse } from "@/lib/parse-ai-response";
import { parseAIResponseRaw } from "@/lib/branding-coaching-response";

// Les deux anciens helpers délèguent au lecteur partagé : on vérifie les cas
// qui échouaient avant (retour à la ligne brut, virgule traînante) et le
// contrat de levée d'erreur de chacun.

describe("parseAIResponse", () => {
  it("lit un objet entouré de fences ```json", () => {
    expect(parseAIResponse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("lit un retour à la ligne brut à l'intérieur d'une chaîne", () => {
    expect(parseAIResponse('{"caption":"ligne 1\nligne 2"}')).toEqual({ caption: "ligne 1\nligne 2" });
  });

  it("tolère une virgule traînante", () => {
    expect(parseAIResponse('{"slides":[1,2,],}')).toEqual({ slides: [1, 2] });
  });

  it("renvoie un tableau quand le texte commence par [", () => {
    expect(parseAIResponse('[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("garde son message d'erreur historique sur du texte illisible", () => {
    expect(() => parseAIResponse("pas du json")).toThrow("L'IA a renvoyé un format inattendu. Réessaie !");
  });

  it("lève aussi sur une chaîne vide", () => {
    expect(() => parseAIResponse("")).toThrow("L'IA a renvoyé un format inattendu. Réessaie !");
  });
});

describe("parseAIResponseRaw", () => {
  it("lit un objet entouré de fences ```json", () => {
    expect(parseAIResponseRaw('```json\n{"question":"Salut ?","is_complete":false}\n```')).toEqual({
      question: "Salut ?",
      is_complete: false,
    });
  });

  it("lit un retour à la ligne brut à l'intérieur d'une chaîne", () => {
    expect(parseAIResponseRaw('{"question":"Ligne 1\nLigne 2 ?","is_complete":false}').question).toBe("Ligne 1\nLigne 2 ?");
  });

  it("tolère une virgule traînante", () => {
    expect(parseAIResponseRaw('{"question":"Salut ?","is_complete":false,}')).toEqual({
      question: "Salut ?",
      is_complete: false,
    });
  });

  it("renvoie tel quel un objet déjà décodé", () => {
    const raw = { question: "Salut ?", is_complete: false };
    expect(parseAIResponseRaw(raw)).toBe(raw);
  });

  it("lève toujours sur du texte illisible", () => {
    expect(() => parseAIResponseRaw("pas du json")).toThrow();
  });
});
