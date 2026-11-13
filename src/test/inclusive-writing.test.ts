import { describe, it, expect } from "vitest";
import { brandWantsInclusiveWriting } from "@/lib/inclusive-writing";

describe("brandWantsInclusiveWriting", () => {
  it("non quand la fiche est vide ou n'en parle pas", () => {
    expect(brandWantsInclusiveWriting(null)).toBe(false);
    expect(brandWantsInclusiveWriting({ tone_description: "Direct, chaleureux, concret" })).toBe(false);
  });
  it("oui quand le ton ou la voix demande l'écriture inclusive", () => {
    expect(brandWantsInclusiveWriting({ tone_do: "Écriture inclusive" })).toBe(true);
    expect(brandWantsInclusiveWriting({ voice_description: "j'utilise le point médian" })).toBe(true);
    expect(brandWantsInclusiveWriting({ tone_keywords: ["engagée", "inclusive"] })).toBe(true);
  });
  it("ne se trompe pas sur une valeur « Inclusivité » hors des champs de voix", () => {
    expect(brandWantsInclusiveWriting({ values: "Inclusivité" })).toBe(false);
  });
});

import { productOrServiceFromProfile, sellsProducts } from "@/lib/product-or-service";
import { PRODUCT_OPTIONS, onboardingLabel } from "@/lib/onboarding-constants";

describe("réponse « Des biens ou des réalisations »", () => {
  it("est gardée telle quelle et ne passe pas par le parcours photos produit", () => {
    expect(productOrServiceFromProfile({ product_or_service: "realisations" })).toBe("realisations");
    expect(sellsProducts({ product_or_service: "realisations" })).toBe(false);
    expect(onboardingLabel("realisations", PRODUCT_OPTIONS)).toBe("Des biens ou des réalisations");
  });
});
