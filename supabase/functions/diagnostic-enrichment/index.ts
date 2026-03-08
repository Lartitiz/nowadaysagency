import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";

/**
 * Phase 2 enrichment for deep-diagnostic.
 * Runs in its own worker to avoid memory limits.
 * Called internally by deep-diagnostic via fetch (fire-and-forget).
 */

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify internal call via service role key
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (token !== serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId, workspaceId, userPrompt, savedDiagId } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    );

    const enrichmentSystemPrompt = `Tu es l'assistante com' de L'Assistant Com'. Tu reçois le contenu scrappé du site web et les réponses d'onboarding.

Ta mission : déduire un maximum d'informations sur son branding à partir de ce contenu.

- Utilise l'écriture inclusive avec le point médian.
- Tutoie.
- Pour le branding_prefill, déduis un maximum depuis le contenu scrappé. Si tu trouves des offres sur le site, liste-les. Si tu peux deviner l'histoire, résume-la. Si tu identifies des combats ou convictions, note-les. Mieux vaut proposer quelque chose que la personne modifiera plutôt que laisser vide.
- Pour les offres, cherche : pages services, tarifs, accompagnements, formations, produits.
- Pour le story_draft, utilise la page à propos, les réponses libres (uniqueness, positioning).
- Pour les combats, identifie les causes défendues, les refus assumés, les convictions fortes.
- Pour les content_pillars, identifie les 3 grands thèmes récurrents.

- Pour le voice_prefill, analyse le style d'écriture du contenu scrappé (site, LinkedIn). Identifie : le niveau de langue (soutenu, courant, familier), le rythme (phrases courtes/longues, alternance), les expressions récurrentes, les mots ou tournures à éviter car absents du vocabulaire de la personne.
- Pour le charter_prefill, identifie les couleurs dominantes visibles dans le contenu HTML du site (couleurs de fond, couleurs de texte, couleurs d'accent des boutons/liens). Identifie les polices si visible dans le CSS inline ou les font-family. Décris l'ambiance visuelle en 3 mots-clés. Si le site n'a pas été scrappé, mets tout à null.
- Pour le combat_structured, décompose les combats en 4 dimensions : la cause (pourquoi elle fait ça), les combats (contre quoi elle lutte), l'alternative (ce qu'elle propose à la place), les refus (ce qu'elle refuse de faire). Si une dimension n'est pas identifiable, mets null.

RÉPONDRE EN JSON (pas de markdown, pas de backticks) :

{
  "branding_prefill": {
    "positioning": "phrase de positionnement déduite ou null",
    "mission": "mission déduite ou null",
    "target_description": "description de la cible idéale déduite ou null",
    "tone_keywords": ["mot-clé 1", "mot-clé 2", "mot-clé 3"],
    "tone_style": "description du style de communication ou null",
    "combats": ["conviction 1", "conviction 2"],
    "values": ["valeur 1", "valeur 2", "valeur 3"],
    "content_pillars": ["pilier 1", "pilier 2", "pilier 3"],
    "story_draft": "2-4 phrases résumant le parcours ou null",
    "offers": [{ "name": "nom", "description": "description courte", "price": "prix ou null" }]
  },
  "voice_prefill": {
    "voice_summary": "description en 2-3 phrases de comment cette personne écrit ou null",
    "tone_patterns": ["pattern 1", "pattern 2"],
    "signature_expressions": ["expression 1", "expression 2"],
    "banned_expressions": ["expression à éviter 1", "expression à éviter 2"]
  },
  "charter_prefill": {
    "color_primary": "code hex ou null",
    "color_secondary": "code hex ou null",
    "color_accent": "code hex ou null",
    "color_background": "code hex ou null",
    "color_text": "code hex ou null",
    "font_title": "nom de la police ou null",
    "font_body": "nom de la police ou null",
    "mood_keywords": ["mot-clé 1", "mot-clé 2", "mot-clé 3"],
    "photo_style": "description ou null"
  },
  "combat_structured": {
    "combat_cause": "cause ou null",
    "combat_fights": "combats ou null",
    "combat_alternative": "alternative ou null",
    "combat_refusals": "refus ou null"
  }
}`;

    const opusModel = getModelForAction("branding_audit");
    const enrichmentRaw = await callAnthropicSimple(opusModel, enrichmentSystemPrompt, userPrompt, 0.7, 6144);

    let enrichmentResult: any;
    try {
      enrichmentResult = JSON.parse(enrichmentRaw);
    } catch {
      const jsonMatch = enrichmentRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) enrichmentResult = JSON.parse(jsonMatch[0]);
      else {
        console.error("Enrichment: could not parse response");
        return new Response(JSON.stringify({ success: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const prefill = enrichmentResult?.branding_prefill;
    if (!prefill) {
      return new Response(JSON.stringify({ success: false, reason: "no_prefill" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const filterCol = workspaceId ? "workspace_id" : "user_id";
    const filterVal = workspaceId || userId;

    // Update diagnostic_results with branding_prefill
    if (savedDiagId) {
      await supabaseAdmin.from("diagnostic_results")
        .update({ branding_prefill: prefill })
        .eq("id", savedDiagId);
    }

    // brand_profile upsert
    const { data: existingProfile } = await supabaseAdmin
      .from("brand_profile")
      .select("id, positioning, mission, tone_keywords, tone_style, combats, values, content_pillars, combat_cause, combat_fights, combat_alternative, combat_refusals")
      .eq(filterCol, filterVal)
      .maybeSingle();

    const combatData = prefill.combat_structured || enrichmentResult?.combat_structured;
    if (existingProfile) {
      const updates: Record<string, unknown> = {};
      if (!existingProfile.positioning && prefill.positioning) updates.positioning = prefill.positioning;
      if (!existingProfile.mission && prefill.mission) updates.mission = prefill.mission;
      if ((!existingProfile.tone_keywords || (Array.isArray(existingProfile.tone_keywords) && existingProfile.tone_keywords.length === 0)) && prefill.tone_keywords?.length) updates.tone_keywords = prefill.tone_keywords;
      if ((!existingProfile.values || (Array.isArray(existingProfile.values) && existingProfile.values.length === 0)) && prefill.values?.length) updates.values = prefill.values;
      if (!existingProfile.tone_style && prefill.tone_style) updates.tone_style = prefill.tone_style;
      if (!existingProfile.combats && prefill.combats?.length > 0) updates.combats = Array.isArray(prefill.combats) ? prefill.combats.join("\n") : prefill.combats;
      if ((!existingProfile.content_pillars || (Array.isArray(existingProfile.content_pillars) && existingProfile.content_pillars.length === 0)) && prefill.content_pillars?.length > 0) updates.content_pillars = prefill.content_pillars;
      if (!existingProfile.combat_cause && combatData?.combat_cause) updates.combat_cause = combatData.combat_cause;
      if (!existingProfile.combat_fights && combatData?.combat_fights) updates.combat_fights = combatData.combat_fights;
      if (!existingProfile.combat_alternative && combatData?.combat_alternative) updates.combat_alternative = combatData.combat_alternative;
      if (!existingProfile.combat_refusals && combatData?.combat_refusals) updates.combat_refusals = combatData.combat_refusals;
      if (Object.keys(updates).length > 0) await supabaseAdmin.from("brand_profile").update(updates).eq("id", existingProfile.id);
    } else {
      const newProfile: Record<string, unknown> = { user_id: userId, workspace_id: workspaceId };
      if (prefill.positioning) newProfile.positioning = prefill.positioning;
      if (prefill.mission) newProfile.mission = prefill.mission;
      if (prefill.tone_keywords?.length) newProfile.tone_keywords = prefill.tone_keywords;
      if (prefill.tone_style) newProfile.tone_style = prefill.tone_style;
      if (prefill.combats?.length) newProfile.combats = Array.isArray(prefill.combats) ? prefill.combats.join("\n") : prefill.combats;
      if (prefill.values?.length) newProfile.values = prefill.values;
      if (prefill.content_pillars?.length) newProfile.content_pillars = prefill.content_pillars;
      if (combatData?.combat_cause) newProfile.combat_cause = combatData.combat_cause;
      if (combatData?.combat_fights) newProfile.combat_fights = combatData.combat_fights;
      if (combatData?.combat_alternative) newProfile.combat_alternative = combatData.combat_alternative;
      if (combatData?.combat_refusals) newProfile.combat_refusals = combatData.combat_refusals;
      await supabaseAdmin.from("brand_profile").insert(newProfile);
    }

    // persona
    if (prefill.target_description) {
      const { data: existingPersona } = await supabaseAdmin
        .from("persona").select("id, description").eq(filterCol, filterVal)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existingPersona && !existingPersona.description) {
        await supabaseAdmin.from("persona").update({ description: prefill.target_description }).eq("id", existingPersona.id);
      } else if (!existingPersona) {
        await supabaseAdmin.from("persona").insert({ user_id: userId, workspace_id: workspaceId, description: prefill.target_description, is_primary: true });
      }
    }

    // offers
    if (prefill.offers?.length > 0) {
      const { count } = await supabaseAdmin.from("offers").select("id", { count: "exact", head: true }).eq(filterCol, filterVal);
      if ((count || 0) === 0) {
        const offersToInsert = prefill.offers.filter((o: any) => o.name || o.title).slice(0, 5)
          .map((o: any, i: number) => ({ user_id: userId, workspace_id: workspaceId, name: o.name || o.title, promise: o.description || null, price_text: o.price || null, offer_type: "paid", sort_order: i }));
        if (offersToInsert.length > 0) await supabaseAdmin.from("offers").insert(offersToInsert);
      }
    }

    // storytelling
    if (prefill.story_draft) {
      const { data: existingStory } = await supabaseAdmin.from("storytelling").select("id").eq(filterCol, filterVal).limit(1).maybeSingle();
      if (!existingStory) {
        await supabaseAdmin.from("storytelling").insert({ user_id: userId, workspace_id: workspaceId, imported_text: prefill.story_draft, source: "diagnostic_prefill", is_primary: true });
      }
    }

    // Resolve profileUserId for voice_profile and brand_charter
    let profileUserId = userId;
    if (workspaceId) {
      const { data: ownerRow } = await supabaseAdmin
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .eq("role", "owner")
        .maybeSingle();
      if (ownerRow?.user_id) profileUserId = ownerRow.user_id;
    }

    // voice_profile
    const voicePrefill = prefill.voice_prefill || enrichmentResult?.voice_prefill;
    if (voicePrefill && (voicePrefill.voice_summary || voicePrefill.tone_patterns?.length || voicePrefill.signature_expressions?.length)) {
      const { data: existingVoice } = await supabaseAdmin
        .from("voice_profile")
        .select("id, voice_summary, tone_patterns, signature_expressions, banned_expressions")
        .eq("user_id", profileUserId)
        .maybeSingle();

      if (existingVoice) {
        const vUpdates: Record<string, unknown> = {};
        if (!existingVoice.voice_summary && voicePrefill.voice_summary) vUpdates.voice_summary = voicePrefill.voice_summary;
        if ((!existingVoice.tone_patterns || (Array.isArray(existingVoice.tone_patterns) && existingVoice.tone_patterns.length === 0)) && voicePrefill.tone_patterns?.length) vUpdates.tone_patterns = voicePrefill.tone_patterns;
        if ((!existingVoice.signature_expressions || (Array.isArray(existingVoice.signature_expressions) && existingVoice.signature_expressions.length === 0)) && voicePrefill.signature_expressions?.length) vUpdates.signature_expressions = voicePrefill.signature_expressions;
        if ((!existingVoice.banned_expressions || (Array.isArray(existingVoice.banned_expressions) && existingVoice.banned_expressions.length === 0)) && voicePrefill.banned_expressions?.length) vUpdates.banned_expressions = voicePrefill.banned_expressions;
        if (Object.keys(vUpdates).length > 0) await supabaseAdmin.from("voice_profile").update(vUpdates).eq("id", existingVoice.id);
      } else {
        const newVoice: Record<string, unknown> = { user_id: profileUserId, workspace_id: workspaceId };
        if (voicePrefill.voice_summary) newVoice.voice_summary = voicePrefill.voice_summary;
        if (voicePrefill.tone_patterns?.length) newVoice.tone_patterns = voicePrefill.tone_patterns;
        if (voicePrefill.signature_expressions?.length) newVoice.signature_expressions = voicePrefill.signature_expressions;
        if (voicePrefill.banned_expressions?.length) newVoice.banned_expressions = voicePrefill.banned_expressions;
        await supabaseAdmin.from("voice_profile").insert(newVoice);
      }
    }

    // brand_charter
    const charterPrefill = prefill.charter_prefill || enrichmentResult?.charter_prefill;
    if (charterPrefill && (charterPrefill.color_primary || charterPrefill.font_title || charterPrefill.mood_keywords?.length)) {
      const { data: existingCharter } = await supabaseAdmin
        .from("brand_charter")
        .select("id, color_primary, color_secondary, color_accent, color_background, color_text, font_title, font_body, mood_keywords, photo_style")
        .eq(filterCol, filterVal)
        .maybeSingle();

      if (existingCharter) {
        const cUpdates: Record<string, unknown> = {};
        if (!existingCharter.color_primary && charterPrefill.color_primary) cUpdates.color_primary = charterPrefill.color_primary;
        if (!existingCharter.color_secondary && charterPrefill.color_secondary) cUpdates.color_secondary = charterPrefill.color_secondary;
        if (!existingCharter.color_accent && charterPrefill.color_accent) cUpdates.color_accent = charterPrefill.color_accent;
        if (!existingCharter.color_background && charterPrefill.color_background) cUpdates.color_background = charterPrefill.color_background;
        if (!existingCharter.color_text && charterPrefill.color_text) cUpdates.color_text = charterPrefill.color_text;
        if (!existingCharter.font_title && charterPrefill.font_title) cUpdates.font_title = charterPrefill.font_title;
        if (!existingCharter.font_body && charterPrefill.font_body) cUpdates.font_body = charterPrefill.font_body;
        if ((!existingCharter.mood_keywords || (Array.isArray(existingCharter.mood_keywords) && existingCharter.mood_keywords.length === 0)) && charterPrefill.mood_keywords?.length) cUpdates.mood_keywords = charterPrefill.mood_keywords;
        if (!existingCharter.photo_style && charterPrefill.photo_style) cUpdates.photo_style = charterPrefill.photo_style;
        if (Object.keys(cUpdates).length > 0) await supabaseAdmin.from("brand_charter").update(cUpdates).eq("id", existingCharter.id);
      } else {
        const newCharter: Record<string, unknown> = { user_id: profileUserId, workspace_id: workspaceId };
        if (charterPrefill.color_primary) newCharter.color_primary = charterPrefill.color_primary;
        if (charterPrefill.color_secondary) newCharter.color_secondary = charterPrefill.color_secondary;
        if (charterPrefill.color_accent) newCharter.color_accent = charterPrefill.color_accent;
        if (charterPrefill.color_background) newCharter.color_background = charterPrefill.color_background;
        if (charterPrefill.color_text) newCharter.color_text = charterPrefill.color_text;
        if (charterPrefill.font_title) newCharter.font_title = charterPrefill.font_title;
        if (charterPrefill.font_body) newCharter.font_body = charterPrefill.font_body;
        if (charterPrefill.mood_keywords?.length) newCharter.mood_keywords = charterPrefill.mood_keywords;
        if (charterPrefill.photo_style) newCharter.photo_style = charterPrefill.photo_style;
        await supabaseAdmin.from("brand_charter").insert(newCharter);
      }
    }

    console.log("Enrichment phase 2 completed successfully");
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Enrichment phase 2 failed:", e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
