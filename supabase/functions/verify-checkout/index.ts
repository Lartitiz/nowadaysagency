import { checkoutOffer, normalizedPaidPlan } from "../_shared/checkout-catalog.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders } from "../_shared/cors.ts";

export async function handleVerifyCheckoutRequest(req: Request, deps?: { db: any; stripe: any }): Promise<Response> {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const respond = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

  try {
    if (req.method !== "POST") return respond(405, { error: "Méthode non autorisée" });
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return respond(401, { error: "Connecte-toi pour vérifier ce paiement." });
    const { session_id: sessionId } = await req.json();
    if (typeof sessionId !== "string" || !/^cs_(test_|live_)?[a-zA-Z0-9]{8,}$/.test(sessionId)) {
      return respond(400, { error: "Lien de paiement invalide." });
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const secretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!deps && (!url || !serviceKey || !secretKey)) throw new Error("Configuration de paiement manquante");
    const db = deps?.db ?? createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: auth, error: authError } = await db.auth.getUser(authHeader.slice(7));
    if (authError || !auth.user) return respond(401, { error: "Reconnecte-toi pour vérifier ce paiement." });

    const stripe = deps?.stripe ?? new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.user_id !== auth.user.id) return respond(403, { error: "Ce paiement ne correspond pas à ton compte." });
    if (session.status !== "complete") return respond(200, { state: "incomplete" });
    if (!["paid", "no_payment_required"].includes(session.payment_status)) return respond(200, { state: "payment_pending" });
    const items = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 2 });
    if (items.data.length !== 1 || (items.data[0].quantity ?? 1) !== 1) throw new Error("invalid_checkout_items");
    const priceId = items.data[0].price?.id;
    const offer = checkoutOffer(priceId, session.mode);

    if (session.mode === "subscription") {
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!subscriptionId) return respond(200, { state: "pending" });
      const { data: row, error } = await db.from("subscriptions")
        .select("plan,status,source,stripe_price_id,current_period_end")
        .eq("user_id", auth.user.id)
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle();
      if (error) throw error;
      return respond(200, row?.source === "stripe" && ["active", "trialing"].includes(row.status) &&
          normalizedPaidPlan(row.plan) === offer.plan && row.stripe_price_id === priceId &&
          (!row.current_period_end || new Date(row.current_period_end).getTime() > Date.now())
        ? { state: "confirmed", kind: "subscription", plan: offer.plan }
        : { state: "pending" });
    }

    if (session.mode === "payment") {
      if (offer.credits) {
        const { data: grant, error } = await db.from("credit_grants").select("credits,price_id")
          .eq("checkout_session_id", session.id).eq("user_id", auth.user.id).maybeSingle();
        if (error) throw error;
        return respond(200, grant?.credits === offer.credits && grant?.price_id === priceId
          ? { state: "confirmed", kind: "credits", credits: grant.credits }
          : { state: "pending" });
      }
      const { data: row, error } = await db.from("purchases")
        .select("id,product_type,fulfillment_state")
        .eq("user_id", auth.user.id)
        .eq("stripe_checkout_session_id", session.id)
        .eq("status", "paid")
        .maybeSingle();
      if (error) throw error;
      return respond(200, row?.fulfillment_state === "fulfilled" && row.product_type === offer.product ? { state: "confirmed", kind: "purchase" } : { state: "pending" });
    }
    return respond(200, { state: "incomplete" });
  } catch (error) {
    console.error("[verify-checkout]", error);
    return respond(503, { error: "La vérification est momentanément indisponible. Réessaie dans quelques instants." });
  }
}

if (import.meta.main) serve(req => handleVerifyCheckoutRequest(req));
