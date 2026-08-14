import { describe, it, expect } from "vitest";
import { classerParPertinence, motsUtiles } from "@/lib/rank-library-photos";

// La bibliothèque réelle du compte de test le 14/08 : 3 portables, 1 livre.
const BIBLIO = [
  { nom: "portable-noel", description: "Ordinateur portable sur bureau bois avec décorations de Noël", tags: ["noel"] },
  { nom: "portable-blanc", description: "Ordinateur portable ouvert avec écouteurs blancs, fond blanc", tags: ["packshot"] },
  { nom: "portable-lit", description: "Ordinateur portable posé sur un lit, lumière douce", tags: [] },
  { nom: "livre", description: "Livre ouvert à couverture marron, pages blanches, lumière naturelle", tags: ["lecture"] },
];

const noms = (l: { nom: string }[]) => l.map((p) => p.nom);

describe("classerParPertinence", () => {
  it("le cas réel : une story qui parle d'un livre met le livre en premier", () => {
    const classe = classerParPertinence(BIBLIO, "livre ouvert posé sur une table, pages visibles");
    expect(classe[0].nom).toBe("livre");
  });

  it("une story qui parle d'ordinateur ne remonte pas le livre", () => {
    const classe = classerParPertinence(BIBLIO, "un ordinateur portable ouvert sur un bureau");
    expect(classe[0].nom).not.toBe("livre");
    expect(noms(classe)).toContain("livre"); // il reste proposé, juste plus bas
  });

  it("aucune photo n'est PERDUE : on trie, on ne filtre pas", () => {
    const classe = classerParPertinence(BIBLIO, "céramique argile tournage");
    expect(classe).toHaveLength(BIBLIO.length);
    expect(noms(classe).sort()).toEqual(noms(BIBLIO).sort());
  });

  it("demande vide : l'ordre d'origine (le plus récent d'abord) est gardé", () => {
    expect(noms(classerParPertinence(BIBLIO, ""))).toEqual(noms(BIBLIO));
    expect(noms(classerParPertinence(BIBLIO, "   "))).toEqual(noms(BIBLIO));
  });

  it("tri STABLE : à score égal, l'ordre d'entrée est préservé", () => {
    // « lumière » est dans deux descriptions, à égalité stricte.
    const classe = classerParPertinence(BIBLIO, "lumière");
    const exAequo = noms(classe).filter((n) => n === "portable-lit" || n === "livre");
    expect(exAequo).toEqual(["portable-lit", "livre"]);
  });

  it("les accents et les pluriels ne font pas rater un recoupement", () => {
    const classe = classerParPertinence(BIBLIO, "DECORATION de NOEL");
    expect(classe[0].nom).toBe("portable-noel");
  });

  it("les tags comptent, pas seulement la description", () => {
    const classe = classerParPertinence(BIBLIO, "une photo de lecture");
    expect(classe[0].nom).toBe("livre");
  });

  it("ne casse pas sur des photos sans description ni tags", () => {
    const bancal = [{ nom: "vide" }, { nom: "nul", description: null, tags: null }];
    expect(() => classerParPertinence(bancal, "livre")).not.toThrow();
    expect(classerParPertinence(bancal, "livre")).toHaveLength(2);
  });
});

describe("motsUtiles", () => {
  it("écarte les mots trop courts et les mots vides", () => {
    expect(motsUtiles("une photo avec un livre dans la main")).toEqual(
      new Set(["livre", "main"]),
    );
  });

  it("replie le pluriel simple", () => {
    expect(motsUtiles("livres pages")).toEqual(new Set(["livre", "page"]));
  });
});
