// Sonde ❓ du matin (e2e-visite/questions-qualite.ts) : lectures ajoutées le 25/11/2026.
import { describe, it, expect } from "vitest";
import { lireQualite, neQuestionnePas } from "../../e2e-visite/questions-qualite";

const SAINE = "Quel chiffre de ta dernière opération surprend le plus tes acheteurs ?";

describe("sonde ❓ : phrase qui n'interroge pas, question qui vouvoie", () => {
  it("la phrase vue à la répétition du 25/11 passe au 🟠 par la ligne « n'interroge pas »", () => {
    const vue = "Pense à ta toute première opération de marchand de biens ?";
    expect(neQuestionnePas(vue)).toBe(true);
    const lu = lireQualite([{ question: SAINE }, { question: vue }]);
    expect(lu.sansQuestion).toEqual([vue]);
    // C'est bien cette lecture qui fait le 🟠, pas la longueur ni le oui/non.
    expect(lu.maxMots).toBeLessThanOrEqual(32);
    expect(lu.fermees).toEqual([]);
    expect(lu.vouvoient).toEqual([]);
    expect(lu.orange).toBe(true);
  });

  it("une question qui mélange « votre » et « veux-tu » passe au 🟠 par la ligne « vouvoie »", () => {
    const melange = "Dans votre méthode, quelle étape veux-tu montrer en premier ?";
    const lu = lireQualite([melange]);
    expect(lu.vouvoient).toEqual([melange]);
    expect(lu.sansQuestion).toEqual([]);
    expect(lu.fermees).toEqual([]);
    expect(lu.orange).toBe(true);
  });

  it("une question oui/non par inversion (« met-elle… ? ») passe au 🟠 par la ligne « oui/non »", () => {
    const vue = "Cette visite pièce par pièce met-elle en avant une rénovation que tu as menée toi-même ?";
    const lu = lireQualite([vue]);
    expect(lu.fermees).toEqual([vue]);
    expect(lu.orange).toBe(true);
  });

  it("des questions saines restent ✅ ; une invitation sans « ? » n'est pas signalée", () => {
    const lu = lireQualite([SAINE, "Pense à ta dernière opération bloquée par un lot : qu'est-ce qui a fini par débloquer la revente ?", "Raconte ta dernière visite de chantier."]);
    expect(lu.orange).toBe(false);
    expect(lu.sansQuestion).toEqual([]);
  });
});
