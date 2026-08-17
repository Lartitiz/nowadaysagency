import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const log = (step: string, details?: unknown) => {
  console.log(`[STRIPE-WEBHOOK] ${step}`, details ? JSON.stringify(details) : "");
};

type AnyRec = Record<string, any>;

// supabase-js ne lève jamais d'exception sur un échec d'écriture (RLS, contrainte,
// timeout) : il faut lire { error } explicitement. Cette fonction centralise la
// vérification pour chaque write de ce fichier : elle logue clairement puis relance,
// ce qui est capté par le catch englobant (supprime l'entrée webhook_events pour
// permettre le retry Stripe, et répond 500 au lieu de 200 pour ne pas mentir sur le succès).
function checkError(label: string, error: { message?: string; code?: string } | null, context?: AnyRec): void {
  if (!error) return;
  log(`CRITICAL: ${label} failed`, { error: error.message ?? error, code: error.code, ...(context ?? {}) });
  throw new Error(`${label} failed: ${error.message ?? JSON.stringify(error)}`);
}

// Convertit un timestamp Unix Stripe en ISO. Renvoie null si la valeur est absente
// ou invalide, au lieu de lever une RangeError qui ferait tomber tout le webhook.
function toIso(unixSeconds: unknown): string | null {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) return null;
  const d = new Date(unixSeconds * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Stripe Basil (2025-03-31+) : les périodes de facturation ont quitté l'objet
// Subscription pour aller sur ses items. On lit les deux emplacements pour rester
// compatible quelle que soit la version d'API de l'endpoint.
function getPeriod(sub: Stripe.Subscription): { start: string | null; end: string | null } {
  const s = sub as unknown as AnyRec;
  const item = (s.items?.data?.[0] ?? {}) as AnyRec;
  return {
    start: toIso(item.current_period_start ?? s.current_period_start),
    end: toIso(item.current_period_end ?? s.current_period_end),
  };
}

// Stripe Basil : invoice.subscription remplacé par
// invoice.parent.subscription_details.subscription
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const i = invoice as unknown as AnyRec;
  const raw = i.parent?.subscription_details?.subscription ?? i.subscription ?? null;
  if (!raw) return null;
  return typeof raw === "string" ? raw : (raw.id ?? null);
}

