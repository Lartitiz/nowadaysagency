import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";
import { validateInput, ValidationError, CreateCheckoutSchema } from "../_shared/input-validators.ts";

const log = (step: string, details?: any) => {
  console.log(`[CREATE-CHECKOUT] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Function invoked");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      log("ERROR: No authorization header");
      throw new Error("Non authentifié - pas de header Authorization");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError) {
      log("ERROR: Auth failed", { message: authError.message });
      throw new Error(`Erreur d'authentification: ${authError.message}`);
    }
    const user = data.user;
    if (!user?.email) throw new Error("Non authentifié");
    log("User authenticated", { email: user.email });

    const { priceId, mode, successUrl, cancelUrl } = validateInput(await req.json(), CreateCheckoutSchema);
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

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: mode === "subscription" ? "subscription" : "payment",
      success_url: successUrl || `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${origin}/parametres`,
      allow_promotion_codes: true,
      metadata: {
        user_id: user.id,
      },
    };

    // Prix du plan Binôme de com (studio_monthly) : engagement 6 mois
    const STUDIO_MONTHLY_PRICE_ID = "price_1T3ipcI0YZbTj9ITlKOQN5Tm";

    if (mode === "subscription") {
      sessionParams.subscription_data = {
        metadata: { user_id: user.id },
      };

      // Limiter à 6 mois uniquement pour le plan Binôme de com
      if (priceId === STUDIO_MONTHLY_PRICE_ID) {
        const cancelAt = new Date();
        cancelAt.setMonth(cancelAt.getMonth() + 6);
        sessionParams.subscription_data.cancel_at = Math.floor(cancelAt.getTime() / 1000);
        log("Studio plan: auto-cancel set", { cancelAt: cancelAt.toISOString() });
      }
    } else {
      sessionParams.payment_intent_data = {
        metadata: { user_id: user.id },
      };
    }

    log("Creating checkout session", { mode: sessionParams.mode, priceId });
    const session = await stripe.checkout.sessions.create(sessionParams);
    log("Checkout session created", { sessionId: session.id, url: session.url?.substring(0, 50) });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const status = error instanceof ValidationError ? 400 : 500;
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
});
