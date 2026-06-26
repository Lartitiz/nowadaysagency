// One-shot: copie SUPABASE_SERVICE_ROLE_KEY (env edge) -> vault 'supabase_service_role_key'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

Deno.serve(async (_req) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, srk);

  // Upsert via RPC SQL using service role over PostgREST is limited; use a SQL via rpc helper:
  const { error } = await supabase.rpc("vault_upsert_service_role_key", { p_value: srk });
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message, len: srk.length }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, len: srk.length }), {
    headers: { "content-type": "application/json" },
  });
});
