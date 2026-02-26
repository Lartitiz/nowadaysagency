import { describe, it, expect } from "vitest";
import {
  parseToArray,
  parseToTags,
  safeParseJson,
  parseStringList,
} from "@/lib/branding-utils";

// ── parseToArray ──

describe("parseToArray", () => {
  it("1. null → []", () => expect(parseToArray(null)).toEqual([]));
  it("2. undefined → []", () => expect(parseToArray(undefined)).toEqual([]));
  it("3. string vide → []", () => expect(parseToArray("")).toEqual([]));

  it("4. Array de strings → filtre les vides", () => {
    expect(parseToArray(["a", "", "b"])).toEqual(["a", "b"]);
  });

  it("5. String avec \\n → split", () => {
    expect(parseToArray("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("6. String avec • → split", () => {
    expect(parseToArray("• item1 • item2")).toEqual(["item1", "item2"]);
  });

  it("7. String avec - → split", () => {
    expect(parseToArray("- foo\n- bar")).toEqual(["foo", "bar"]);
  });

  it('8. String JSON → parse ["a","b","c"]', () => {
    expect(parseToArray('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });

  it("9. String numérotée → supprime les numéros", () => {
    expect(parseToArray("1. Premier\n2. Deuxième")).toEqual(["Premier", "Deuxième"]);
  });

  it("10. Valeur numérique ou booléenne → []", () => {
    expect(parseToArray(42)).toEqual([]);
    expect(parseToArray(true)).toEqual([]);
  });

  it("11. Mix de séparateurs → split sur tous", () => {
    expect(parseToArray("a\n• b - c")).toEqual(["a", "b", "c"]);
  });
});

// ── parseToTags ──

describe("parseToTags", () => {
  it("null → []", () => expect(parseToTags(null)).toEqual([]));
  it("array → filtre vides", () => expect(parseToTags(["x", "", "y"])).toEqual(["x", "y"]));
  it("split sur virgule", () => expect(parseToTags("a, b, c")).toEqual(["a", "b", "c"]));
  it("split sur ;", () => expect(parseToTags("a; b; c")).toEqual(["a", "b", "c"]));
  it("split sur /", () => expect(parseToTags("a / b")).toEqual(["a", "b"]));
  it("nettoie quotes et bullets", () => expect(parseToTags('"hello", "world"')).toEqual(["hello", "world"]));
  it("JSON stringifié", () => expect(parseToTags('["x","y"]')).toEqual(["x", "y"]));
});

// ── safeParseJson ──

describe("safeParseJson", () => {
  it("null → null", () => expect(safeParseJson(null)).toBeNull());
  it("objet → retourne tel quel", () => {
    const obj = { a: 1 };
    expect(safeParseJson(obj)).toBe(obj);
  });
  it("string JSON valide → parse", () => {
    expect(safeParseJson('{"k":"v"}')).toEqual({ k: "v" });
  });
  it("string invalide → null", () => {
    expect(safeParseJson("not json")).toBeNull();
  });
});

// ── parseStringList ──

describe("parseStringList", () => {
  it("null → []", () => expect(parseStringList(null)).toEqual([]));
  it("split sur tirets longs – et —", () => {
    expect(parseStringList("a – b — c")).toEqual(["a", "b", "c"]);
  });
  it("array passthrough", () => {
    expect(parseStringList(["x", "y"])).toEqual(["x", "y"]);
  });
  it("JSON stringifié", () => {
    expect(parseStringList('["a"]')).toEqual(["a"]);
  });
});
