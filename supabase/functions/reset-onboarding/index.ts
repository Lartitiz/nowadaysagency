import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";

const ADMIN_EMAILS = ["laetitia@nowadaysagency.com", "laetitiamattioli@gmail.com"];

// Branding / diagnostic tables. TOUTES portent `workspace_id` SAUF
// `audit_validations` (clé `user_id, section`). C'est pourquoi le reset scopé
// par espace les supprime via workspace_id, et ne touche `audit_validations`
// (par user_id) QUE lors d'un reset de l'espace owner.
const BRANDING_TABLES = [
  "audit_recommendations",
  "branding_suggestions",
  "branding_summary",
  "branding_coaching_sessions",
  "branding_mirror_results",
  "branding_autofill",
  "branding_audits",
  "brand_charter",
  "brand_strategy",
  "brand_proposition",
  "brand_profile",
  "bio_versions",
  "storytelling",
  "persona",
  "offers",
  "voice_profile",
  "voice_guides",
  "shared_branding_links",
  "dismissed_suggestions",
  "instagram_audit",
  "instagram_audit_posts",
  "instagram_editorial_line",
  "linkedin_audit",
  "website_audit",
  "content_scores",
  "diagnostic_results",
];

// Sous-ensemble utilisé par le bouton « Réinitialiser tout le branding » de
// /branding (body.brandingOnly). Exécuté ici en service role car les policies
// DELETE de branding_coaching_sessions / branding_mirror_results sont scopées
// `auth.uid() = user_id` : un DELETE client par un·e manager sur l'espace d'une
// cliente laissait silencieusement les lignes écrites par la cliente (0 ligne
// matchée). Ne touche NI à l'onboarding NI au profil.
const BRANDING_ONLY_TABLES = [
  "storytelling",
  "persona",
  "brand_proposition",
  "brand_profile",
  "brand_strategy",
  "brand_charter",
  "offers",
  "branding_audits",
  "branding_coaching_sessions",
  "voice_profile",
  "branding_mirror_results",
];

const PROFILE_RESET = {
  onboarding_completed: false,
  onboarding_completed_at: null,
  onboarding_step: 0,
  canaux: [],
  main_blocker: null,
  main_goal: null,
  weekly_time: null,
  diagnostic_data: null,
  level: null,
  // ── Sources d'import : DOIVENT être vidées elles aussi ────────────────────
  // Sans ça, « repartir de zéro » effaçait le branding mais gardait le texte
  // « à propos » et les liens du run précédent. L'onboarding les re-pré-remplit
  // (use-onboarding, pré-remplissage depuis le profil), le champ « à propos »
  // se rouvre tout seul, et deep-diagnostic les remange → le NOUVEAU diagnostic
  // reconstruit à l'identique l'ANCIENNE identité. Un reset qui laisse ses
  // propres entrées derrière lui ne remet rien à zéro.
  linkedin_summary: null,
  instagram_username: null,
  website_url: null,
  linkedin_url: null,
  activity_detail: null,
};

