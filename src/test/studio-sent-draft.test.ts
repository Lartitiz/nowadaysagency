import { describe, expect, it } from "vitest";
import { isAlreadySentDraft } from "@/features/visual-studio/sent-draft";

const messages = [
  { role: "user", text: "Une cuisine lumineuse" },
  { role: "assistant", text: "Je prépare la scène." },
  { role: "user", text: "Mettre un vase sur le plan de travail" },
  { role: "assistant", text: "Je retouche ta photo de cuisine en ajoutant un vase." },
];

describe("Studio : brouillon déjà envoyé", () => {
  it("reconnaît le dernier message envoyé, espaces compris", () => {
    expect(isAlreadySentDraft("Mettre un vase sur le plan de travail", messages)).toBe(true);
    expect(isAlreadySentDraft("  Mettre un vase sur le plan de travail\n", messages)).toBe(true);
  });
  it("garde un texte nouveau ou un message plus ancien", () => {
    expect(isAlreadySentDraft("Mettre un vase bleu", messages)).toBe(false);
    expect(isAlreadySentDraft("Une cuisine lumineuse", messages)).toBe(false);
  });
  it("ne fait rien sans texte ni message", () => {
    expect(isAlreadySentDraft("", messages)).toBe(false);
    expect(isAlreadySentDraft("Mettre un vase", [])).toBe(false);
    expect(isAlreadySentDraft("Mettre un vase", undefined)).toBe(false);
  });
});
