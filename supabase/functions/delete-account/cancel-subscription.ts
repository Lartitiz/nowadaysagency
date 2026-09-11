// Annule l'abonnement Stripe actif d'un compte AVANT sa suppression en cascade.
// Sans ça, un abonnement reste actif côté Stripe alors que le compte n'existe
// plus dans l'app : la cliente continue d'être facturée sans aucune trace ni
// moyen de s'en apercevoir.

export interface SubscriptionRow {
  stripe_customer_id?: string | null;
  params?: { customer?: string };
  stripe_subscription_id: string | null;
  status: string | null;
}

export interface SupabaseLike {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => PromiseLike<{ data: SubscriptionRow | null; error: { message: string } | null }>;
      };
    };
  };
}

export interface StripeLike {
  checkout?: { sessions: {
    list: (params: { customer: string; status: "open"; limit: number }) => AsyncIterable<{ id: string; metadata?: { user_id?: string } }>;
    expire: (id: string) => Promise<unknown>;
  } };
  subscriptions: {
    cancel: (id: string) => Promise<unknown>;
    list?: (params: { customer: string; status: "all"; limit: number }) => AsyncIterable<{ id: string; status: string; metadata?: { user_id?: string } }>;
  };
}

export interface CancelResult {
  canceled: boolean;
  error?: string;
}

// Messages Stripe qui signifient "il n'y a déjà plus rien à annuler" plutôt
// qu'un vrai échec : on ne doit pas bloquer la suppression du compte pour ça.
const ALREADY_GONE_PATTERNS = ["No such subscription", "already been canceled", "already canceled"];

export async function cancelActiveStripeSubscription(
  userId: string,
  admin: SupabaseLike,
  stripe: StripeLike,
): Promise<CancelResult> {
  const { data: subRow, error } = await admin
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { canceled: false, error: error.message };
  }

  // Retrouver également une ancienne souscription écrasée dans la ligne locale.
  const { data: attempt, error: attemptError } = await admin.from("checkout_attempts")
    .select("params").eq("user_id", userId).maybeSingle();
  if (attemptError) return { canceled: false, error: attemptError.message };
  const customerId = subRow?.stripe_customer_id ?? attempt?.params?.customer;
  if (customerId) {
    if (!stripe.subscriptions.list) return { canceled: false, error: "Stripe inventory unavailable" };
    let canceled = false;
    try {
      if (!stripe.checkout) throw new Error("Stripe checkout inventory unavailable");
      for await (const session of stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 })) {
        if (session.metadata?.user_id !== userId) continue;
        await stripe.checkout.sessions.expire(session.id);
      }
      for await (const subscription of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) {
        if (subscription.id !== subRow?.stripe_subscription_id && subscription.metadata?.user_id !== userId) continue;
        if (["canceled", "incomplete_expired"].includes(subscription.status)) continue;
        await stripe.subscriptions.cancel(subscription.id);
        canceled = true;
      }
      return { canceled };
    } catch (e) {
      return { canceled, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // Compatibilité des anciennes lignes sans identifiant client Stripe.
  if (!subRow?.stripe_subscription_id || subRow.status === "canceled") {
    return { canceled: false };
  }

  try {
    await stripe.subscriptions.cancel(subRow.stripe_subscription_id);
    return { canceled: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (ALREADY_GONE_PATTERNS.some((p) => msg.includes(p))) {
      return { canceled: false };
    }
    return { canceled: false, error: msg };
  }
}
