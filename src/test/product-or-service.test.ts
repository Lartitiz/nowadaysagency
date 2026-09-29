import { describe, expect, it } from "vitest";
import { productOrServiceFromProfile, sellsProducts } from "@/lib/product-or-service";

describe("choix produits ou services du profil", () => {
  it("garde le secteur séparé du choix de contenu", () => {
    const profile = { type_activite: "artisane", product_or_service: "produits" };
    expect(productOrServiceFromProfile(profile)).toBe("produits");
    expect(sellsProducts(profile)).toBe(true);
  });

  it("envoie les services vers le contenu texte et les deux vers les photos", () => {
    expect(sellsProducts({ type_activite: "coach", product_or_service: "services" })).toBe(false);
    expect(sellsProducts({ type_activite: "artisane", product_or_service: "les_deux" })).toBe(true);
  });

  it("conserve la compatibilité des anciens profils", () => {
    expect(sellsProducts({ type_activite: "produits" })).toBe(true);
    expect(productOrServiceFromProfile({ type_activite: "artisane" })).toBeNull();
  });
});
