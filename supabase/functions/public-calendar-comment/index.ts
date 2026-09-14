import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
 const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
 const reply = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers });
 if (req.method === "OPTIONS") return new Response(null, { headers });
 if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
 try {
   const body = await req.json();
   const action = "comment";
   if (typeof body.token !== "string" || typeof body.calendar_post_id !== "string" || typeof body.content !== "string" || !["comment"].includes(action)) return reply({ error: "missing_fields" }, 400);
   const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
   const { data, error } = await db.rpc("public_calendar_write", {
     p_token: body.token, p_post_id: body.calendar_post_id, p_action: action, p_value: body.content,
     p_author: typeof body.author_name === "string" ? body.author_name : null,
     p_request_id: body.request_id || null, p_expected_updated_at: body.expected_updated_at || null,
   });
   if (error || !data) return reply({ error: "write_failed" }, 500);
   if (data.error) return reply({ error: data.error }, data.status || 400);
   return reply(data, 201);
 } catch { return reply({ error: "internal" }, 500); }
});
