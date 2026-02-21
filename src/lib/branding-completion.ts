import { supabase } from "@/integrations/supabase/client";

export interface BrandingCompletion {
  storytelling: number;
  persona: number;
  proposition: number;
  tone: number;
  strategy: number;
  total: number;
}

export interface BrandingRawData {
  storytellingList: any[] | null;
  persona: any | null;
  proposition: any | null;
  brandProfile: any | null;
  strategy: any | null;
}

export async function fetchBrandingData(userId: string): Promise<BrandingRawData> {
  const [stRes, perRes, propRes, toneRes, stratRes] = await Promise.all([
    supabase.from("storytelling").select("id, is_primary, completed, step_7_polished, imported_text").eq("user_id", userId),
    supabase.from("persona").select("step_1_frustrations, step_2_transformation, step_3a_objections, step_4_beautiful, step_5_actions").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_proposition").select("step_1_what, step_2a_process, step_2b_values, step_3_for_whom, version_final, version_pitch_naturel").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_profile").select("voice_description, combat_cause, combat_fights, combat_alternative, combat_refusals, tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims, channels").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_strategy").select("step_1_hidden_facets, facet_1, pillar_major, creative_concept").eq("user_id", userId).maybeSingle(),
  ]);

  return {
    storytellingList: stRes.data,
    persona: perRes.data,
    proposition: propRes.data,
    brandProfile: toneRes.data,
    strategy: stratRes.data,
  };
}

function filled(val: any): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === "string") return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

export function calculateBrandingCompletion(data: BrandingRawData): BrandingCompletion {
  // STORYTELLING: complete if at least 1 exists with polished text or imported text
  const hasStory = data.storytellingList && data.storytellingList.length > 0;
  const storytelling = hasStory ? 100 : 0;

  // PERSONA: 5 steps
  const per = data.persona;
  const personaFields = [
    per?.step_1_frustrations,
    per?.step_2_transformation,
    per?.step_3a_objections,
    per?.step_4_beautiful,
    per?.step_5_actions,
  ];
  const personaFilled = personaFields.filter(filled).length;
  const persona = Math.round((personaFilled / 5) * 100);

  // PROPOSITION: 4 checkpoints
  const prop = data.proposition;
  const propChecks = [
    prop?.step_1_what,
    prop?.step_2a_process || prop?.step_2b_values,
    prop?.step_3_for_whom,
    prop?.version_final || prop?.version_pitch_naturel,
  ];
  const propFilled = propChecks.filter(filled).length;
  const proposition = Math.round((propFilled / 4) * 100);

  // TONE: 7 sections from brand_profile
  const td = data.brandProfile;
  let toneCount = 0;
  const toneTotal = 7;
  if (td) {
    if (filled(td.voice_description)) toneCount++;
    if (filled(td.combat_cause) || filled(td.combat_fights)) toneCount++;
    const chips = [td.tone_register, td.tone_level, td.tone_style, td.tone_humor, td.tone_engagement];
    if (chips.some(filled)) toneCount++;
    if (filled(td.key_expressions)) toneCount++;
    if (filled(td.things_to_avoid)) toneCount++;
    if (filled(td.target_verbatims)) toneCount++;
    if (filled(td.channels)) toneCount++;
  }
  const tone = Math.round((toneCount / toneTotal) * 100);

  // STRATEGY: 3 steps (facets, pillars, creative concept)
  const st = data.strategy;
  const stratChecks = [
    st?.facet_1 || st?.step_1_hidden_facets,
    st?.pillar_major,
    st?.creative_concept,
  ];
  const stratFilled = stratChecks.filter(filled).length;
  const strategy = Math.round((stratFilled / 3) * 100);

  const total = Math.round((storytelling + persona + proposition + tone + strategy) / 5);

  return { storytelling, persona, proposition, tone, strategy, total };
}
