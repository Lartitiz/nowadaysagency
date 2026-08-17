// Annule l'abonnement Stripe actif d'un compte AVANT sa suppression en cascade.
// Sans ça, un abonnement reste actif côté Stripe alors que le compte n'existe
// plus dans l'app : la cliente continue d'être facturée sans aucune trace ni
// moyen de s'en apercevoir.

export interface SubscriptionRow {
  stripe_subscription_id: string | null;
  status: string | null;
}

export interface SupabaseLike {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{ data: SubscriptionRow | null; error: { message: string } | null }>;
      };
    };
  };
}

export interface StripeLike {
  subscriptions: {
    cancel: (id: string) => Promise<unknown>;
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
    .select("stripe_subscription_id, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { canceled: false, error: error.message };
  }

  // Plan gratuit (jamais souscrit) ou abonnement déjà résilié : rien à faire.
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
