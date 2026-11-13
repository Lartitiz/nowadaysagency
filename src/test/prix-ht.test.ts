import { describe, expect, it } from "vitest";
import { euros, montantTTC, prixHT, prixHtEtTtc, prixTTC } from "@/lib/prix-ht";
import { CREDIT_PACKS, STRIPE_PLANS, STRIPE_PRODUCTS } from "@/lib/stripe-config";

const plain = (s: string) => s.replace(/\u00a0/g, " ");

describe("prix HT + TVA", () => {
  it("affiche HT et TTC comme sur la page de paiement Stripe", () => {
    expect(plain(prixHtEtTtc(39, "/mois"))).toBe("39 € HT/mois (46,80 € TTC)");
    expect(plain(prixHtEtTtc(29, "/mois"))).toBe("29 € HT/mois (34,80 € TTC)");
    expect(plain(prixHT(325, "/mois"))).toBe("325 € HT/mois");
    expect(plain(prixTTC(325))).toBe("390 € TTC");
    expect(plain(prixTTC(1950))).toBe("2 340 € TTC");
    expect(plain(prixTTC(150))).toBe("180 € TTC");
    expect(plain(euros(3.9))).toBe("3,90 €");
    expect(montantTTC(14.9)).toBe(17.88);
  });

  it("les montants affichés correspondent aux prix HT vendus", () => {
    expect(STRIPE_PLANS.outil.price).toBe(39);
    expect(STRIPE_PLANS.binome_monthly.price).toBe(325);
    expect(STRIPE_PLANS.binome_once.price).toBe(1950);
    expect(STRIPE_PRODUCTS.coaching.price).toBe(150);
    expect(STRIPE_PLANS.outil.priceId).toBe("price_1UbFtAIwPeG7GjpyqP6fBplf");
    expect(CREDIT_PACKS.pack_10.priceId).toBe("price_1UbFtEIwPeG7GjpyJPOBEHiX");
  });
});
