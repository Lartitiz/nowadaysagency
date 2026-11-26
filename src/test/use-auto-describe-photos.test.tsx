import { describe, it, expect } from "vitest";
import { needsAutoDescription } from "@/hooks/use-auto-describe-photos";

describe("légende à l'import : quelles photos décrire", () => {
  it("photo importée sans rien : oui", () => {
    expect(needsAutoDescription({ id: "a", base64: "x", name: "IMG_1234.jpg" })).toBe(true);
  });
  it("déjà décrite, contexte écrit, nom lisible, ambiance ou sans image : non", () => {
    expect(needsAutoDescription({ id: "a", base64: "x", libraryContext: "Description : façade" })).toBe(false);
    expect(needsAutoDescription({ id: "a", base64: "x", context: "la cuisine" })).toBe(false);
    expect(needsAutoDescription({ id: "a", base64: "x", name: "cuisine-apres.jpg" })).toBe(false);
    expect(needsAutoDescription({ id: "a", base64: "x", autoContext: "Une cuisine" })).toBe(false);
    expect(needsAutoDescription({ id: "a", base64: "x", stockAmbient: true })).toBe(false);
    expect(needsAutoDescription({ id: "a" })).toBe(false);
  });
});
