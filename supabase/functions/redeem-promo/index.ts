import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
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

    // Create redemption
    await supabase.from("promo_redemptions").insert({
      user_id: userId,
      promo_code_id: promo.id,
      expires_at: expiresAt,
    });

    // Atomic increment uses
    await supabase.rpc("increment_promo_uses", { promo_id: promo.id });

    // Update profile plan
    await supabase
      .from("profiles")
      .update({ current_plan: promo.plan_granted })
      .eq("user_id", userId);

    // Upsert subscription
    await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        plan: promo.plan_granted,
        status: "active",
        source: "promo",
        current_period_end: expiresAt,
      },
      { onConflict: "user_id" }
    );

    // If now_pilot, auto-create coaching program + sessions + deliverables
    if (promo.plan_granted === "now_pilot") {
      // Check if program already exists
      const { data: existingProg } = await supabase
        .from("coaching_programs")
        .select("id")
        .eq("client_user_id", userId)
        .eq("status", "active")
        .maybeSingle();

      if (!existingProg) {
        // Find coach (Laetitia)
        const { data: coachProfile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("email", "laetitia@nowadaysagency.com")
          .maybeSingle();

        const startDate = new Date().toISOString().split("T")[0];
        const endD = new Date();
        endD.setMonth(endD.getMonth() + 6);
        const endDate = endD.toISOString().split("T")[0];

        const { data: prog } = await supabase
          .from("coaching_programs")
          .insert({
            client_user_id: userId,
            coach_user_id: coachProfile?.user_id || userId,
            start_date: startDate,
            end_date: endDate,
            current_phase: "strategy",
            current_month: 1,
            whatsapp_link: "https://wa.me/33614133921",
            status: "active",
          })
          .select()
          .single();

        if (prog) {
          // Create 9 sessions
          const sessions = [
            { n: 1, phase: "strategy", title: "Audit + positionnement", dur: 90 },
            { n: 2, phase: "strategy", title: "Cible, offres, ton", dur: 90 },
            { n: 3, phase: "strategy", title: "Ligne éditoriale", dur: 90 },
            { n: 4, phase: "strategy", title: "Calendrier + templates", dur: 90 },
            { n: 5, phase: "strategy", title: "Contenus + mise en place (1)", dur: 90 },
            { n: 6, phase: "strategy", title: "Contenus + mise en place (2)", dur: 90 },
            { n: 7, phase: "binome", title: "Revue mensuelle · Mois 4", dur: 120 },
            { n: 8, phase: "binome", title: "Revue mensuelle · Mois 5", dur: 120 },
            { n: 9, phase: "binome", title: "Bilan + autonomie · Mois 6", dur: 120 },
          ];

          await supabase.from("coaching_sessions").insert(
            sessions.map((s) => ({
              program_id: prog.id,
              session_number: s.n,
              phase: s.phase,
              title: s.title,
              duration_minutes: s.dur,
              status: "scheduled",
            }))
          );

          // Create 10 deliverables
          const deliverables = [
            { title: "Audit de communication", type: "audit", route: "/audit-branding" },
            { title: "Branding complet", type: "branding", route: "/branding" },
            { title: "Portrait cible", type: "persona", route: "/branding/cible" },
            { title: "Offres reformulées", type: "offers", route: "/branding/offres" },
            { title: "Ligne éditoriale", type: "editorial", route: "/branding/editorial" },
            { title: "Calendrier 3 mois", type: "calendar", route: "/calendrier" },
            { title: "Bio optimisée", type: "bio", route: "/instagram/bio" },
            { title: "10-15 contenus prêts", type: "content", route: "/calendrier" },
            { title: "Templates Canva", type: "templates", route: null },
            { title: "Plan de com' 6 mois", type: "plan", route: "/plan" },
          ];

          await supabase.from("coaching_deliverables").insert(
            deliverables.map((d) => ({
              program_id: prog.id,
              title: d.title,
              type: d.type,
              route: d.route,
              status: "pending",
            }))
          );
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      plan: promo.plan_granted,
      expires_at: expiresAt,
      code: upperCode,
    }), {
      headers: { ...cors, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...cors, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
