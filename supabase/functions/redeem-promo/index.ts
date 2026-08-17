import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req); const cors = corsHeaders;
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non authentifié");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Non authentifié");

    const userId = userData.user.id;
    const { code } = await req.json();
    if (!code || typeof code !== "string") throw new Error("Code manquant");

    const upperCode = code.trim().toUpperCase();

    // Find the promo code
    const { data: promo, error: promoErr } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", upperCode)
      .eq("is_active", true)
      .single();

    if (promoErr || !promo) {
      return new Response(JSON.stringify({ error: "Code invalide ou expiré." }), {
        headers: { ...cors, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Check expiration
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Ce code a expiré." }), {
        headers: { ...cors, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Check max uses
    if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
      return new Response(JSON.stringify({ error: "Ce code a atteint son nombre maximum d'utilisations." }), {
        headers: { ...cors, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Check if user already redeemed this code
    const { data: existing } = await supabase
      .from("promo_redemptions")
      .select("id")
      .eq("user_id", userId)
      .eq("promo_code_id", promo.id)
      .single();

    if (existing) {
      return new Response(JSON.stringify({ error: "Tu as déjà utilisé ce code." }), {
        headers: { ...cors, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Calculate expiry
    let expiresAt: string | null = null;
    if (promo.duration_days) {
      const d = new Date();
      d.setDate(d.getDate() + promo.duration_days);
      expiresAt = d.toISOString();
    }

    // Normalize plan for display (legacy DB values may still say "now_pilot")
    const displayPlan = (promo.plan_granted === "now_pilot" || promo.plan_granted === "studio") ? "binome" : promo.plan_granted;

    // Redeem + grant the plan atomically: this single Postgres function records
    // the redemption, bumps the usage counter (re-checked under lock, so a
    // limited code can never be over-redeemed), and updates both profiles and
    // subscriptions. If any step fails, Postgres rolls back everything — we
    // never end up with { success: true } while the plan wasn't actually granted.
    const { error: grantError } = await supabase.rpc("redeem_promo_and_grant_plan", {
      p_promo_id: promo.id,
      p_user_id: userId,
      p_display_plan: displayPlan,
      p_raw_plan: promo.plan_granted,
      p_expires_at: expiresAt,
    });

    if (grantError) {
      if (grantError.message?.includes("promo_max_uses_reached")) {
        return new Response(JSON.stringify({ error: "Ce code a atteint son nombre maximum d'utilisations." }), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 400,
        });
      }
      console.error("redeem-promo: échec de redeem_promo_and_grant_plan", {
        userId,
        promoId: promo.id,
        code: upperCode,
        error: grantError,
      });
      return new Response(JSON.stringify({
        error: "Une erreur technique est survenue pendant l'activation du code. Réessaie dans quelques instants, ou contacte-nous si le problème persiste.",
      }), {
        headers: { ...cors, "Content-Type": "application/json" },
        status: 500,
      });
    }

    // If binome (or legacy now_pilot), auto-create coaching program + sessions + deliverables.
    // The plan itself is already legitimately granted at this point — this is a best-effort
    // cascade, so a failure here must NOT be silently swallowed as a plain success.
    let coachingSetupFailed = false;
    if (promo.plan_granted === "now_pilot" || promo.plan_granted === "binome") {
      const { data: coachProfile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("email", "laetitia@nowadaysagency.com")
        .maybeSingle();

      const startDate = new Date().toISOString().split("T")[0];
      const endD = new Date();
      endD.setMonth(endD.getMonth() + 6);
      const endDate = endD.toISOString().split("T")[0];

      // This RPC creates the program together with its 9 sessions and 10 deliverables
      // in one atomic transaction: either the whole space exists, or none of it does —
      // never a program with zero sessions/deliverables in it.
      const { error: coachingError } = await supabase.rpc("create_coaching_program_full", {
        p_client_user_id: userId,
        p_coach_user_id: coachProfile?.user_id || userId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_whatsapp_link: "https://wa.me/33614133921",
      });

      if (coachingError) {
        coachingSetupFailed = true;
        console.error("[CRITICAL] redeem-promo: le plan a été accordé mais la création de l'espace d'accompagnement a échoué — intervention manuelle requise", {
          userId,
          promoId: promo.id,
          code: upperCode,
          error: coachingError,
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      plan: displayPlan,
      expires_at: expiresAt,
      code: upperCode,
      ...(coachingSetupFailed ? {
        coachingSetupFailed: true,
        warning: "Ton code a bien été activé, mais on a eu un souci technique pour préparer ton espace d'accompagnement. On s'en occupe et on revient vers toi rapidement.",
      } : {}),
    }), {
      headers: { ...cors, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("redeem-promo error:", error);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      headers: { ...cors, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
