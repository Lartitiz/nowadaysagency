import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const ADMIN_EMAIL = "laetitia@nowadaysagency.com";

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

    const { to, subject, html, from_name } = await req.json();

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
    const recipients = Array.isArray(to) ? to : [to];

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

      // Log failed send
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

    // Log successful send
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
