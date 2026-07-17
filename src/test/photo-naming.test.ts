import { describe, expect, it } from "vitest";
import {
  derivedPhotoDescription,
  derivedPhotoName,
  rootPhotoDescription,
  rootPhotoName,
} from "@/lib/photo-naming";

describe("rootPhotoName", () => {
  it("laisse un nom simple intact", () => {
    expect(rootPhotoName("bureau-bois")).toBe("bureau-bois");
  });

  it("retire un empilement de suffixes de dérivation (vu en prod)", () => {
    expect(rootPhotoName("bureau-bois — packshot — Noël — packshot")).toBe("bureau-bois");
  });

  it("retire un libellé saisonnier quelle que soit la casse", () => {
    expect(rootPhotoName("savon doux — noël")).toBe("savon doux");
  });

  it("garde un tiret cadratin qui fait partie du vrai nom", () => {
    expect(rootPhotoName("atelier — vue d'ensemble")).toBe("atelier — vue d'ensemble");
  });

  it("retombe sur le fallback si le nom est vide", () => {
    expect(rootPhotoName(null, "Portrait")).toBe("Portrait");
  });
});

describe("derivedPhotoName", () => {
  it("ajoute un seul suffixe à partir de la racine", () => {
    expect(derivedPhotoName("bureau-bois — packshot — Noël", "packshot")).toBe(
      "bureau-bois — packshot",
    );
  });

  it("plafonne à 120 caractères", () => {
    expect(derivedPhotoName("x".repeat(200), "packshot").length).toBeLessThanOrEqual(120);
  });
});

describe("rootPhotoDescription", () => {
  it("retire les préfixes empilés (vu en prod)", () => {
    expect(
      rootPhotoDescription(
        "Packshot fond blanc — Version Noël — Packshot fond blanc — Laptop ouvert sur bureau bois",
      ),
    ).toBe("Laptop ouvert sur bureau bois");
  });

  it("rend null si la description est vide", () => {
    expect(rootPhotoDescription("")).toBeNull();
    expect(rootPhotoDescription(null)).toBeNull();
  });

  it("ne touche pas une description sans préfixe", () => {
    expect(rootPhotoDescription("livre ouvert, lumière douce")).toBe(
      "livre ouvert, lumière douce",
    );
  });
});

describe("derivedPhotoDescription", () => {
  it("pose un seul préfixe devant la description racine", () => {
    expect(
      derivedPhotoDescription("Packshot fond blanc", "Version Noël — savon posé sur lin", "fallback"),
    ).toBe("Packshot fond blanc — savon posé sur lin");
  });

  it("utilise le fallback sans description source", () => {
    expect(derivedPhotoDescription("Packshot fond blanc", null, "Packshot e-commerce")).toBe(
      "Packshot e-commerce",
    );
  });
});