const PLAN_CONFIG_RESET = {
  onboarding_completed: false,
  onboarding_completed_at: null,
  welcome_seen: false,
  main_goal: "",
  weekly_time: "",
};

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[reset-onboarding] No auth header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      console.error("[reset-onboarding] getUser failed:", authError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerUserId = user.id;
    const callerEmail = user.email as string;
    const isAdmin = ADMIN_EMAILS.includes(callerEmail);
    console.log(`[reset-onboarding] Caller: ${callerEmail} (${callerUserId})`);

    const body = await req.json().catch(() => ({}));
    const workspaceId: string | undefined = body.workspaceId;

    // Service role client (bypasses RLS)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    let tablesCleaned = 0;
    const errors: string[] = [];

    const del = async (table: string, col: string, val: string) => {
      try {
        const { error } = await admin.from(table).delete().eq(col, val);
        if (error) errors.push(`${table}: ${error.message}`);
        else tablesCleaned++;
      } catch (e: any) {
        errors.push(`${table}: ${e.message}`);
      }
    };

    if (workspaceId) {
      // ============================================================
      //  RESET SCOPÉ PAR ESPACE (chemin sûr — self-reset Réglages)
      //  Ne touche QUE le branding de CET espace. En modèle agence,
      //  une même `user_id` peut être owner/manager de plusieurs
      //  espaces : supprimer par `user_id` effacerait TOUS les espaces
      //  (dont ceux des clientes) d'un coup. Plus jamais.
      // ============================================================
      const { data: members, error: memErr } = await admin
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", workspaceId);
      if (memErr) {
        return new Response(JSON.stringify({ error: `workspace lookup: ${memErr.message}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const callerIsMember = (members || []).some((m) => m.user_id === callerUserId);
      if (!callerIsMember && !isAdmin) {
        console.error(`[reset-onboarding] Forbidden: ${callerEmail} not a member of ${workspaceId}`);
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // ─── Mode brandingOnly : reset branding de /branding, rien d'autre ───
      if (body.brandingOnly === true) {
        console.log(`[reset-onboarding] BRANDING-ONLY reset of ${workspaceId} by ${callerEmail}`);
        for (const table of BRANDING_ONLY_TABLES) {
          await del(table, "workspace_id", workspaceId);
        }
        // branding_autofill : on remet le statut à zéro sans supprimer la ligne
        // (la ligne porte l'état du flux). Contrainte check : none / pending_review
        // / completed — le « idle » du bouton historique n'a jamais été valide.
        const { error: autofillErr } = await admin
          .from("branding_autofill")
          .update({ autofill_status: "none", autofill_pending_review: false })
          .eq("workspace_id", workspaceId);
        if (autofillErr) errors.push(`branding_autofill: ${autofillErr.message}`);

        console.log(`[reset-onboarding] Branding-only done. Cleaned: ${tablesCleaned}, Errors: ${errors.length}`);
        return new Response(
          JSON.stringify({
            success: errors.length === 0,
            tables_cleaned: tablesCleaned,
            errors: errors.length > 0 ? errors : undefined,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const ownerUserId = (members || []).find((m) => m.role === "owner")?.user_id ?? null;
      console.log(`[reset-onboarding] WORKSPACE-scoped reset of ${workspaceId} by ${callerEmail} (owner=${ownerUserId})`);

      // Phase 1 : branding de l'espace uniquement
      for (const table of BRANDING_TABLES) {
        await del(table, "workspace_id", workspaceId);
      }

      // Phase 2 : reset au niveau utilisateur UNIQUEMENT si on réinitialise
      // SON propre espace (owner). Un·e manager qui réinitialise l'espace
      // d'une cliente ne doit PAS voir son propre profil remis à zéro.
      if (ownerUserId) {
        await del("audit_validations", "user_id", ownerUserId);

        const { error: profileErr } = await admin.from("profiles").update(PROFILE_RESET).eq("user_id", ownerUserId);
        if (profileErr) {
          console.error("[reset-onboarding] CRITICAL - profiles update failed:", profileErr.message);
          errors.push(`profiles update: ${profileErr.message}`);
        } else tablesCleaned++;

        const { error: usageErr } = await admin.from("ai_usage").delete().eq("user_id", ownerUserId).eq("category", "audit");
        if (usageErr) errors.push(`ai_usage cleanup: ${usageErr.message}`);

        const { error: configErr } = await admin.from("user_plan_config").update(PLAN_CONFIG_RESET).eq("user_id", ownerUserId);
        if (configErr) {
          console.error("[reset-onboarding] CRITICAL - user_plan_config update failed:", configErr.message);
          errors.push(`user_plan_config: ${configErr.message}`);
        } else tablesCleaned++;
      } else {
        console.log("[reset-onboarding] Espace sans owner (espace client géré) — pas de reset profil au niveau utilisateur.");
      }
    } else {
      // ============================================================
      //  RESET COMPTE ENTIER (par user_id) — outils ADMIN seulement
      //  « Remise à zéro totale » d'un compte (souvent mono-espace, ex
      //  compte de test). Supprime par user_id sur tous les espaces.
      //  N'est JAMAIS appelé par le bouton self-reset des Réglages
      //  (qui fournit désormais toujours un workspaceId).
      // ============================================================
      let targetUserId = callerUserId;
      if (body.targetUserId) {
        if (!isAdmin) {
          console.error(`[reset-onboarding] Forbidden: ${callerEmail} not in admin list`);
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        targetUserId = body.targetUserId;
      }
      // Garde-fou : un·e utilisateur·ice non-admin ne peut PAS lancer un reset
      // compte-entier (par user_id). Il/elle doit passer par le chemin scopé
      // espace (workspaceId). Empêche tout effacement multi-espaces accidentel.
      if (!isAdmin) {
        console.error(`[reset-onboarding] Refus reset compte-entier sans workspaceId pour ${callerEmail}`);
        return new Response(JSON.stringify({ error: "workspaceId requis" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.warn(`[reset-onboarding] ACCOUNT-wide reset (par user_id, sans workspaceId) de ${targetUserId} par ${callerEmail}`);

      for (const table of [...BRANDING_TABLES, "audit_validations"]) {
        await del(table, "user_id", targetUserId);
      }

      const { error: profileErr } = await admin.from("profiles").update(PROFILE_RESET).eq("user_id", targetUserId);
      if (profileErr) {
        console.error("[reset-onboarding] CRITICAL - profiles update failed:", profileErr.message);
        errors.push(`profiles update: ${profileErr.message}`);
      } else tablesCleaned++;

      const { error: usageErr } = await admin.from("ai_usage").delete().eq("user_id", targetUserId).eq("category", "audit");
      if (usageErr) errors.push(`ai_usage cleanup: ${usageErr.message}`);

      const { error: configErr } = await admin.from("user_plan_config").update(PLAN_CONFIG_RESET).eq("user_id", targetUserId);
      if (configErr) {
        console.error("[reset-onboarding] CRITICAL - user_plan_config update failed:", configErr.message);
        errors.push(`user_plan_config: ${configErr.message}`);
      } else tablesCleaned++;
    }

    console.log(`[reset-onboarding] Done. Cleaned: ${tablesCleaned}, Errors: ${errors.length}`);

    // Aligné sur le chemin brandingOnly (ligne ~194) : success reflète l'échec
    // réel plutôt que de renvoyer true même quand `profiles.update` (marqué
    // CRITICAL ci-dessus) a échoué.
    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        tables_cleaned: tablesCleaned,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[reset-onboarding] Fatal:", error);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500,
      headers: {
        ...getCorsHeaders(req),
        "Content-Type": "application/json",
      },
    });
  }
});
