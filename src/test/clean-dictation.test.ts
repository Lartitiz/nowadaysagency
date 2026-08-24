import { describe, it, expect } from "vitest";
import { cleanDictation } from "@/lib/clean-dictation";

describe("cleanDictation", () => {
  it("nettoie le cas RÉEL du bilan hebdo du 24/08 (titre de sujet en prod)", () => {
    // Transcription telle qu'elle est arrivée en base, et telle qu'elle
    // s'affichait ensuite comme titre du sujet dans l'app.
    const brut =
      "Je voudrais. Euh. J'ai fait une série sur ça m'énerve, donc j'ai mis ça m'énerve. Les pensions qui maltraitent les chevaux.";
    const propre = cleanDictation(brut);

    expect(propre).not.toMatch(/euh/i);
    // Le faux départ « Je voudrais. » RESTE : aucune règle mécanique ne le
    // distingue d'une vraie phrase courte (cf. en-tête du module).
    expect(propre).toBe(
      "Je voudrais. J'ai fait une série sur ça m'énerve, donc j'ai mis ça m'énerve. Les pensions qui maltraitent les chevaux.",
    );
  });

  it("retire les hésitations où qu'elles soient, allongements compris", () => {
    expect(cleanDictation("Euh, je voulais dire autre chose")).toBe("Je voulais dire autre chose");
    // ... mais jamais inventée : un fragment qui commençait en minuscule
    // s'ajoute au milieu d'une phrase déjà saisie et doit y rester.
    expect(cleanDictation("euh, je voulais dire autre chose")).toBe("je voulais dire autre chose");
    expect(cleanDictation("Je pense euuuh que c'est bien")).toBe("Je pense que c'est bien");
    expect(cleanDictation("C'est important. Hmm. Vraiment.")).toBe("C'est important. Vraiment.");
    expect(cleanDictation("Alors euh euh je disais")).toBe("Alors je disais");
  });

  it("renvoie une chaîne vide quand le fragment n'était QUE de l'hésitation", () => {
    // Le hook ne doit alors rien ajouter au champ (pas même une espace).
    expect(cleanDictation("Euh.")).toBe("");
    expect(cleanDictation("hmm")).toBe("");
    expect(cleanDictation("   ")).toBe("");
    expect(cleanDictation("...")).toBe("");
  });

  it("supprime le bégaiement des mots-outils, jamais les intensifs", () => {
    expect(cleanDictation("je je voulais te dire")).toBe("je voulais te dire");
    expect(cleanDictation("c'est le le sujet")).toBe("c'est le sujet");
    // « très très » et « tout tout » sont volontaires : on n'y touche pas.
    expect(cleanDictation("c'est très très important")).toBe("c'est très très important");
  });

  it("ne touche pas à un texte déjà propre", () => {
    const propre = "Trois idées pour mieux vendre sans forcer, en 2026.";
    expect(cleanDictation(propre)).toBe(propre);
  });

  it("laisse intacts les mots qui CONTIENNENT une hésitation", () => {
    // Le piège classique d'un filtre trop large : « heure », « humain »,
    // « euphorie » commencent par une hésitation.
    expect(cleanDictation("On se voit dans une heure")).toBe("On se voit dans une heure");
    expect(cleanDictation("Un métier profondément humain")).toBe("Un métier profondément humain");
    expect(cleanDictation("Une euphorie collective")).toBe("Une euphorie collective");
  });

  it("garde « Ben » et « eh bien », volontairement hors de la liste", () => {
    expect(cleanDictation("Ben est mon associé")).toBe("Ben est mon associé");
    expect(cleanDictation("Eh bien voilà")).toBe("Eh bien voilà");
  });

  it("ne laisse ni ponctuation orpheline ni espace doublé", () => {
    expect(cleanDictation("Voilà, euh, ce que je pense")).toBe("Voilà, ce que je pense");
    expect(cleanDictation("Bref euh . C'est tout")).toBe("Bref. C'est tout");
  });
});
