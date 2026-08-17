import { describe, it, expect } from "vitest";
import { parseAiJson, tryParseAiJson, AiParseError } from "@/lib/parse-ai-json";

describe("parseAiJson", () => {
  it("parse un JSON direct", () => {
    expect(parseAiJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("retire les fences markdown ```json", () => {
    expect(parseAiJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("extrait un objet noyé dans du texte", () => {
    expect(parseAiJson('Voici la réponse : {"a":1} voilà')).toEqual({ a: 1 });
  });

  it("parse un tableau", () => {
    expect(parseAiJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("répare les virgules traînantes", () => {
    expect(parseAiJson('{"a":1,}')).toEqual({ a: 1 });
  });

  it("retourne tel quel un objet déjà parsé", () => {
    const o = { a: 1 };
    expect(parseAiJson(o)).toBe(o);
  });

  it("lève AiParseError sur une réponse illisible", () => {
    expect(() => parseAiJson("pas du json du tout", "test")).toThrow(AiParseError);
  });

  it("ne retombe PAS sur un tableau imbriqué quand l'objet racine est tronqué (max_tokens)", () => {
    // Réponse coupée en plein milieu du champ "weaknesses" : le tableau
    // "strengths" est valide isolément, mais l'objet englobant ne l'est pas.
    // Avant le fix, le regex de fallback array matchait ce sous-tableau et le
    // renvoyait comme si c'était la réponse entière — un faux succès silencieux.
    const truncated = '{"summary":"Bonne analyse","strengths":[{"title":"Clair","detail":"tres clair"}],"weaknesses":[{"title":"Vague"';
    expect(() => parseAiJson(truncated, "test")).toThrow(AiParseError);
    expect(tryParseAiJson(truncated)).toBeNull();
  });

  it("répare des clés/valeurs entre guillemets simples", () => {
    expect(parseAiJson("{'a': 'b', 'c': 2}")).toEqual({ a: "b", c: 2 });
  });

  it("répare un tableau de chaînes entre guillemets simples", () => {
    expect(parseAiJson("['idee1', 'idee2']")).toEqual(["idee1", "idee2"]);
  });

  it("préserve les apostrophes françaises dans une valeur déjà entre guillemets doubles (virgule traînante à réparer)", () => {
    // Avant le fix, le dernier recours faisait un replace(/'/g, '"') aveugle
    // qui cassait ce JSON pourtant valide à une virgule traînante près.
    const withTrailingComma = '{"phrase": "l\'IA c\'est top, j\'ai adoré",}';
    expect(parseAiJson(withTrailingComma)).toEqual({ phrase: "l'IA c'est top, j'ai adoré" });
  });

  it("échoue proprement (sans corrompre) sur une apostrophe brute dans une valeur entre guillemets simples", () => {
    // Cas réellement ambigu : impossible de savoir où la chaîne single-quote
    // est censée se terminer. On préfère échouer plutôt que de produire un
    // contenu tronqué/corrompu en silence.
    const ambiguous = "{'phrase': 'c'est top'}";
    expect(() => parseAiJson(ambiguous, "test")).toThrow(AiParseError);
  });
});

describe("tryParseAiJson", () => {
  it("retourne null sur échec (sans lever)", () => {
    expect(tryParseAiJson("aucun json ici")).toBeNull();
  });

  it("parse normalement en cas de succès", () => {
    expect(tryParseAiJson('{"a":1}')).toEqual({ a: 1 });
  });
});
