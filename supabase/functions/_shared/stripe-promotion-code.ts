// Codes de réduction Stripe (« codes de promotion ») tapés dans l'app.
//
// Les codes d'accès internes (table promo_codes) ouvrent un plan gratuitement ;
// les codes de réduction vivent dans Stripe et baissent le prix de l'abonnement.
// redeem-promo s'en sert pour reconnaître un code de réduction tapé dans
// « Tu as un code d'accès ? », et create-checkout pour l'appliquer d'office
// sur la page de paiement.

export interface StripeDiscount {
  /** Identifiant Stripe du code de promotion (promo_…). */
  id: string;
  code: string;
  /** Réduction lisible, ex. « -10 € par mois », « -20 % pendant 3 mois ». */
  label: string;
}

const STRIPE_VERSION = "2025-08-27.basil";

function formatEuros(cents: number): string {
  const euros = cents / 100;
  return Number.isInteger(euros) ? `${euros} €` : `${euros.toFixed(2).replace(".", ",")} €`;
}

export function discountLabel(coupon: any): string {
  const amount = coupon?.percent_off
    ? `-${String(coupon.percent_off).replace(".", ",")} %`
    : coupon?.amount_off ? `-${formatEuros(coupon.amount_off)}` : "Réduction";
  if (coupon?.duration === "forever") return `${amount} par mois`;
  if (coupon?.duration === "repeating" && coupon?.duration_in_months) {
    return `${amount} par mois pendant ${coupon.duration_in_months} mois`;
  }
  if (coupon?.duration === "once") return `${amount} sur le premier mois`;
  return amount;
}

/** Cherche un code de promotion Stripe actif et encore utilisable. Jamais d'exception : null si absent ou injoignable. */
export async function findActiveStripePromotionCode(
  code: string,
  key: string | undefined = Deno.env.get("STRIPE_SECRET_KEY"),
): Promise<StripeDiscount | null> {
  const clean = code.trim();
  if (!key || !clean || clean.length > 64) return null;
  try {
    const url = `https://api.stripe.com/v1/promotion_codes?active=true&limit=10&code=${encodeURIComponent(clean)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, "Stripe-Version": STRIPE_VERSION },
    });
    if (!res.ok) {
      console.error("[stripe-promotion-code] lecture Stripe refusée", { status: res.status });
      return null;
    }
    const body = await res.json();
    const now = Math.floor(Date.now() / 1000);
    for (const pc of body?.data ?? []) {
      // Stripe compare les codes sans tenir compte de la casse ; on garde la même règle.
      if (String(pc.code).toUpperCase() !== clean.toUpperCase()) continue;
      const coupon = pc.coupon ?? pc.promotion?.coupon;
      if (!pc.active || (coupon && typeof coupon === "object" && coupon.valid === false)) continue;
      if (pc.expires_at && pc.expires_at <= now) continue;
      if (pc.max_redemptions && pc.times_redeemed >= pc.max_redemptions) continue;
      return { id: pc.id, code: pc.code, label: discountLabel(typeof coupon === "object" ? coupon : null) };
    }
    return null;
  } catch (e) {
    console.error("[stripe-promotion-code] Stripe injoignable", { message: e instanceof Error ? e.message : String(e) });
    return null;
  }
}
