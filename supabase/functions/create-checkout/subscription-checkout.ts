export class CheckoutConflict extends Error {}

// Stripe est la source de vérité : un webhook peut être retardé.
export async function subscriptionCheckout(stripe: any, admin: any, user: { id: string; email: string }, params: any) {
  const { data: subscription, error } = await admin.from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, status").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (subscription?.stripe_subscription_id) {
    const live = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
    if (!["canceled", "incomplete_expired"].includes(live.status)) {
      throw new CheckoutConflict("Un abonnement existe déjà. Gère-le depuis tes paramètres.");
    }
  }
  let customerId = subscription?.stripe_customer_id;
  if (!customerId) {
    const existing = await stripe.customers.list({ email: user.email, limit: 100 });
    const owned = existing.data.filter((c: any) => !c.metadata?.user_id || c.metadata.user_id === user.id);
    if (owned.length > 1) throw new CheckoutConflict("Plusieurs dossiers de paiement existent. Contacte le support avant de souscrire.");
    customerId = owned[0]?.id;
  }
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } }, {
      idempotencyKey: `customer-${user.id}`,
    });
    customerId = customer.id;
  }
  for await (const live of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) {
    if (!["canceled", "incomplete_expired"].includes(live.status)) {
      throw new CheckoutConflict("Un abonnement existe déjà. Gère-le depuis tes paramètres.");
    }
  }
  // Reprendre aussi les checkouts ouverts par l'ancienne version du serveur.
  for await (const open of stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 })) {
    if (open.mode !== "subscription") continue;
    const items = await stripe.checkout.sessions.listLineItems(open.id, { limit: 10 });
    if (items.data.length === 1 && items.data[0].price?.id === params.line_items[0].price && open.url) return open;
    throw new CheckoutConflict("Un paiement est déjà ouvert pour une autre offre. Termine-le ou attends son expiration avant de changer d'offre.");
  }
  const stableParams = { ...params, customer: customerId };
  delete stableParams.customer_email;
  const { data: attempt, error: reserveError } = await admin.rpc("reserve_subscription_checkout", {
    p_user_id: user.id, p_params: stableParams,
  });
  if (reserveError || !attempt) throw reserveError ?? new Error("Checkout reservation unavailable");
  if (attempt.params.line_items[0].price !== params.line_items[0].price) {
    throw new CheckoutConflict("Un paiement est déjà ouvert pour une autre offre. Termine-le ou attends son expiration avant de changer d'offre.");
  }
  if (attempt.stripe_session_id) {
    const session = await stripe.checkout.sessions.retrieve(attempt.stripe_session_id);
    if (session.status === "open" && session.url) return session;
    throw new CheckoutConflict("Ce paiement est déjà terminé ou expiré. Recharge tes paramètres pour vérifier ton abonnement.");
  }
  const session = await stripe.checkout.sessions.create({
    ...attempt.params, expires_at: Math.floor(new Date(attempt.expires_at).getTime() / 1000),
  }, { idempotencyKey: `subscription-checkout-${attempt.attempt_id}` });
  const { error: saveError } = await admin.from("checkout_attempts").update({ stripe_session_id: session.id })
    .eq("user_id", user.id).eq("attempt_id", attempt.attempt_id);
  // Si l'écriture échoue, le prochain appel retrouve la session via la même clé Stripe.
  if (saveError) throw saveError;
  return session;
}
