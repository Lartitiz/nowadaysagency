import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";


serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { idea, workspace_id } = await req.json();
    if (!idea) {
      return new Response(JSON.stringify({ error: "Missing idea" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Get user context
    let userContext = "";
    let authUserId: string | null = null;
    if (authHeader) {
      const anonSb = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user } } = await anonSb.auth.getUser(authHeader.replace("Bearer ", ""));
      if (user) {
        authUserId = user.id;
        const sbGuard = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const membership = await assertWorkspaceMembership(sbGuard, user.id, workspace_id);
        if (!membership.ok) {
          console.warn("[workspace-guard] denied", { userId: user.id, workspaceId: workspace_id });
          return workspaceDeniedResponse(corsHeaders);
        }
        const filterCol = workspace_id ? "workspace_id" : "user_id";
        const filterVal = workspace_id || user.id;
        // Resolve workspace owner for profile-scoped tables
        let profileUserId = user.id;
        if (workspace_id) {
          const { data: ownerRow } = await sb.from("workspace_members").select("user_id").eq("workspace_id", workspace_id).eq("role", "owner").maybeSingle();
          if (ownerRow?.user_id) profileUserId = ownerRow.user_id;
        }
        const [profileRes, brandRes, configRes] = await Promise.all([
          sb.from("profiles").select("activite, cible").eq("user_id", profileUserId).maybeSingle(),
          sb.from("brand_profile").select("mission, offer, target_description, channels").eq(filterCol, filterVal).maybeSingle(),
          sb.from("user_plan_config").select("channels").eq(filterCol, filterVal).maybeSingle(),
        ]);
        const p = profileRes.data;
        const b = brandRes.data;
        const c = configRes.data;
        if (p?.activite) userContext += `\nActivité : ${p.activite}`;
        if (b?.target_description || p?.cible) userContext += `\nCible : ${b?.target_description || p?.cible}`;
        if (b?.mission) userContext += `\nMission : ${b.mission}`;
        const channels = (c?.channels as string[]) || (b?.channels as string[]) || [];
        if (channels.length > 0) userContext += `\nCanaux actifs : ${channels.join(", ")}`;
      }
    }

    // Auth obligatoire : sinon l'endpoint (déployé et public) génère de l'IA gratuitement,
    // sans quota ni décompte. On exige une utilisatrice authentifiée avant l'appel IA.
    if (!authUserId) {
      return new Response(JSON.stringify({ error: "Authentification requise." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `L'utilisatrice a une idée de contenu mais ne sait pas quel format choisir. Analyse son idée et recommande le meilleur format.

Formats disponibles :
- post : Post Instagram (texte, image, carrousel). Idéal pour storytelling, partage d'expertise, contenus longs.
- reel : Reel Instagram (vidéo courte). Idéal pour tutos rapides, tendances, avant/après, contenus dynamiques.
- story : Story Instagram (séquence éphémère). Idéal pour coulisses, sondages, questions, contenus spontanés.
- linkedin : Post LinkedIn. Idéal pour expertise, réflexions pro, retours d'expérience.

Idée de l'utilisatrice : ${idea}
${userContext ? `\nContexte utilisatrice :${userContext}` : ""}

Réponds UNIQUEMENT en JSON valide (pas de markdown), avec ces champs :
{
  "format": "post" | "reel" | "story" | "linkedin",
  "format_label": "Post Instagram",
  "suggested_angle": "Storytelling personnel + leçon",
  "objective": "visibilite" | "confiance" | "vente" | "credibilite",
  "objective_label": "Confiance (créer du lien)",
  "reason": "Une phrase expliquant pourquoi ce format est adapté."
}`;

    // Quota AVANT l'appel IA (était généré sans aucune vérification de quota).
    if (authUserId) {
      const quota = await checkQuota(authUserId, "suggestion");
      if (!quota.allowed) return quotaDeniedResponse(quota, corsHeaders);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Tu es une assistante en stratégie de contenu. Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 400,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) throw new Error("Trop de requêtes, réessaie dans un moment.");
      if (status === 402) throw new Error("Crédits IA insuffisants.");
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const text = aiData.choices?.[0]?.message?.content || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Invalid AI response");
    const suggestion = JSON.parse(jsonMatch[0]);

    // Log usage (utilisateur déjà résolu plus haut — plus de getUser redondant).
    if (authUserId) {
      await logUsage(authUserId, "suggestion", "suggest_format");
    }

    return new Response(JSON.stringify(suggestion), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("suggest-format error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
