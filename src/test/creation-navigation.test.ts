import { describe, it, expect } from "vitest";
import { consumeFreshStart, creationReturnPath } from "@/lib/creation-navigation";
import { newsletterCopyText } from "@/lib/newsletter-copy";

describe("creation destinations", () => {
  it("keeps the channel, idea and photo mode when consuming a fresh start", () => {
    const params = new URLSearchParams("canal=linkedin&new=1&sujet=Ma%20pièce&format=carousel&carouselSubMode=photo");
    const clean = consumeFreshStart(params);
    expect(clean.get("canal")).toBe("linkedin");
    expect(clean.get("sujet")).toBe("Ma pièce");
    expect(clean.get("carouselSubMode")).toBe("photo");
    expect(clean.has("new")).toBe(false);
    expect(params.has("new")).toBe(true);
  });
  it("returns to the requested newsletter after brand review", () => {
    expect(creationReturnPath("/creer?canal=newsletter&sujet=Collection&new=1")).toBe("/creer?canal=newsletter&sujet=Collection&new=1");
  });
  it.each(["https://example.com/creer", "//example.com/creer", "/creer/../admin", "/creer\\evil", "/branding", "javascript:alert(1)"])("rejects unsafe return %s", value => {
    expect(creationReturnPath(value)).toBeNull();
  });
});

describe("newsletter copy", () => {
  it("copies subject, preview and edited body, without AI suggestions", () => {
    const text = newsletterCopyText({ subject: "**Ma collection**", preview_text: "À découvrir", body: "Ancien texte", edited_text: "Mon texte corrigé", personal_tip: "Ajoute une anecdote", cta_suggestion: "Ajoute un lien" });
    expect(text).toBe("Objet : Ma collection\n\nTexte d’aperçu : À découvrir\n\nMon texte corrigé");
  });
});
