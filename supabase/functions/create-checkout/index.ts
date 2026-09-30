import { checkoutOffer } from "../_shared/checkout-catalog.ts";
import { paymentCheckout } from "./payment-checkout.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { validateInput, ValidationError, CreateCheckoutSchema } from "../_shared/input-validators.ts";
import { subscriptionCheckout, CheckoutConflict } from "./subscription-checkout.ts";

const log = (step: string, details?: any) => {
  console.log(`[CREATE-CHECKOUT] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

export async function handleCreateCheckoutRequest(req: Request) {
  const corsHeaders = getCorsHeaders(req); const cors = corsHeaders;
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Function invoked");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      log("ERROR: No authorization header");
      return new Response(JSON.stringify({ error: "Reconnecte-toi pour continuer." }), {
        headers: { ...cors, "Content-Type": "application/json" }, status: 401,
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data, error: authError } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (authError || !user?.email) {
      return new Response(JSON.stringify({ error: "Reconnecte-toi pour continuer." }), {
        headers: { ...cors, "Content-Type": "application/json" }, status: 401,
      });
    }
    log("User authenticated");

    const { priceId, mode, successUrl, cancelUrl } = validateInput(await req.json(), CreateCheckoutSchema);
    try { checkoutOffer(priceId, mode || "payment"); } catch { throw new ValidationError("Cette offre n’est pas disponible."); }
    log("Request body parsed", { priceId, mode });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      log("ERROR: STRIPE_SECRET_KEY not set");
      throw new Error("STRIPE_SECRET_KEY non configurée");
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
    });
    log("Stripe initialized");

    // Find or create Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      log("Found existing customer", { customerId });
    } else {
      log("No existing customer found, will use customer_email");
    }

    const origin = req.headers.get("origin") || "https://nowadaysagency.lovable.app";
    // Stripe returns only to pages on this app. Every success link carries the
    // Checkout session id; the page verifies it server-side before confirming.
    const success = new URL(successUrl || `${origin}/payment/success`);
    if (success.origin !== origin || success.pathname !== "/payment/success" || success.searchParams.has("session_id")) {
      throw new ValidationError("URL de retour de paiement invalide");
    }
    const cancel = new URL(cancelUrl || `${origin}/abonnement`);
    if (cancel.origin !== origin || !["/pricing", "/abonnement", "/services", "/parametres"].includes(cancel.pathname)) {
      throw new ValidationError("URL de retour d'annulation invalide");
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: mode === "subscription" ? "subscription" : "payment",
      success_url: `${success.toString()}${success.search ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel.toString(),
      allow_promotion_codes: true,
      metadata: {
        user_id: user.id,
      },
    };

    // Prix du plan Binôme de com (studio_monthly) : engagement 6 mois
    const isBinome = mode === "subscription" && checkoutOffer(priceId, "subscription").plan === "binome";

    if (mode === "subscription") {
      sessionParams.subscription_data = {
        metadata: {
          user_id: user.id,
          auto_cancel_6m: isBinome ? "true" : "false",
        },
      };
      if (isBinome) {
        log("Studio plan: will set cancel_at after subscription creation via webhook");
      }
    } else {
      sessionParams.payment_intent_data = {
        metadata: { user_id: user.id },
      };
    }

    log("Creating checkout session", { mode: sessionParams.mode, priceId });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const session = mode === "subscription"
      ? await subscriptionCheckout(stripe, admin, { id: user.id, email: user.email }, sessionParams)
      : await paymentCheckout(stripe, admin, user.id, sessionParams);
    log("Checkout session created", { sessionId: session.id, url: session.url?.substring(0, 50) });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...cors, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    if (error instanceof CheckoutConflict) {
      return new Response(JSON.stringify({ error: msg }), {
        headers: { ...cors, "Content-Type": "application/json" }, status: 409,
      });
    }
    if (error instanceof ValidationError) {
      return new Response(JSON.stringify({ error: msg }), {
        headers: { ...cors, "Content-Type": "application/json" },
        status: 400,
      });
    }
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      headers: { ...cors, "Content-Type": "application/json" },
      status: 500,
    });
  }
}

if (import.meta.main) serve(handleCreateCheckoutRequest);
