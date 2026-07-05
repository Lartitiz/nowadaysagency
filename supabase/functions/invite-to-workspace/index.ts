import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { corsHeaders } from "../_shared/cors.ts";

// Actions : "invite" (défaut, rétro-compatible), "list" (membres + invitations
// en attente), "revoke" (annuler une invitation en attente) et "preview"
// (résoudre une invitation par token pour la page /invite/:token). Tout passe
// par le service role car les RLS ne permettent ni de lire les profils des
// autres membres, ni de supprimer une invitation depuis le client, ni de lire
// le nom d'un workspace dont on n'est pas encore membre.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // 1. Parse body
    const { workspace_id, email, role, action, invitation_id, token } = await req.json();
    const act = action || "invite";

    // 2. Service client for privileged checks
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ─── action: preview ───
    // Avant le check d'auth : la page /invite/:token doit s'afficher même
    // sans compte (l'invitée n'est pas encore connectée). Le token secret
    // fait office de capacité — le détenir suffit à voir cette invitation.
    if (act === "preview") {
      if (!token) return json({ error: "token est requis" }, 400);
      const { data: invite, error: previewErr } = await sb
        .from("workspace_invitations")
        .select("id, workspace_id, email, role, workspaces:workspace_id(name)")
        .eq("token", token)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (previewErr) throw previewErr;
      if (!invite) {
        return json({ error: "Invitation introuvable, expirée ou déjà acceptée." }, 404);
      }
      const ws = invite.workspaces as { name?: string } | null;
      return json({
        success: true,
        invitation: {
          id: invite.id,
          workspace_id: invite.workspace_id,
          email: invite.email,
          role: invite.role,
          workspace_name: ws?.name ?? null,
        },
      });
    }

    // 3. Auth check (toutes les autres actions)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié" }, 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) return json({ error: "Non authentifié" }, 401);

    if (!workspace_id) {
      return json({ error: "workspace_id est requis" }, 400);
    }

    // 4. Check caller is owner or manager of the workspace
    const { data: membership } = await sb
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership || !["owner", "manager"].includes(membership.role)) {
      return json({ error: "Accès refusé. Tu dois être owner ou manager de cet espace." }, 403);
    }

    const origin = req.headers.get("origin") || "https://nowadays-assistant.fr";

    // ─── action: list ───
    if (act === "list") {
      const { data: members, error: membersErr } = await sb
        .from("workspace_members")
        .select("id, user_id, role, joined_at")
        .eq("workspace_id", workspace_id)
        .order("joined_at", { ascending: true });
      if (membersErr) throw membersErr;

      const userIds = (members || []).map((m) => m.user_id);
      const profilesById = new Map<string, { prenom: string | null; email: string | null }>();
      if (userIds.length > 0) {
        const { data: profiles, error: profilesErr } = await sb
          .from("profiles")
          .select("user_id, prenom, email")
          .in("user_id", userIds);
        if (profilesErr) throw profilesErr;
        for (const p of profiles || []) {
          profilesById.set(p.user_id, { prenom: p.prenom, email: p.email });
        }
      }

      const { data: invitations, error: invitesErr } = await sb
        .from("workspace_invitations")
        .select("id, email, role, created_at, expires_at, token")
        .eq("workspace_id", workspace_id)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (invitesErr) throw invitesErr;

      // Auto-réparation : l'UPDATE de accepted_at par l'invitée (InvitePage,
      // RLS côté client) ne prend pas toujours effet — une invitation dont
      // l'email est déjà membre est en réalité acceptée. On la marque ici via
      // service role et on ne la renvoie pas comme pendante.
      const memberEmails = new Set(
        [...profilesById.values()].map((p) => p.email?.toLowerCase()).filter(Boolean),
      );
      const staleIds = (invitations || [])
        .filter((i) => memberEmails.has(i.email.toLowerCase()))
        .map((i) => i.id);
      if (staleIds.length > 0) {
        const { error: healErr } = await sb
          .from("workspace_invitations")
          .update({ accepted_at: new Date().toISOString() })
          .in("id", staleIds);
        if (healErr) console.error("[list] auto-heal accepted_at failed:", healErr);
      }
      const pendingInvitations = (invitations || []).filter((i) => !staleIds.includes(i.id));

      return json({
        success: true,
        members: (members || []).map((m) => ({
          id: m.id,
          user_id: m.user_id,
          role: m.role,
          joined_at: m.joined_at,
          prenom: profilesById.get(m.user_id)?.prenom || null,
          email: profilesById.get(m.user_id)?.email || null,
        })),
        invitations: pendingInvitations.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          created_at: i.created_at,
          expires_at: i.expires_at,
          invite_url: `${origin}/invite/${i.token}`,
        })),
      });
    }

    // ─── action: revoke ───
    if (act === "revoke") {
      if (!invitation_id) {
        return json({ error: "invitation_id est requis" }, 400);
      }
      const { data: deleted, error: deleteErr } = await sb
        .from("workspace_invitations")
        .delete()
        .eq("id", invitation_id)
        .eq("workspace_id", workspace_id)
        .is("accepted_at", null)
        .select("id");
      if (deleteErr) throw deleteErr;
      if (!deleted || deleted.length === 0) {
        return json({ error: "Invitation introuvable ou déjà acceptée." }, 404);
      }
      return json({ success: true });
    }

    // ─── action: invite (défaut) ───
    if (!email) {
      return json({ error: "workspace_id et email sont requis" }, 400);
    }

    const inviteRole = role || "manager";
    if (!["manager"].includes(inviteRole)) {
      return json({ error: "Rôle invalide. Seul le rôle 'manager' est disponible pour le moment." }, 400);
    }

    // 5. Check if email is already a member
    const { data: profileMatch } = await sb
      .from("profiles")
      .select("user_id")
      .ilike("email", email.toLowerCase())
      .maybeSingle();
    const targetUserId = profileMatch?.user_id || null;

    if (targetUserId) {
      const { data: alreadyMember } = await sb
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (alreadyMember) {
        return json({ error: "Cet email est déjà membre de cet espace." }, 409);
      }
    }

    // 6. Check if invitation already exists (pending)
    const { data: existingInvite } = await sb
      .from("workspace_invitations")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("email", email.toLowerCase())
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (existingInvite) {
      return json({ error: "Une invitation est déjà en attente pour cet email." }, 409);
    }

    // 7. Create invitation (token is auto-generated by DB default)
    const { data: invitation, error: insertErr } = await sb
      .from("workspace_invitations")
      .insert({
        workspace_id,
        email: email.toLowerCase(),
        role: inviteRole,
        invited_by: user.id,
      })
      .select("id, token")
      .single();

    if (insertErr) {
      console.error("Insert error:", insertErr);
      if (insertErr.code === "23505") {
        return json({ error: "Une invitation existe déjà pour cet email dans cet espace." }, 409);
      }
      throw insertErr;
    }

    // 8. Build invite URL
    const inviteUrl = `${origin}/invite/${invitation.token}`;

    return json({
      success: true,
      token: invitation.token,
      invite_url: inviteUrl,
      invitation_id: invitation.id,
    });
  } catch (e) {
    console.error("invite-to-workspace error:", e);
    return json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      500,
    );
  }
});
