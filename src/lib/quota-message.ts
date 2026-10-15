// Phrase de quota lisible, construite depuis la réponse du serveur
// (`_shared/plan-limiter.ts` : { reason, category, plan, usage, renews_at,
// message }). Le serveur renvoie déjà « Tu as utilisé tes 3 carrousels ce
// mois… », mais plusieurs écrans le remplaçaient par « tous tes crédits ».
// Ici on nomme la limite atteinte et on dit quoi faire, sans appel serveur.

export interface QuotaInfo {
  reason?: "total" | "category" | "not_available" | "error" | string;
  category?: string;
  plan?: string;
  usage?: Record<string, { used: number; limit: number }>;
  renews_at?: string;
  message?: string;
}

/** Plafonds par type montrés à l'écran (même liste que la page abonnement). */
export const QUOTA_TYPES: { key: string; label: string; feminine: boolean }[] = [
  { key: "carousel", label: "carrousels", feminine: false },
  { key: "photo_retouch", label: "images", feminine: true },
  { key: "video", label: "vidéos", feminine: true },
  { key: "audit", label: "audits", feminine: false },
];

/** « 1er novembre » : jour du renouvellement (1er du mois suivant). */
export function renewalLabel(renewsAt?: string, now: Date = new Date()): string {
  let d = renewsAt ? new Date(renewsAt) : null;
  if (!d || Number.isNaN(d.getTime())) {
    d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }
  return `1er ${d.toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" })}`;
}

const PAID_PLANS = ["outil", "binome"];

/**
 * Phrase complète pour un quota refusé. Retourne `null` si l'objet ne
 * ressemble pas à un refus de quota (l'appelant garde alors son message).
 */
export function quotaLimitMessage(quota: QuotaInfo | null | undefined): string | null {
  if (!quota || !quota.reason || quota.reason === "error") return null;
  const renew = renewalLabel(quota.renews_at);
  const paid = PAID_PLANS.includes(quota.plan || "");

  if (quota.reason === "not_available") {
    if (quota.category === "video") return "Les vidéos sont comprises dans Premium. Tes textes, carrousels et images restent disponibles.";
    if (quota.category === "quality_max") return "La Qualité Max est comprise dans Premium. Tu peux créer le même carrousel en qualité normale.";
    return quota.message || "Cette fonction est comprise dans Premium.";
  }

  if (quota.reason === "category") {
    const type = QUOTA_TYPES.find((t) => t.key === quota.category);
    const limit = quota.usage?.[quota.category || ""]?.limit;
    if (type && typeof limit === "number" && limit > 0) {
      const back = type.feminine ? "Elles reviennent" : "Ils reviennent";
      const verb = quota.category === "photo_retouch" || quota.category === "video" ? "créé" : "fait";
      const meanwhile = quota.category === "carousel"
        ? " En attendant, tu peux écrire des posts, des reels ou des stories."
        : quota.category === "audit" ? "" : " Tes textes restent disponibles.";
      return `Tu as ${verb} tes ${limit} ${type.label} du mois. ${back} le ${renew}.${meanwhile}`;
    }
    return quota.message || `Tu as atteint une limite du mois. Elle revient le ${renew}.`;
  }

  if (quota.reason === "total") {
    const limit = quota.usage?.total?.limit;
    if (paid) {
      return `Tu as atteint la limite d'usage du mois${typeof limit === "number" ? ` (${limit} créations)` : ""}. Elle revient le ${renew}. Tu peux aussi ajouter des crédits bonus.`;
    }
    return `Tu as utilisé tes ${typeof limit === "number" ? `${limit} ` : ""}crédits du mois. Ils reviennent le ${renew}. Tu peux aussi ajouter des crédits bonus ou passer à Premium.`;
  }

  return quota.message || null;
}

/** Cherche l'objet quota dans les différentes formes d'erreur reçues. */
export function findQuota(error: unknown): QuotaInfo | null {
  const e = error as any;
  return e?.data?.quota || e?.quota || e?.detail?.quota || e?.context?.quota || null;
}
