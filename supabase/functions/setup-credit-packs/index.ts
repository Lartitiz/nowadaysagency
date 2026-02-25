import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const packs = [
      { name: "Pack 10 crédits IA", amount: 390, credits: 10 },
      { name: "Pack 30 crédits IA", amount: 890, credits: 30 },
      { name: "Pack 60 crédits IA", amount: 1490, credits: 60 },
    ];

    const results = [];

    for (const pack of packs) {
      const product = await stripe.products.create({
        name: pack.name,
        metadata: { credits: String(pack.credits), type: "credit_pack" },
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: pack.amount,
        currency: "eur",
      });

      const entry = {
        productId: product.id,
        priceId: price.id,
        name: pack.name,
        credits: pack.credits,
        amount: pack.amount,
      };
      results.push(entry);
      console.log(`[SETUP-CREDIT-PACKS] Created: ${JSON.stringify(entry)}`);
    }

    return new Response(JSON.stringify({ success: true, packs: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[SETUP-CREDIT-PACKS] ERROR: ${msg}`);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
