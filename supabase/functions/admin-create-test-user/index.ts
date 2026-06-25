import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { email, password, prenom } = await req.json();
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { prenom },
    });
    if (error) throw error;

    await admin.from("profiles").upsert(
      { user_id: data.user!.id, prenom, activite: "Compte test" },
      { onConflict: "user_id" }
    );

    return new Response(JSON.stringify({ ok: true, user_id: data.user!.id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
});
