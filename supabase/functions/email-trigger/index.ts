import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const APP_URL = "https://nowadaysagency.lovable.app";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { event, user_id } = await req.json();

    if (!event) {
      return new Response(JSON.stringify({ error: "Missing event" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: any = {};

    switch (event) {
      case "signup":
        result = await handleSignup(supabase, user_id);
        break;
      case "check_inactive":
        result = await handleCheckInactive(supabase);
        break;
      case "check_credits":
        result = await handleCheckCredits(supabase);
        break;
      case "process_queue":
        result = await handleProcessQueue(supabase, supabaseUrl, serviceRoleKey);
        break;
      default:
        return new Response(JSON.stringify({ error: `Unknown event: ${event}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("email-trigger error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Helpers ───

async function alreadySent(supabase: any, userId: string, templateId: string): Promise<boolean> {
  const { data } = await supabase
    .from("email_sends")
    .select("id")
    .eq("user_id", userId)
    .eq("template_id", templateId)
    .eq("status", "sent")
    .limit(1);
  return (data?.length || 0) > 0;
}

async function alreadyQueued(supabase: any, userId: string, sequenceId: string): Promise<boolean> {
  const { data } = await supabase
    .from("email_queue")
    .select("id")
    .eq("user_id", userId)
    .eq("sequence_id", sequenceId)
    .eq("cancelled", false)
    .limit(1);
  return (data?.length || 0) > 0;
}

async function enqueueSequence(supabase: any, userId: string, triggerEvent: string): Promise<{ queued: number }> {
  // Find active sequence for this trigger
  const { data: sequences } = await supabase
    .from("email_sequences")
    .select("id")
    .eq("trigger_event", triggerEvent)
    .eq("is_active", true)
    .limit(1);

  if (!sequences?.length) return { queued: 0 };
  const sequence = sequences[0];

  // Check if already queued
  if (await alreadyQueued(supabase, userId, sequence.id)) return { queued: 0 };

  // Get steps
  const { data: steps } = await supabase
    .from("email_sequence_steps")
    .select("id, delay_hours")
    .eq("sequence_id", sequence.id)
    .order("step_number", { ascending: true });

  if (!steps?.length) return { queued: 0 };

  const now = new Date();
  const entries = steps.map((step: any) => ({
    user_id: userId,
    sequence_id: sequence.id,
    step_id: step.id,
    scheduled_at: new Date(now.getTime() + step.delay_hours * 3600000).toISOString(),
  }));

  await supabase.from("email_queue").insert(entries);
  return { queued: entries.length };
}

function resolveTemplate(html: string, subject: string, vars: Record<string, string>): { html: string; subject: string } {
  let resolvedHtml = html;
  let resolvedSubject = subject;
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = `{{${key}}}`;
    resolvedHtml = resolvedHtml.replaceAll(placeholder, value || "");
    resolvedSubject = resolvedSubject.replaceAll(placeholder, value || "");
  }
  return { html: resolvedHtml, subject: resolvedSubject };
}

// ─── Event Handlers ───

async function handleSignup(supabase: any, userId: string): Promise<any> {
  if (!userId) return { error: "user_id required for signup" };
  const result = await enqueueSequence(supabase, userId, "signup");
  return { event: "signup", user_id: userId, ...result };
}

async function handleCheckInactive(supabase: any): Promise<any> {
  // Get users inactive for 7+ days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000).toISOString();

  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (!users?.users?.length) return { event: "check_inactive", checked: 0, triggered: 0 };

  const inactiveUsers = users.users.filter(
    (u: any) => u.last_sign_in_at && new Date(u.last_sign_in_at) < new Date(sevenDaysAgo)
  );

  let triggered = 0;
  for (const user of inactiveUsers) {
    const result = await enqueueSequence(supabase, user.id, "inactive_7d");
    if (result.queued > 0) triggered++;
  }

  return { event: "check_inactive", checked: inactiveUsers.length, triggered };
}

async function handleCheckCredits(supabase: any): Promise<any> {
  // Find free users who have used >= 10 credits
  const { data: heavyUsers } = await supabase
    .from("ai_usage")
    .select("user_id")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 3600000).toISOString());

  if (!heavyUsers?.length) return { event: "check_credits", checked: 0, triggered: 0 };

  // Count per user
  const counts: Record<string, number> = {};
  for (const row of heavyUsers) {
    counts[row.user_id] = (counts[row.user_id] || 0) + 1;
  }

  // Filter users with >= 10 uses
  const exhaustedUserIds = Object.entries(counts)
    .filter(([, count]) => count >= 10)
    .map(([uid]) => uid);

  // Check which are on free plan
  let triggered = 0;
  for (const uid of exhaustedUserIds) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan")
      .eq("user_id", uid)
      .limit(1);

    const plan = sub?.[0]?.plan || "free";
    if (plan !== "free") continue;

    const result = await enqueueSequence(supabase, uid, "credits_exhausted");
    if (result.queued > 0) triggered++;
  }

  return { event: "check_credits", checked: exhaustedUserIds.length, triggered };
}

async function handleProcessQueue(supabase: any, supabaseUrl: string, serviceRoleKey: string): Promise<any> {
  const now = new Date().toISOString();

  // Get pending queue entries
  const { data: pending } = await supabase
    .from("email_queue")
    .select("id, user_id, sequence_id, step_id")
    .lte("scheduled_at", now)
    .eq("sent", false)
    .eq("cancelled", false)
    .limit(50);

  if (!pending?.length) return { event: "process_queue", processed: 0 };

  let processed = 0;
  let errors = 0;

  for (const entry of pending) {
    try {
      // Get step → template
      const { data: step } = await supabase
        .from("email_sequence_steps")
        .select("template_id")
        .eq("id", entry.step_id)
        .single();

      if (!step?.template_id) {
        await supabase.from("email_queue").update({ cancelled: true }).eq("id", entry.id);
        continue;
      }

      // Get template
      const { data: template } = await supabase
        .from("email_templates")
        .select("subject, html_body, is_active")
        .eq("id", step.template_id)
        .single();

      if (!template?.is_active) {
        await supabase.from("email_queue").update({ cancelled: true }).eq("id", entry.id);
        continue;
      }

      // Deduplicate: check if already sent
      if (await alreadySent(supabase, entry.user_id, step.template_id)) {
        await supabase.from("email_queue").update({ sent: true }).eq("id", entry.id);
        continue;
      }

      // Get user info
      const { data: profile } = await supabase
        .from("profiles")
        .select("prenom, email, activite")
        .eq("user_id", entry.user_id)
        .single();

      if (!profile?.email) {
        await supabase.from("email_queue").update({ cancelled: true }).eq("id", entry.id);
        continue;
      }

      // Resolve template variables
      const vars = {
        prenom: profile.prenom || "",
        activite: profile.activite || "",
        email: profile.email,
        app_url: APP_URL,
      };
      const resolved = resolveTemplate(template.html_body, template.subject, vars);

      // Call send-email function
      const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: profile.email,
          subject: resolved.subject,
          html: resolved.html,
          template_id: step.template_id,
          sequence_id: entry.sequence_id,
          user_id: entry.user_id,
        }),
      });

      const sendData = await sendRes.json();

      if (sendData.success) {
        await supabase.from("email_queue").update({ sent: true }).eq("id", entry.id);
        processed++;
      } else {
        console.error(`Failed to send email for queue ${entry.id}:`, sendData.error);
        errors++;
      }
    } catch (err) {
      console.error(`Error processing queue entry ${entry.id}:`, err);
      errors++;
    }
  }

  return { event: "process_queue", processed, errors, total: pending.length };
}
