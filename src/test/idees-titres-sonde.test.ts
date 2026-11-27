import { describe, expect, it } from "vitest";
import { verdictIdees, verdictTitres } from "../../e2e-visite/idees-ressorts-verdict";

// Vrais titres relevés sur le compte test le 27/11/2026, avant et après #2158.
const AVANT = [
  "Mon savon est doux, mais il reste un savon : pH autour de 8 à 10, il lave, il ne soigne pas ta peau qui tiraille",
  "Le même pain, retourné chaque semaine sur sa grille : une série de photos du coulage jusqu'à la fin de la cure",
  "Ton savon « naturel » a une étiquette plus longue qu'avant ? Ce n'est pas la recette qui a changé, c'est la loi. Et cette dernière ligne compte plus que le mot « naturel »",
  "Le choix que j'ai fait dans mes savons pour les peaux qui tiraillent, et ce qu'il me coûte vraiment"
];
const APRES = [
  "Tu lis tout le dos du flacon, tu ne comprends rien, et tu reprends le même gel douche que d'habitude",
  "Le parfum que j'ai retiré de mes savons alors que c'était celui que vous me demandiez le plus",
  "Le savon que je coupe aujourd'hui, tu ne pourras pas t'en servir avant un mois",
  "Avant de dire que mon savon tire ta peau, regarde où tu le poses entre deux douches"
];
const idees = (titres: string[]) => titres.map((subject, i) => ({ subject, spring: ["geste", "clin_oeil", "position", "eclairer"][i], share_reason: "Elle s'y reconnaît et l'envoie à une amie." }));

describe("sonde « Trouver une idée » : lecture des titres", () => {
  it("les titres d'avant #2158 passent au 🟠 sur la ligne des titres, pas sur celle des ressorts", () => {
    const v = verdictTitres(idees(AVANT));
    expect(v.niveau).toBe("🟠");
    expect(v.hors).toBe(3);
    expect(verdictIdees(idees(AVANT)).niveau).toBe("✅");
  });
  it("les titres d'après #2158 sont ✅ et imprimés tels quels", () => {
    const v = verdictTitres(idees(APRES));
    expect(v.niveau).toBe("✅");
    expect(v.titres).toEqual(APRES);
  });
  it("une heure ou un mot collé au deux-points ne compte pas", () => {
    expect(verdictTitres(idees(["Ce que je fais à 6:30 avant d'ouvrir l'atelier"])).niveau).toBe("✅");
  });
});
