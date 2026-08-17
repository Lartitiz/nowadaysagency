import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";

// Vérifie la signature Svix d'un webhook Resend (empêche l'injection de faux statuts).
async function verifySvixSignature(secret: string, headers: Headers, body: string): Promise<boolean> {
  try {
    const id = headers.get("svix-id");
    const timestamp = headers.get("svix-timestamp");
    const sigHeader = headers.get("svix-signature");
    if (!id || !timestamp || !sigHeader) return false;

    const secretBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
    const signedContent = `${id}.${timestamp}.${body}`;
    const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

    // svix-signature = "v1,<sig> v1,<sig2> …"
    return sigHeader.split(" ").some((part) => part.split(",")[1] === expected);
  } catch (e) {
    console.error("verifySvixSignature error:", e);
    return false;
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const raw = await req.text();

    // Vérif de signature : rejette les faux événements. Fail-open si le secret n'est pas
    // encore configuré (ne casse pas le webhook live ; à activer en posant RESEND_WEBHOOK_SECRET).
    const signingSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
    if (signingSecret) {
      const valid = await verifySvixSignature(signingSecret, req.headers, raw);
      if (!valid) {
        console.error("resend-webhook: signature invalide — événement rejeté");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("resend-webhook: RESEND_WEBHOOK_SECRET absent — signature non vérifiée");
    }

    const payload = JSON.parse(raw);
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
        const { error } = await supabase
          .from("email_sends")
          .update({ status: newStatus })
          .eq("id", existing.id);
        if (error) throw error;
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
