import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { trackError } from "@/lib/error-tracker";
import { toast } from "sonner";

export interface CompletionCtx {
  column: string;
  value: string;
  profileUserId: string;
  workspaceId: string;
}

interface SimpleMessage {
  role: string;
  content: string;
}

/** Generates the full first-person story from the coaching conversation and writes it to the existing primary storytelling row, if any. Runs once, when the "story" section completes. */
export async function generateAndSaveFullStory(
  updatedMessages: SimpleMessage[],
  checklist: string[],
  ctx: CompletionCtx,
  fetchContext: () => Promise<any>
): Promise<void> {
  try {
    const aiCtx = await fetchContext();
    const { data: storyGenData } = await invokeWithTimeout("branding-coaching", {
      body: {
        user_id: ctx.profileUserId,
        workspace_id: ctx.workspaceId,
        section: "story_generate",
        messages: [
          ...updatedMessages,
          { role: "user", content: "Maintenant, écris mon histoire complète en un texte fluide et engageant, à la première personne. Utilise tout ce que je t'ai raconté." }
        ],
        context: aiCtx,
        covered_topics: checklist,
      },
    // 130s : "story_generate" est un appel unique borné à 120s côté edge, marge après.
    }, 130000);
    const generatedStory = storyGenData?.response?.question || (typeof storyGenData?.response === "string" ? storyGenData.response : "");
    if (typeof generatedStory === "string" && generatedStory.length > 50) {
      const { data: existing } = await (supabase.from("storytelling") as any)
        .select("id")
        .eq(ctx.column, ctx.value)
        .eq("is_primary", true)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await (supabase.from("storytelling") as any)
          .update({ step_6_full_story: generatedStory, completed: true, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      }
    } else {
      // L'IA n'a pas renvoyé un texte exploitable (vide ou trop court) : le
      // fragment brut reste enregistré (saveStoryInsights), mais la version
      // "racontée" ne l'est pas — le dire plutôt que laisser croire que
      // l'histoire complète a été rédigée.
      throw new Error("full story: réponse IA vide ou trop courte");
    }
  } catch (e) {
    console.error("[BrandingCoaching] Error generating full story:", e);
    toast.error("Ton histoire brute est enregistrée, mais je n'ai pas réussi à en rédiger la version complète. Retourne dans ta fiche storytelling pour relancer la génération.");
  }
}

const PERSONA_TARGET_FIELDS = [
  "step_1_frustrations", "step_2_transformation", "step_3a_objections",
  "step_3b_cliches", "step_4_beautiful", "step_4_inspiring",
  "step_4_repulsive", "step_4_feeling", "step_5_actions"
];

const PERSONA_FIELD_LABELS: Record<string, string> = {
  step_1_frustrations: "Ses frustrations profondes",
  step_2_transformation: "Sa transformation rêvée",
  step_3a_objections: "Ses objections principales",
  step_3b_cliches: "Les clichés / croyances à déconstruire",
  step_4_beautiful: "Ce qu'elle trouve beau (direction esthétique)",
  step_4_inspiring: "Ce qui l'inspire (personnes, marques, contenus)",
  step_4_repulsive: "Ce qui la rebute visuellement",
  step_4_feeling: "Ce qu'elle a besoin de ressentir (émotion recherchée)",
  step_5_actions: "Ses premières actions / déclencheurs d'achat",
};

// AI alias keys → real DB columns, in case the model doesn't use the exact field names asked for.
const PERSONA_FILL_ALIAS_MAP: Record<string, string> = {
  objections_courantes: "step_3a_objections",
  objections: "step_3a_objections",
  freins_achat: "step_3a_objections",
  freins: "step_3a_objections",
  croyances_limitantes: "step_3b_cliches",
  croyances: "step_3b_cliches",
  cliches: "step_3b_cliches",
  declencheurs_achat: "step_5_actions",
  declencheurs: "step_5_actions",
  premieres_actions: "step_5_actions",
  actions: "step_5_actions",
  frustrations_profondes: "step_1_frustrations",
  frustrations: "step_1_frustrations",
  transformation_revee: "step_2_transformation",
  transformation: "step_2_transformation",
  objectif_principal: "step_2_transformation",
  beau: "step_4_beautiful",
  esthetique: "step_4_beautiful",
  inspirant: "step_4_inspiring",
  inspiration: "step_4_inspiring",
  repoussant: "step_4_repulsive",
  rebute: "step_4_repulsive",
  ressenti: "step_4_feeling",
  emotion: "step_4_feeling",
};

/** Fills whichever persona fields are still empty, using the full coaching conversation as source material. No-op if every target field is already filled. Errors here are NOT caught locally — they propagate to the caller so pitch generation is correctly skipped when this fails, matching the previous inline behavior. */
async function fillMissingPersonaFields(
  currentPersona: Record<string, any>,
  updatedMessages: SimpleMessage[],
  checklist: string[],
  ctx: CompletionCtx,
  fetchContext: () => Promise<any>
): Promise<void> {
  const missingFields = PERSONA_TARGET_FIELDS.filter(f => {
    const v = currentPersona[f];
    return !v || (typeof v === "string" && v.trim().length === 0);
  });

  if (missingFields.length === 0) return;

  const missingList = missingFields.map(f => `- "${f}": ${PERSONA_FIELD_LABELS[f]}`).join("\n");
  const aiCtx = await fetchContext();
  const simpleMsgs = updatedMessages.map(m => ({ role: m.role, content: m.content }));

  const { data: fillData } = await invokeWithTimeout("branding-coaching", {
    body: {
      user_id: ctx.profileUserId,
      workspace_id: ctx.workspaceId,
      section: "persona_fill",
      messages: [
        ...simpleMsgs,
        { role: "user", content: `À partir de TOUTE notre conversation, extrais les informations pour remplir ces champs manquants. Si tu n'as pas d'info directe, déduis-la intelligemment à partir du contexte. Réponds UNIQUEMENT en JSON avec ces clés :\n${missingList}` }
      ],
      context: aiCtx,
      covered_topics: checklist,
    },
  // 130s : "persona_fill" est un appel unique borné à 120s côté edge, marge après.
  }, 130000);

  const fillResponse = fillData?.response;
  let fillInsights: Record<string, any> = {};
  if (fillResponse) {
    if (typeof fillResponse === "string") {
      try {
        fillInsights = JSON.parse(fillResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      } catch (e) { trackError(e, { where: "branding.coaching.fillInsights" }); toast.error("L'IA a renvoyé une réponse inattendue. Réessaie dans un instant."); }
    } else if (typeof fillResponse === "object") {
      fillInsights = fillResponse.extracted_insights || fillResponse;
    }
  }

  const normalized: Record<string, any> = { ...fillInsights };
  for (const [alias, realKey] of Object.entries(PERSONA_FILL_ALIAS_MAP)) {
    if (fillInsights[alias] && !normalized[realKey]) {
      normalized[realKey] = fillInsights[alias];
    }
  }

  const validFills: Record<string, string> = {};
  for (const f of missingFields) {
    const val = normalized[f];
    if (val && typeof val === "string" && val.trim().length > 0) {
      validFills[f] = val.trim();
    }
  }

  if (Object.keys(validFills).length > 0) {
    const { error } = await (supabase.from("persona") as any)
      .update({ ...validFills, updated_at: new Date().toISOString() })
      .eq("id", currentPersona.id);
    if (error) throw error;
    console.log(`[BrandingCoaching] Persona fill: ${Object.keys(validFills).length} missing fields filled`);
  } else if (fillResponse) {
    console.warn("[BrandingCoaching] Persona fill: AI responded but no exploitable keys. Received:",
      Object.keys(fillInsights), "Expected:", missingFields);
  }
}

/** Generates short/medium/long pitches for the persona and saves whichever ones came back. Has its own try/catch so a pitch failure never blocks the rest of section completion. */
async function generatePersonaPitches(currentPersona: Record<string, any>, ctx: CompletionCtx): Promise<void> {
  try {
    const { data: freshPersona } = await (supabase.from("persona") as any)
      .select("*")
      .eq("id", currentPersona.id)
      .maybeSingle();

    const { data: brandData } = await (supabase.from("brand_profile") as any)
      .select("activite, mission, offer, target_description, tone_register, voice_description, target_verbatims, combat_cause")
      .eq(ctx.column, ctx.value)
      .maybeSingle();

    const { data: pitchData } = await invokeWithTimeout("persona-ai", {
      body: {
        type: "pitch",
        persona: freshPersona || currentPersona,
        profile: brandData || {},
      },
    }, 60000);

    if (pitchData?.content) {
      let pitchParsed: any;
      try {
        pitchParsed = typeof pitchData.content === "string"
          ? JSON.parse(pitchData.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim())
          : pitchData.content;
      } catch (e) { trackError(e, { where: "branding.coaching.pitch" }); }

      if (pitchParsed) {
        const pitchUpdate: Record<string, string> = {};
        if (pitchParsed.short) pitchUpdate.pitch_short = pitchParsed.short;
        if (pitchParsed.medium) pitchUpdate.pitch_medium = pitchParsed.medium;
        if (pitchParsed.long) pitchUpdate.pitch_long = pitchParsed.long;

        if (Object.keys(pitchUpdate).length > 0) {
          const { error } = await (supabase.from("persona") as any)
            .update({ ...pitchUpdate, updated_at: new Date().toISOString() })
            .eq("id", currentPersona.id);
          if (error) throw error;
          console.log(`[BrandingCoaching] Persona pitches generated: ${Object.keys(pitchUpdate).join(", ")}`);
        }
      }
    }
  } catch (e) {
    console.error("[BrandingCoaching] Error generating persona pitches:", e);
  }
}

/** Resolves the current persona, fills its missing fields from the conversation, then generates its pitches. Runs once, when the "persona" section completes. */
export async function completePersonaSection(
  updatedMessages: SimpleMessage[],
  checklist: string[],
  ctx: CompletionCtx,
  resolvedPersonaId: string | null,
  fetchContext: () => Promise<any>
): Promise<void> {
  try {
    let personaQuery = (supabase.from("persona") as any).select("*");
    if (resolvedPersonaId) {
      personaQuery = personaQuery.eq("id", resolvedPersonaId);
    } else {
      personaQuery = personaQuery.eq(ctx.column, ctx.value).eq("is_primary", true);
    }
    const { data: currentPersona } = await personaQuery.maybeSingle();

    if (currentPersona?.id) {
      await fillMissingPersonaFields(currentPersona, updatedMessages, checklist, ctx, fetchContext);
      await generatePersonaPitches(currentPersona, ctx);
    }
  } catch (e) {
    console.error("[BrandingCoaching] Error in persona completion:", e);
  }
}