// Déclenche une séquence e-mail (via email-trigger). Fire-and-forget : ne bloque jamais le webhook.
async function fireEmailEvent(event: string, userId: string | null | undefined) {
  if (!userId) return;
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-trigger`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ event, user_id: userId }),
    });
    if (!res.ok) log("fireEmailEvent non-OK", { event, userId, status: res.status });
  } catch (e) {
    log("fireEmailEvent error", { event, userId, error: String(e) });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200 });
  }

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature || !webhookSecret) {
    log("Missing signature or webhook secret");
    return new Response("Missing signature", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    log("Signature verification failed", { error: String(err) });
    return new Response("Invalid signature", { status: 400 });
  }

  log("Event received", { type: event.type, id: event.id });

  try {
    // Idempotency check: skip if already processed
    const { data: existing, error: existingCheckError } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("stripe_event_id", event.id)
      .maybeSingle();
    checkError("webhook_events select (idempotency check)", existingCheckError, { eventId: event.id });

    if (existing) {
      log("Duplicate event, skipping", { eventId: event.id });
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const { error: insertEventError } = await supabase.from("webhook_events").insert({
      stripe_event_id: event.id,
      event_type: event.type,
    });
    checkError("webhook_events insert (idempotency record)", insertEventError, { eventId: event.id });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        if (!userId) { log("No user_id in metadata"); break; }

        if (session.mode === "subscription") {
          let sub = await stripe.subscriptions.retrieve(session.subscription as string);
          const priceId = sub.items.data[0]?.price.id;

          // Determine plan from price
          let plan = "outil";
          if (priceId === "price_1T7uZbIwPeG7Gjpy3arZSdx8") plan = "studio";

          // Set cancel_at for studio plan (6 months engagement)
          if (plan === "studio" && !sub.cancel_at) {
            const cancelAt = new Date();
            cancelAt.setMonth(cancelAt.getMonth() + 6);
            sub = await stripe.subscriptions.update(sub.id, {
              cancel_at: Math.floor(cancelAt.getTime() / 1000),
            });
            log("Studio plan: cancel_at set", { cancelAt: cancelAt.toISOString() });
          }

          const { error: subUpsertError } = await supabase.from("subscriptions").upsert({
            user_id: userId,
            plan,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: sub.id,
            stripe_price_id: priceId,
            status: "active",
            current_period_start: getPeriod(sub).start,
            current_period_end: getPeriod(sub).end,
            studio_start_date: plan === "studio" ? new Date().toISOString() : null,
            studio_end_date: plan === "studio" ? new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString() : null,
            cancel_at: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
          checkError("subscriptions upsert (subscription activation)", subUpsertError, { userId, plan, subId: sub.id });

          const displayPlan = plan === "studio" ? "binome" : plan;
          const { error: profileUpdateError } = await supabase.from("profiles").update({ current_plan: displayPlan }).eq("user_id", userId);
          checkError("profiles update (current_plan after subscription activation)", profileUpdateError, { userId, displayPlan });
          log("Subscription activated", { userId, plan });
          await fireEmailEvent("subscription_activated", userId);

        } else if (session.mode === "payment") {
          // One-time purchase
          const productTypeMap: Record<string, string> = {
            "prod_U66ntcEvBRUkXF": "coaching",
            "prod_U66nHw9q4JTxHL": "studio_once",
          };

          const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
          const priceId = lineItems.data[0]?.price?.id || "";
          const product = lineItems.data[0]?.price?.product;

          // Check if this is a credit pack purchase by looking at product metadata
          let isCreditPack = false;
          let packCredits = 0;
          if (product && typeof product === "string") {
            try {
              const stripeProduct = await stripe.products.retrieve(product);
              if (stripeProduct.metadata?.type === "credit_pack") {
                isCreditPack = true;
                packCredits = parseInt(stripeProduct.metadata.credits || "0", 10);
              }
            } catch (e) {
              // Sans cette classification, un achat de pack de crédits peut tomber en
              // "unknown" et ne jamais être livré : on ne peut pas continuer en silence.
              log("CRITICAL: stripe.products.retrieve failed, cannot classify purchase", { product, sessionId: session.id, userId, error: String(e) });
              throw new Error(`stripe.products.retrieve failed for product ${product}: ${String(e)}`);
            }
          }

          let productType = (typeof product === "string" ? productTypeMap[product] : undefined) || "unknown";
          if (isCreditPack) {
            productType = `credit_pack_${packCredits}`;
          }

          // Check for duplicate purchase by checkout session ID
          const { data: existingPurchase, error: existingPurchaseError } = await supabase
            .from("purchases")
            .select("id")
            .eq("stripe_checkout_session_id", session.id)
            .maybeSingle();
          checkError("purchases select (duplicate check)", existingPurchaseError, { sessionId: session.id, userId });

          if (!existingPurchase) {
            const { error: purchaseInsertError } = await supabase.from("purchases").insert({
              user_id: userId,
              product_type: productType,
              stripe_payment_intent_id: session.payment_intent as string,
              stripe_checkout_session_id: session.id,
              amount: (session.amount_total || 0) / 100,
              currency: session.currency || "eur",
              status: "paid",
            });
            checkError("purchases insert", purchaseInsertError, { userId, productType, sessionId: session.id });
          } else {
            log("Duplicate purchase skipped", { sessionId: session.id });
          }

          // Credit pack: atomic increment bonus_credits
          if (isCreditPack && packCredits > 0 && !existingPurchase) {
            const { error: creditError } = await supabase.rpc("increment_bonus_credits", {
              user_uuid: userId,
              amount: packCredits,
            });
            checkError("increment_bonus_credits RPC", creditError, { userId, packCredits, sessionId: session.id });
            log("Bonus credits added (atomic)", { userId, packCredits });
          }

          // If studio one-time, activate studio plan
          if (productType === "studio_once") {
            const { error: studioSubError } = await supabase.from("subscriptions").upsert({
              user_id: userId,
              plan: "studio",
              stripe_customer_id: session.customer as string,
              status: "active",
              studio_months_paid: 6,
              studio_start_date: new Date().toISOString(),
              studio_end_date: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" });
            checkError("subscriptions upsert (studio one-time)", studioSubError, { userId, sessionId: session.id });

            const { error: studioProfileError } = await supabase.from("profiles").update({ current_plan: "binome" }).eq("user_id", userId);
            checkError("profiles update (studio one-time)", studioProfileError, { userId });
          }

          log("Purchase recorded", { userId, productType });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const { error: subUpdateError } = await supabase.from("subscriptions").update({
          status: sub.status === "active" ? "active" : sub.status,
          current_period_start: getPeriod(sub).start,
          current_period_end: getPeriod(sub).end,
          cancel_at: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
          canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        }).eq("stripe_subscription_id", sub.id);
        checkError("subscriptions update (customer.subscription.updated)", subUpdateError, { subId: sub.id, status: sub.status });

        log("Subscription updated", { subId: sub.id, status: sub.status });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const { data: canceledSub, error: canceledSubError } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle();
        checkError("subscriptions select (customer.subscription.deleted lookup)", canceledSubError, { subId: sub.id });

        const { error: subCancelError } = await supabase.from("subscriptions").update({
          status: "canceled",
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("stripe_subscription_id", sub.id);
        checkError("subscriptions update (status canceled)", subCancelError, { subId: sub.id });

        if (canceledSub?.user_id) {
          const { error: freeProfileError } = await supabase.from("profiles").update({ current_plan: "free" }).eq("user_id", canceledSub.user_id);
          checkError("profiles update (current_plan free after cancellation)", freeProfileError, { userId: canceledSub.user_id });
          await fireEmailEvent("subscription_cancelled", canceledSub.user_id);
        }
        log("Subscription canceled", { subId: sub.id, userId: canceledSub?.user_id });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = getInvoiceSubscriptionId(invoice);
        if (!subId) { log("No subscription id on invoice", { invoiceId: invoice.id }); break; }

        // Look up user_id from subscription
        const { data: failedSub, error: failedSubError } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_subscription_id", subId)
          .maybeSingle();
        checkError("subscriptions select (invoice.payment_failed lookup)", failedSubError, { subId });

        const { error: pastDueError } = await supabase.from("subscriptions").update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        }).eq("stripe_subscription_id", subId);
        checkError("subscriptions update (status past_due)", pastDueError, { subId });

        // Notify user
        if (failedSub?.user_id) {
          const { error: notifError } = await supabase.from("notifications").insert({
            user_id: failedSub.user_id,
            type: "warning",
            title: "Paiement échoué",
            message: "Ton dernier paiement n'a pas pu être traité. Mets à jour tes informations de paiement pour garder ton accès.",
            link: "/parametres",
            read: false,
          });
          // Non bloquant : le statut past_due (financier) est déjà persisté ; une
          // notification manquante ne doit pas empêcher le 200, mais doit rester visible.
          if (notifError) {
            log("WARNING: notifications insert failed (payment failed alert not shown in-app)", { error: notifError.message, userId: failedSub.user_id });
          }
          await fireEmailEvent("payment_failed", failedSub.user_id);
        }

        log("Payment failed", { subId, userId: failedSub?.user_id });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = getInvoiceSubscriptionId(invoice);
        if (!subId) { log("No subscription id on invoice", { invoiceId: invoice.id }); break; }

        // Increment studio_months_paid for studio plans
        const { data: subData, error: subDataError } = await supabase
          .from("subscriptions")
          .select("plan, studio_months_paid")
          .eq("stripe_subscription_id", subId)
          .single();
        checkError("subscriptions select (invoice.paid lookup)", subDataError, { subId });

        if (subData?.plan === "studio") {
          const { error: studioMonthsError } = await supabase.from("subscriptions").update({
            studio_months_paid: (subData.studio_months_paid || 0) + 1,
            status: "active",
            updated_at: new Date().toISOString(),
          }).eq("stripe_subscription_id", subId);
          checkError("subscriptions update (studio_months_paid)", studioMonthsError, { subId });
        }

        log("Invoice paid", { subId });
        break;
      }
    }
  } catch (err) {
    log("Error processing event", { error: String(err) });
    await supabase.from("webhook_events").delete().eq("stripe_event_id", event.id);
    return new Response("Processing error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
