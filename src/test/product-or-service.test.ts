import { describe, expect, it, vi } from "vitest";
import { productOrServiceFromProfile, rememberProductOrService, sellsProducts } from "@/lib/product-or-service";

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

  it("retrouve le choix de la session si le profil ne peut pas encore le conserver", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    });
    try {
      rememberProductOrService("alice", "produits");
      expect(sellsProducts({ type_activite: "artisane", product_or_service: null }, "alice")).toBe(true);
      expect(sellsProducts({ type_activite: "artisane", product_or_service: null }, "bob")).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
});
