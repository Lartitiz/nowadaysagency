import { CheckoutConflict } from "./subscription-checkout.ts";

/** One pending purchase per customer, including concurrent tabs and transport retries. */
export async function paymentCheckout(stripe: any, admin: any, userId: string, params: any) {
  for (let retry = 0; retry < 2; retry++) {
    const { data: attempt, error } = await admin.rpc("reserve_payment_checkout", { p_user_id: userId, p_params: params });
    if (error || !attempt) throw error ?? new Error("checkout_reservation_unavailable");
    // A transport failure can leave Stripe's session unknown locally. Once the
    // attempt expires, reconcile its opaque reference before rotating it: an
    // unknown outcome must not become either a second payment or a dead end.
    if (!attempt.stripe_session_id && new Date(attempt.expires_at).getTime() <= Date.now()) {
      let recovered: any = null;
      for await (const candidate of stripe.checkout.sessions.list({
        created: { gte: Math.floor(new Date(attempt.expires_at).getTime() / 1000) - 7200 }, limit: 100,
      })) {
        if (candidate.metadata?.user_id === userId && (candidate.client_reference_id === attempt.attempt_id ||
          (!candidate.client_reference_id && candidate.mode === "payment" && candidate.expires_at === Math.floor(new Date(attempt.expires_at).getTime() / 1000)))) { recovered = candidate; break; }
      }
      const query = recovered
        ? admin.from("payment_checkout_attempts").update({ stripe_session_id: recovered.id })
        : admin.from("payment_checkout_attempts").delete();
      const { error: recoveryError } = await query.eq("user_id", userId).eq("attempt_id", attempt.attempt_id);
      if (recoveryError) throw recoveryError;
      continue;
    }
    if (attempt.stripe_session_id) {
      const session = await stripe.checkout.sessions.retrieve(attempt.stripe_session_id);
      if (session.status === "complete") {
        const { data: purchase, error: readError } = await admin.from("purchases")
          .select("fulfillment_state").eq("user_id", userId).eq("stripe_checkout_session_id", session.id).maybeSingle();
        if (readError) throw readError;
        if (purchase?.fulfillment_state !== "fulfilled") throw new CheckoutConflict("Ton paiement est en cours de vérification. Consulte ton abonnement avant de payer à nouveau.");
      }
      if (session.status === "expired" || session.status === "complete") {
        const { error: removeError } = await admin.from("payment_checkout_attempts").delete()
          .eq("user_id", userId).eq("attempt_id", attempt.attempt_id);
        if (removeError) throw removeError;
        continue;
      }
      if (attempt.params.line_items[0].price !== params.line_items[0].price) throw new CheckoutConflict("Un paiement est déjà ouvert pour un autre achat. Termine-le ou attends son expiration.");
      if (session.status === "open" && session.url) return session;
      throw new CheckoutConflict("Ce paiement doit être vérifié avant de continuer.");
    }
    if (attempt.params.line_items[0].price !== params.line_items[0].price) throw new CheckoutConflict("Un autre achat est en préparation. Réessaie dans quelques instants.");
    const session = await stripe.checkout.sessions.create({ ...attempt.params,
      client_reference_id: attempt.attempt_id,
      expires_at: Math.floor(new Date(attempt.expires_at).getTime() / 1000),
    }, { idempotencyKey: `payment-checkout-${attempt.attempt_id}` });
    const { error: saveError } = await admin.from("payment_checkout_attempts")
      .update({ stripe_session_id: session.id }).eq("user_id", userId).eq("attempt_id", attempt.attempt_id);
    if (saveError) throw saveError;
    if (session.status === "expired" || session.status === "complete") continue;
    return session;
  }
  throw new CheckoutConflict("Recharge ton abonnement pour vérifier le dernier achat.");
}
