// Kept beside its entry point so Lovable includes this handler in the bundle.
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const unavailable = () => json({ error: "Lecture de la synthèse impossible. Réessaie dans un instant.", retryable: true }, 503);

export async function sharedBrandingAccess(req: Request, sb: any, now = new Date()): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "GET") return json({ error: "Méthode non autorisée" }, 405);
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return json({ error: "Token manquant" }, 400);
  try {
    const { data: link, error } = await sb.from("shared_branding_links").select("*").eq("token", token).maybeSingle();
    if (error) return unavailable();
    if (!link || !link.is_active) return json({ error: "Lien invalide ou révoqué" }, 404);
    if (link.expires_at && (!Number.isFinite(Date.parse(link.expires_at)) || Date.parse(link.expires_at) <= now.getTime())) {
      return json({ error: "Ce lien a expiré" }, 410);
    }
    // The link cannot mix a workspace's branding with another account's profile.
    if (link.workspace_id) {
      const owner = await sb.from("workspace_members").select("user_id").eq("workspace_id", link.workspace_id).eq("role", "owner").maybeSingle();
      if (owner.error) return unavailable();
      if (!owner.data || owner.data.user_id !== link.user_id) return json({ error: "Le propriétaire doit recréer ce lien pour cet espace." }, 409);
    }
    const scoped = (table: string, fields: string) => {
      const q = sb.from(table).select(fields);
      return link.workspace_id ? q.eq("workspace_id", link.workspace_id) : q.eq("user_id", link.user_id).is("workspace_id", null);
    };
    const results = await Promise.all([
      sb.from("profiles").select("prenom, activite, mission").eq("user_id", link.user_id).maybeSingle(),
      scoped("storytelling", "id, title, is_primary, step_7_polished, pitch_short, pitch_medium, pitch_long").eq("is_primary", true).order("created_at").order("id"),
      scoped("persona", "id, label, is_primary, portrait_prenom, step_1_frustrations, step_2_transformation, step_3a_objections, step_3b_cliches, step_4_beautiful, step_4_inspiring, step_4_repulsive, step_4_feeling, portrait").order("created_at").order("id"),
      scoped("brand_profile", "voice_description, combat_cause, combat_fights, combat_alternative, combat_refusals, tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims, mission").maybeSingle(),
      scoped("brand_proposition", "version_final, version_one_liner, version_bio, version_pitch_naturel, version_site_web, version_engagee").maybeSingle(),
      scoped("brand_strategy", "pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3, creative_concept, facet_1, facet_2, facet_3").maybeSingle(),
      scoped("offers", "id, name, offer_type, price_text, promise, sales_line, target_ideal").order("created_at").order("id"),
    ]);
    if (results.some(r => r.error)) return unavailable();
    const [profile, stories, personas, voice, proposition, strategy, offers] = results.map(r => r.data);
    // Avoid returning content for a link revoked/expired during the reads.
    const current = await sb.from("shared_branding_links").select("is_active, expires_at, user_id, workspace_id").eq("id", link.id).maybeSingle();
    if (current.error) return unavailable();
    if (!current.data?.is_active) return json({ error: "Lien invalide ou révoqué" }, 404);
    if (current.data.user_id !== link.user_id || current.data.workspace_id !== link.workspace_id) return unavailable();
    if (current.data.expires_at && (!Number.isFinite(Date.parse(current.data.expires_at)) || Date.parse(current.data.expires_at) <= now.getTime())) return json({ error: "Ce lien a expiré" }, 410);
    // Cosmetic counter; failures must not erase successfully loaded branding.
    try {
      const { error: countError } = await sb.from("shared_branding_links").update({ views_count: (link.views_count || 0) + 1 }).eq("id", link.id);
      if (countError) console.warn("shared-branding-access: compteur de vues non actualisé");
    } catch { console.warn("shared-branding-access: compteur de vues indisponible"); }
    return json({
      title: link.title,
      link: { created_at: link.created_at, expires_at: current.data.expires_at },
      read_at: now.toISOString(),
      scope: "Tous les publics, les histoires marquées principales et toutes les offres de cet espace. Les données sont relues à chaque ouverture. Les brouillons d’histoires et leurs variantes non principales ne sont pas partagés.",
      profile: { prenom: profile?.prenom || null, activite: profile?.activite || null, mission: voice?.mission || profile?.mission || null },
      stories: stories || [], personas: personas || [],
      // Compatibility with an older frontend during the coordinated rollout.
      storytelling: stories?.length === 1 ? stories[0] : null,
      persona: personas?.length === 1 ? personas[0] : null,
      voice, proposition, strategy, offers: offers || [],
    });
  } catch { return unavailable(); }
}
