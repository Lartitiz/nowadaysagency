import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";

const ADMIN_EMAIL = "laetitia@nowadaysagency.com";

// Séquences de relance/marketing : plusieurs tournent chaque matin (inactivité, crédits,
// digest hebdo, brouillons oubliés...) sans se coordonner entre elles. On plafonne à UNE
// SEULE de ces relances par personne et par 24h. Les événements transactionnels (inscription,
// paiement, résiliation) ne sont jamais plafonnés : ils restent hors de cette liste.
const CAPPED_TRIGGER_EVENTS = new Set([
  "inactive_7d", "inactive_14d", "inactive_30d",
  "credits_exhausted", "weekly_digest", "monthly_stats_report",
  "not_activated", "forgotten_draft_reminder",
]);

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Auth check: admin user OR internal service_role call
    const authHeader = req.headers.get("Authorization") || "";
    let isAuthorized = false;

    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");

      // Check if it's the service_role key (internal call)
      if (token === serviceRoleKey) {
        isAuthorized = true;
      } else {
        // Check if it's an admin user
        const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
        const { data: { user }, error } = await anonClient.auth.getUser(token);
        if (!error && user?.email === ADMIN_EMAIL) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { to, subject, html, from_name, template_id, sequence_id, user_id } = await req.json();

    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, subject, html" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const fromAddress = `${from_name || "Laetitia"} <hello@nowadaysagency.com>`;
    const recipients = Array.isArray(to) ? [...to] : [to];

    // Check if any recipient has unsubscribed
    for (let i = recipients.length - 1; i >= 0; i--) {
      const email = recipients[i];
      const { data: unsub } = await supabase
        .from("email_unsubscribes")
        .select("id")
        .eq("email", email.toLowerCase())
        .maybeSingle();

      if (unsub) {
        // Log as skipped, don't send — best-effort, l'exclusion du destinataire
        // a déjà eu lieu (recipients.splice ci-dessous) indépendamment de ce log.
        // eslint-disable-next-line nowadays/require-supabase-error-check -- log fire-and-forget volontaire, cf. justification ci-dessus
        await supabase.from("email_sends").insert({
          to_email: email,
          subject,
          status: "skipped",
          error: "Utilisatrice désabonnée",
          user_id: user_id || null,
          template_id: template_id || null,
          sequence_id: sequence_id || null,
        });
        recipients.splice(i, 1);
      }
    }

    // If no recipients left after filtering unsubscribes
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "All recipients unsubscribed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Plafond anti-cumul : si cet envoi vient d'une séquence de relance/marketing,
    // on limite à 1 par 24h ET à 2 par 30 jours glissants, toutes séquences de ce
    // type confondues. Les événements transactionnels ne sont jamais plafonnés.
    if (sequence_id && user_id) {
      const { data: thisSequence } = await supabase
        .from("email_sequences")
        .select("trigger_event")
        .eq("id", sequence_id)
        .maybeSingle();

      if (thisSequence?.trigger_event && CAPPED_TRIGGER_EVENTS.has(thisSequence.trigger_event)) {
        const { data: cappedSequences } = await supabase
          .from("email_sequences")
          .select("id")
          .in("trigger_event", [...CAPPED_TRIGGER_EVENTS]);
        const cappedSequenceIds = (cappedSequences || []).map((s: any) => s.id);

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600000).toISOString();
        const { data: recentSends } = await supabase
          .from("email_sends")
          .select("id, sent_at")
          .eq("user_id", user_id)
          .eq("status", "sent")
          .in("sequence_id", cappedSequenceIds)
          .gte("sent_at", thirtyDaysAgo);

        const sends = recentSends || [];
        const twentyFourHoursAgo = Date.now() - 24 * 3600000;
        const lastDay = sends.filter((s: any) => new Date(s.sent_at).getTime() >= twentyFourHoursAgo);

        const reason = lastDay.length >= 1
          ? "Plafond quotidien atteint (déjà une relance automatique dans les dernières 24h)"
          : sends.length >= MONTHLY_CAP
            ? `Plafond mensuel atteint (${MONTHLY_CAP} relances automatiques max par 30 jours)`
            : null;

        if (reason) {
          // eslint-disable-next-line nowadays/require-supabase-error-check -- log fire-and-forget volontaire, cf. justifications ci-dessus
          await supabase.from("email_sends").insert({
            to_email: recipients.join(", "),
            subject,
            status: "skipped",
            error: reason,
            user_id,
            template_id: template_id || null,
            sequence_id,
          });
          return new Response(JSON.stringify({ success: true, skipped: true, reason }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }


    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: recipients,
        subject,
        html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      const errorMsg = resendData?.message || resendData?.error || "Resend API error";
      console.error("Resend error:", resendResponse.status, errorMsg);

      // Log failed send — best-effort, l'échec Resend est déjà retourné au client ci-dessous.
      // eslint-disable-next-line nowadays/require-supabase-error-check -- log fire-and-forget volontaire, cf. justification ci-dessus
      await supabase.from("email_sends").insert({
        to_email: recipients.join(", "),
        subject,
        status: "failed",
        error: errorMsg,
        user_id: user_id || null,
        template_id: template_id || null,
        sequence_id: sequence_id || null,
      });

      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log successful send — best-effort, l'e-mail est déjà parti via Resend à ce stade.
    // eslint-disable-next-line nowadays/require-supabase-error-check -- log fire-and-forget volontaire, cf. justification ci-dessus
    await supabase.from("email_sends").insert({
      to_email: recipients.join(", "),
      subject,
      status: "sent",
      resend_id: resendData.id,
      user_id: user_id || null,
      template_id: template_id || null,
      sequence_id: sequence_id || null,
    });

    return new Response(JSON.stringify({ success: true, resend_id: resendData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-email error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});