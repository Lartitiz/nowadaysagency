import { describe, it, expect } from "vitest";
import { quotaLimitMessage, renewalLabel, findQuota } from "@/lib/quota-message";
import { friendlyError, readableError } from "@/lib/error-messages";

// Chantier E (15/10/2026) : le message de quota nomme la limite atteinte
// (réponse de _shared/plan-limiter.ts) au lieu de « tous tes crédits ».
const renews_at = "2026-11-01T00:00:00.000Z";
const usage = { carousel: { used: 3, limit: 3 }, photo_retouch: { used: 5, limit: 5 }, video: { used: 3, limit: 3 }, total: { used: 10, limit: 23 } };

describe("quotaLimitMessage", () => {
  it("nomme les carrousels et propose une autre création", () => {
    expect(quotaLimitMessage({ reason: "category", category: "carousel", plan: "free", usage, renews_at }))
      .toBe("Tu as fait tes 3 carrousels du mois. Ils reviennent le 1er novembre. En attendant, tu peux écrire des posts, des reels ou des stories.");
  });
  it("nomme les images et les vidéos", () => {
    expect(quotaLimitMessage({ reason: "category", category: "photo_retouch", plan: "free", usage, renews_at }))
      .toContain("Tu as créé tes 5 images du mois. Elles reviennent le 1er novembre.");
    expect(quotaLimitMessage({ reason: "category", category: "video", plan: "outil", usage, renews_at }))
      .toContain("Tu as créé tes 3 vidéos du mois.");
  });
  it("parle de crédits quand c'est le compteur global (gratuit)", () => {
    expect(quotaLimitMessage({ reason: "total", plan: "free", usage: { total: { used: 23, limit: 23 } }, renews_at }))
      .toBe("Tu as utilisé tes 23 crédits du mois. Ils reviennent le 1er novembre. Tu peux aussi ajouter des crédits bonus ou passer à Premium.");
  });
  it("ne propose pas Premium à une abonnée", () => {
    const m = quotaLimitMessage({ reason: "total", plan: "outil", usage: { total: { used: 200, limit: 200 } }, renews_at })!;
    expect(m).toContain("limite d'usage du mois (200 créations)");
    expect(m).not.toContain("Premium");
  });
  it("vidéo indisponible en gratuit", () => {
    expect(quotaLimitMessage({ reason: "not_available", category: "video", plan: "free" })).toContain("comprises dans Premium");
  });
  it("une panne de vérification n'est pas un quota", () => {
    expect(quotaLimitMessage({ reason: "error", message: "Impossible de vérifier" })).toBeNull();
    expect(quotaLimitMessage(null)).toBeNull();
  });
  it("garde le message serveur pour un autre type", () => {
    expect(quotaLimitMessage({ reason: "category", category: "deep_research", usage, message: "Tu as utilisé tes 23 recherches approfondies ce mois." }))
      .toBe("Tu as utilisé tes 23 recherches approfondies ce mois.");
  });
  it("date de renouvellement par défaut", () => {
    expect(renewalLabel(undefined, new Date("2026-12-15T10:00:00Z"))).toBe("1er janvier");
  });
  it("trouve le quota dans les formes d'erreur reçues", () => {
    const quota = { reason: "category" };
    expect(findQuota({ data: { quota } })).toBe(quota);
    expect(findQuota({ detail: { quota } })).toBe(quota);
  });
});

describe("friendlyError / readableError", () => {
  it("garde la phrase claire du serveur au lieu de « tous tes crédits »", () => {
    expect(friendlyError(new Error("Tu as utilisé tes 20 carrousels ce mois. Tes crédits se renouvellent le 1 novembre.")))
      .toBe("Tu as utilisé tes 20 carrousels ce mois. Tes crédits se renouvellent le 1 novembre.");
  });
  it("utilise l'objet quota quand il est là", () => {
    expect(friendlyError({ message: "limit_reached", data: { quota: { reason: "category", category: "carousel", plan: "free", usage, renews_at } } }))
      .toContain("tes 3 carrousels du mois");
  });
  it("garde un message déjà écrit pour l'utilisatrice", () => {
    expect(readableError(new Error("Cette photo dépasse 5 Mo. Ajoute une version plus légère."), "x"))
      .toBe("Cette photo dépasse 5 Mo. Ajoute une version plus légère.");
  });
  it("traduit un message technique", () => {
    expect(readableError(new Error("Failed to fetch"), "x")).toBe("Problème de connexion. Vérifie ton Wi-Fi et réessaie.");
    expect(readableError(new Error("Edge Function returned a non-2xx status code"), "x")).toContain("momentanément indisponible");
    expect(readableError(new Error("Cannot read properties of undefined (reading 'slides')"), "x")).toContain("Réessaie");
    expect(readableError(new Error("unknown_subscription_plan"), "x")).toContain("Réessaie");
  });
  it("lit le JSON brut renvoyé par certaines fonctions", () => {
    expect(readableError('{"error":"limit_reached","message":"Tu as utilisé tes 5 images ce mois."}', "x")).toBe("Tu as utilisé tes 5 images ce mois.");
  });
  it("prend le message de secours si l'erreur est vide", () => {
    expect(readableError(new Error(""), "Réessaie l’envoi.")).toBe("Réessaie l’envoi.");
    expect(readableError(undefined, "Réessaie l’envoi.")).toBe("Réessaie l’envoi.");
  });
});
