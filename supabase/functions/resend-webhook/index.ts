import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload = await req.json();
    const eventType = payload.type;

    // Resend webhook events we care about
    if (!["email.opened", "email.clicked", "email.bounced", "email.complained"].includes(eventType)) {
      return new Response(JSON.stringify({ ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendId = payload.data?.email_id;
    if (!resendId) {
      return new Response(JSON.stringify({ error: "No email_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map Resend event to our status
    const statusMap: Record<string, string> = {
      "email.opened": "opened",
      "email.clicked": "clicked",
      "email.bounced": "bounced",
      "email.complained": "complained",
    };

    const newStatus = statusMap[eventType] || "sent";

    // Update email_sends — only "upgrade" status (don't go from clicked back to opened)
    const statusPriority: Record<string, number> = {
      sent: 1,
      opened: 2,
      clicked: 3,
      bounced: 4,
      complained: 5,
    };

    const { data: existing } = await supabase
      .from("email_sends")
      .select("id, status")
      .eq("resend_id", resendId)
      .maybeSingle();

    if (existing) {
      const currentPriority = statusPriority[existing.status] || 0;
      const newPriority = statusPriority[newStatus] || 0;

      // Only update if new status is higher priority
      if (newPriority > currentPriority) {
        await supabase
          .from("email_sends")
          .update({ status: newStatus })
          .eq("id", existing.id);
      }
    }

    return new Response(JSON.stringify({ success: true, event: eventType }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("resend-webhook error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
