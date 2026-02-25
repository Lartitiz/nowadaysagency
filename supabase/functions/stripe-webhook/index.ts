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
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        if (!userId) { log("No user_id in metadata"); break; }

        if (session.mode === "subscription") {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          const priceId = sub.items.data[0]?.price.id;

          // Determine plan from price
          let plan = "outil";
          if (priceId === "price_1T3ipcI0YZbTj9ITlKOQN5Tm") plan = "studio";

          await supabase.from("subscriptions").upsert({
            user_id: userId,
            plan,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: sub.id,
            stripe_price_id: priceId,
            status: "active",
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            studio_start_date: plan === "studio" ? new Date().toISOString() : null,
            studio_end_date: plan === "studio" ? new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });

          await supabase.from("profiles").update({ current_plan: plan }).eq("user_id", userId);
          log("Subscription activated", { userId, plan });

        } else if (session.mode === "payment") {
          // One-time purchase
          const productTypeMap: Record<string, string> = {
            "price_1T3irCI0YZbTj9ITc6u9ocSE": "coaching",
            "price_1T3irpI0YZbTj9IT8EtRTNW0": "audit_perso",
            "price_1T3is2I0YZbTj9ITseeo04eS": "weekend",
            "price_1T3iq5I0YZbTj9ITnDSpkNWN": "studio_once",
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
              log("Could not retrieve product metadata", { product, error: String(e) });
            }
          }

          let productType = productTypeMap[priceId] || "unknown";
          if (isCreditPack) {
            productType = `credit_pack_${packCredits}`;
          }

          await supabase.from("purchases").insert({
            user_id: userId,
            product_type: productType,
            stripe_payment_intent_id: session.payment_intent as string,
            stripe_checkout_session_id: session.id,
            amount: (session.amount_total || 0) / 100,
            currency: session.currency || "eur",
            status: "paid",
          });

          // Credit pack: increment bonus_credits
          if (isCreditPack && packCredits > 0) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("bonus_credits")
              .eq("user_id", userId)
              .single();
            const currentBonus = profile?.bonus_credits || 0;
            await supabase
              .from("profiles")
              .update({ bonus_credits: currentBonus + packCredits })
              .eq("user_id", userId);
            log("Bonus credits added", { userId, packCredits, newTotal: currentBonus + packCredits });
          }

          // If studio one-time, activate studio plan
          if (productType === "studio_once") {
            await supabase.from("subscriptions").upsert({
              user_id: userId,
              plan: "studio",
              stripe_customer_id: session.customer as string,
              status: "active",
              studio_months_paid: 6,
              studio_start_date: new Date().toISOString(),
              studio_end_date: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" });
            await supabase.from("profiles").update({ current_plan: "studio" }).eq("user_id", userId);
          }

          log("Purchase recorded", { userId, productType });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id;
        if (!userId) break;

        await supabase.from("subscriptions").update({
          status: sub.status === "active" ? "active" : sub.status,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          cancel_at: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
          canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        }).eq("user_id", userId);

        log("Subscription updated", { userId, status: sub.status });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id;
        if (!userId) break;

        await supabase.from("subscriptions").update({
          status: "canceled",
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("user_id", userId);

        await supabase.from("profiles").update({ current_plan: "free" }).eq("user_id", userId);
        log("Subscription canceled", { userId });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;

        await supabase.from("subscriptions").update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        }).eq("stripe_subscription_id", subId);

        log("Payment failed", { subId });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;

        // Increment studio_months_paid for studio plans
        const { data: subData } = await supabase
          .from("subscriptions")
          .select("plan, studio_months_paid")
          .eq("stripe_subscription_id", subId)
          .single();

        if (subData?.plan === "studio") {
          await supabase.from("subscriptions").update({
            studio_months_paid: (subData.studio_months_paid || 0) + 1,
            status: "active",
            updated_at: new Date().toISOString(),
          }).eq("stripe_subscription_id", subId);
        }

        log("Invoice paid", { subId });
        break;
      }
    }
  } catch (err) {
    log("Error processing event", { error: String(err) });
    return new Response("Processing error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
