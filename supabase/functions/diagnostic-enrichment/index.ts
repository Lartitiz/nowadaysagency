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

    const enrichmentSystemPrompt = `Tu es un·e expert·e en communication et branding. On te donne le contenu en ligne d'une entreprise ou d'un·e solopreneur·e ainsi que ses réponses d'onboarding. Ta mission : analyser tout ça et pré-remplir 7 sections de branding.

Pour chaque section, donne une réponse structurée en JSON. Sois concret·e, précis·e, et utilise les mots que la personne utilise elle-même sur ses supports. Ne sois pas générique.

Si tu n'as pas assez d'infos pour remplir une section, mets "confidence": "low" et explique ce qui manque. Si tu es confiant·e, mets "confidence": "high".

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans backticks.

Structure attendue :

{
  "branding_prefill": {
    "positioning": "phrase de positionnement déduite ou null",
    "mission": "mission déduite ou null",
    "target_description": "description de la cible idéale déduite ou null",
    "target_problem": "problème principal de la cible ou null",
    "target_beliefs": "croyances limitantes de la cible ou null",
    "tone_keywords": ["mot-clé 1", "mot-clé 2", "mot-clé 3"],
    "tone_style": "description du style de communication ou null",
    "combats": ["conviction 1", "conviction 2"],
    "values": ["valeur 1", "valeur 2", "valeur 3"],
    "content_pillars": ["pilier 1", "pilier 2", "pilier 3"],
    "story_draft": "2-4 phrases résumant le parcours ou null",
    "offers": [{ "name": "nom", "description": "description courte", "price": "prix ou null" }],
    "value_prop_sentence": "phrase de proposition de valeur ou null",
    "value_prop_problem": "problème résolu ou null",
    "value_prop_solution": "solution apportée ou null",
    "value_prop_difference": "différenciateur ou null",
    "value_prop_proof": "preuve ou null"
  },
  "voice_prefill": {
    "voice_summary": "description en 2-3 phrases de comment cette personne écrit ou null",
    "voice_description": "description du ton global (ex: 'Direct et chaleureux, comme une amie experte') ou null",
    "tone_register": "tutoiement ou vouvoiement",
    "tone_level": "accessible, expert, technique ou vulgarisateur",
    "tone_style_chip": "direct, poétique, storytelling, factuel ou autre",
    "tone_humor": "auto-dérision, absurde, pince-sans-rire, pas d'humour ou autre",
    "tone_engagement": "militant, discret ou modéré",
    "tone_patterns": ["pattern 1", "pattern 2"],
    "signature_expressions": ["expression 1", "expression 2"],
    "banned_expressions": ["expression à éviter 1", "expression à éviter 2"],
    "key_expressions": "expressions ou mots récurrents sur le site (séparés par des virgules) ou null",
    "things_to_avoid": "mots ou formulations que cette marque évite visiblement ou null",
    "target_verbatims": "phrases que la cible pourrait dire (déduit du positionnement) ou null",
    "channels": ["canaux de communication détectés"]
  },
  "charter_prefill": {
    "confidence": "high|medium|low",
    "color_primary": "code hex EXACT trouvé dans les données CSS/style_hints fournies, ou null",
    "color_secondary": "code hex EXACT ou null",
    "color_accent": "code hex EXACT ou null",
    "color_background": "code hex EXACT ou null",
    "color_text": "code hex EXACT ou null",
    "font_title": "nom EXACT de la police détectée dans les données CSS/Google Fonts fournies, ou null",
    "font_body": "nom EXACT de la police body détectée, ou null",
    "mood_keywords": ["mot-clé 1", "mot-clé 2", "mot-clé 3"],
    "photo_style": "description du style visuel global déduit des images et du ton du site, ou null"
  },
  "combat_structured": {
    "combat_cause": "pourquoi elle fait ça ou null",
    "combat_fights": "contre quoi elle lutte ou null",
    "combat_alternative": "ce qu'elle propose à la place ou null",
    "combat_refusals": "ce qu'elle refuse de faire ou null"
  },
  "persona_prefill": {
    "confidence": "high|medium|low",
    "description": "description courte du persona en une phrase ou null",
    "goals": ["objectif 1", "objectif 2"],
    "frustrations": ["frustration 1", "frustration 2"],
    "desires": ["désir 1", "désir 2"],
    "beautiful_world": "dans un monde idéal, à quoi ressemblerait la situation de cette personne ou null",
    "first_actions": "premières actions concrètes en travaillant avec cette marque ou null"
  },
  "content_strategy_prefill": {
    "confidence": "high|medium|low",
    "pillars": [{"label": "nom du pilier thématique", "description": "de quoi on parle concrètement dans ce pilier"}],
    "creative_twist": "angle créatif unique ou null",
    "formats": ["format 1", "format 2"],
    "rhythm": "rythme de publication détecté ou null",
    "editorial_line": "ligne éditoriale déduite ou null"
  }
}

Précisions importantes :
- Pour les offres, cherche : pages services, tarifs, accompagnements, formations, produits. Liste TOUTES les offres détectées.
- Pour le story_draft, utilise la page à propos, les réponses libres (uniqueness, positioning).
- Pour les combats, identifie les causes défendues, les refus assumés, les convictions fortes.
- CHARTE GRAPHIQUE — RÈGLE ABSOLUE : les champs color_* et font_* doivent contenir UNIQUEMENT des valeurs que tu trouves LITTÉRALEMENT dans les données fournies (sections "Couleurs détectées dans le CSS", "CSS variable", "Typographies détectées", "Google Fonts"). Si ces sections sont absentes ou vides, TOUS les champs color_* et font_* doivent être null. Ne JAMAIS inventer, deviner, ou déduire des couleurs à partir du contenu textuel ou de l'ambiance du site. Seul mood_keywords et photo_style peuvent être déduits du contenu. Si tu n'as pas de données CSS → confidence: "low" et tous les champs color/font à null.
- Pour le persona, déduis à partir du positionnement et du contenu : à qui s'adresse cette personne ?
- Pour la stratégie de contenu : les piliers sont des THÉMATIQUES DE CONTENU, pas des conseils génériques. Chaque pilier = un grand sujet dont la marque parle sur ses réseaux. Exemples : pour une céramiste → "Coulisses de l'atelier", "Rituels du quotidien", "L'artisanat comme acte militant". Pour une coach yoga → "Pratiques et postures", "Philosophie du corps", "Témoignages de transformation". Déduis 3-4 piliers CONCRETS à partir de l'activité, du positionnement et du contenu existant de la marque. Ne JAMAIS proposer des piliers génériques comme "Organisation", "Régularité", "Engagement communautaire" ou "Éducation" sans les lier à l'univers spécifique de la marque.
- Pour la proposition de valeur : synthétise en une phrase ce que cette marque apporte, à qui, et pourquoi c'est différent. Utilise le vocabulaire de la marque, pas du jargon marketing.
- Pour la proposition de valeur, synthétise le problème résolu, la solution et le différenciateur.`;

    const opusModel = getModelForAction("branding_audit");
    const enrichmentRaw = await callAnthropicSimple(opusModel, enrichmentSystemPrompt, userPrompt, 0.7, 8192);

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

    // brand_profile upsert — enriched with value proposition, target, tone details
    const { data: existingProfile } = await supabaseAdmin
      .from("brand_profile")
      .select("id, positioning, mission, tone_keywords, tone_style, combats, values, content_pillars, combat_cause, combat_fights, combat_alternative, combat_refusals, value_prop_sentence, value_prop_problem, value_prop_solution, value_prop_difference, value_prop_proof, target_description, target_problem, target_beliefs, voice_description, tone_register, tone_level, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims, channels")
      .eq(filterCol, filterVal)
      .maybeSingle();

    const combatData = prefill.combat_structured || enrichmentResult?.combat_structured;
    const voicePrefill = prefill.voice_prefill || enrichmentResult?.voice_prefill;

    const buildProfileFields = (target: Record<string, unknown>, existing: any) => {
      const setIfEmpty = (field: string, value: unknown) => {
        if (value && (!existing || !existing[field])) target[field] = value;
      };
      const setArrayIfEmpty = (field: string, value: unknown[]) => {
        if (value?.length > 0 && (!existing || !existing[field] || (Array.isArray(existing[field]) && existing[field].length === 0))) {
          target[field] = value;
        }
      };

      setIfEmpty("positioning", prefill.positioning);
      setIfEmpty("mission", prefill.mission);
      setIfEmpty("target_description", prefill.target_description);
      setIfEmpty("target_problem", prefill.target_problem);
      setIfEmpty("target_beliefs", prefill.target_beliefs);
      setIfEmpty("tone_style", prefill.tone_style);
      setIfEmpty("value_prop_sentence", prefill.value_prop_sentence);
      setIfEmpty("value_prop_problem", prefill.value_prop_problem);
      setIfEmpty("value_prop_solution", prefill.value_prop_solution);
      setIfEmpty("value_prop_difference", prefill.value_prop_difference);
      setIfEmpty("value_prop_proof", prefill.value_prop_proof);
      setArrayIfEmpty("tone_keywords", prefill.tone_keywords);
      setArrayIfEmpty("values", prefill.values);
      setArrayIfEmpty("content_pillars", prefill.content_pillars);

      if (prefill.combats?.length > 0 && (!existing || !existing.combats)) {
        target.combats = Array.isArray(prefill.combats) ? prefill.combats.join("\n") : prefill.combats;
      }

      if (combatData) {
        setIfEmpty("combat_cause", combatData.combat_cause);
        setIfEmpty("combat_fights", combatData.combat_fights);
        setIfEmpty("combat_alternative", combatData.combat_alternative);
        setIfEmpty("combat_refusals", combatData.combat_refusals);
      }

      // Voice/tone enriched fields from voice_prefill → brand_profile
      if (voicePrefill) {
        setIfEmpty("voice_description", voicePrefill.voice_description);
        setIfEmpty("tone_register", voicePrefill.tone_register);
        setIfEmpty("tone_level", voicePrefill.tone_level);
        setIfEmpty("tone_humor", voicePrefill.tone_humor);
        setIfEmpty("tone_engagement", voicePrefill.tone_engagement);
        setIfEmpty("key_expressions", voicePrefill.key_expressions);
        setIfEmpty("things_to_avoid", voicePrefill.things_to_avoid);
        setIfEmpty("target_verbatims", voicePrefill.target_verbatims);
        if (voicePrefill.channels?.length > 0 && (!existing || !existing.channels || (Array.isArray(existing.channels) && existing.channels.length === 0))) {
          target.channels = voicePrefill.channels;
        }
      }
    };

    if (existingProfile) {
      const updates: Record<string, unknown> = {};
      buildProfileFields(updates, existingProfile);
      if (Object.keys(updates).length > 0) await supabaseAdmin.from("brand_profile").update(updates).eq("id", existingProfile.id);
    } else {
      const newProfile: Record<string, unknown> = { user_id: userId, workspace_id: workspaceId };
      buildProfileFields(newProfile, null);
      await supabaseAdmin.from("brand_profile").insert(newProfile);
    }

    // persona — enriched with frustrations, beautiful_world
    const personaPrefill = enrichmentResult?.persona_prefill;
    const personaDesc = prefill.target_description || personaPrefill?.description;
    if (personaDesc || personaPrefill) {
      const { data: existingPersona } = await supabaseAdmin
        .from("persona").select("id, description, step_1_frustrations, step_2_transformation")
        .eq(filterCol, filterVal)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      if (existingPersona) {
        const pUpdates: Record<string, unknown> = {};
        if (!existingPersona.description && personaDesc) pUpdates.description = personaDesc;
        if (!existingPersona.step_1_frustrations && personaPrefill?.frustrations?.length) {
          pUpdates.step_1_frustrations = personaPrefill.frustrations.join("\n");
        }
        if (!existingPersona.step_2_transformation && personaPrefill?.beautiful_world) {
          pUpdates.step_2_transformation = personaPrefill.beautiful_world;
        }
        if (Object.keys(pUpdates).length > 0) await supabaseAdmin.from("persona").update(pUpdates).eq("id", existingPersona.id);
      } else {
        const newPersona: Record<string, unknown> = { user_id: userId, workspace_id: workspaceId, is_primary: true };
        if (personaDesc) newPersona.description = personaDesc;
        if (personaPrefill?.frustrations?.length) newPersona.step_1_frustrations = personaPrefill.frustrations.join("\n");
        if (personaPrefill?.beautiful_world) newPersona.step_2_transformation = personaPrefill.beautiful_world;
        await supabaseAdmin.from("persona").insert(newPersona);
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

    // brand_proposition — save value proposition if detected
    if (prefill.value_prop_sentence) {
      const { data: existingProp } = await supabaseAdmin
        .from("brand_proposition")
        .select("id, step_1_what, version_final")
        .eq(filterCol, filterVal)
        .maybeSingle();

      if (!existingProp) {
        await supabaseAdmin.from("brand_proposition").insert({
          user_id: userId,
          workspace_id: workspaceId,
          step_1_what: prefill.value_prop_sentence,
          version_final: prefill.value_prop_sentence,
        });
      }
    }

    // content_strategy → brand_strategy pillars
    const contentPrefill = enrichmentResult?.content_strategy_prefill;
    if (contentPrefill?.pillars?.length > 0) {
      const { data: existingStrategy } = await supabaseAdmin
        .from("brand_strategy")
        .select("id, pillar_major, pillar_minor_1, pillar_minor_2, creative_concept")
        .eq(filterCol, filterVal)
        .maybeSingle();

      const pillars = contentPrefill.pillars;
      if (existingStrategy) {
        // Mettre à jour : écraser le pillar_major générique de l'onboarding
        // et remplir les piliers mineurs et le concept créatif s'ils sont vides
        const sUpdates: Record<string, unknown> = {};
        if (pillars[0]?.label) sUpdates.pillar_major = pillars[0].label;
        if (!existingStrategy.pillar_minor_1 && pillars[1]?.label) sUpdates.pillar_minor_1 = pillars[1].label;
        if (!existingStrategy.pillar_minor_2 && pillars[2]?.label) sUpdates.pillar_minor_2 = pillars[2].label;
        if (!existingStrategy.creative_concept && contentPrefill.creative_twist) sUpdates.creative_concept = contentPrefill.creative_twist;
        if (Object.keys(sUpdates).length > 0) await supabaseAdmin.from("brand_strategy").update(sUpdates).eq("id", existingStrategy.id);
      } else {
        await supabaseAdmin.from("brand_strategy").insert({
          user_id: userId,
          workspace_id: workspaceId,
          pillar_major: pillars[0]?.label || null,
          pillar_minor_1: pillars[1]?.label || null,
          pillar_minor_2: pillars[2]?.label || null,
          creative_concept: contentPrefill.creative_twist || null,
        });
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
