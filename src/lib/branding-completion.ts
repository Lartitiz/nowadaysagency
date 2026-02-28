import { supabase } from "@/integrations/supabase/client";

export interface BrandingCompletion {
  storytelling: number;
  persona: number;
  proposition: number;
  tone: number;
  strategy: number;
  offers: number;
  charter: number;
  total: number;
}

export interface BrandingRawData {
  storytellingList: any[] | null;
  persona: any | null;
  proposition: any | null;
  brandProfile: any | null;
  strategy: any | null;
  offersList: any[] | null;
  charter: any | null;
}

export async function fetchBrandingData(filter: { column: string; value: string }): Promise<BrandingRawData> {
  const [stRes, perRes, propRes, toneRes, stratRes, offersRes, charterRes] = await Promise.all([
    (supabase.from("storytelling") as any).select("id, is_primary, completed, step_7_polished, imported_text").eq(filter.column, filter.value),
    (supabase.from("persona") as any).select("description, step_1_frustrations, step_2_transformation, step_3a_objections, step_4_beautiful, step_5_actions").eq(filter.column, filter.value).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    (supabase.from("brand_proposition") as any).select("step_1_what, step_2a_process, step_2b_values, step_3_for_whom, version_final, version_pitch_naturel").eq(filter.column, filter.value).maybeSingle(),
    (supabase.from("brand_profile") as any).select("voice_description, combat_cause, combat_fights, combat_alternative, combat_refusals, tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims, channels").eq(filter.column, filter.value).maybeSingle(),
    (supabase.from("brand_strategy") as any).select("step_1_hidden_facets, facet_1, pillar_major, creative_concept").eq(filter.column, filter.value).maybeSingle(),
    (supabase.from("offers") as any).select("id, name, promise, target_ideal, price_text, completed").eq(filter.column, filter.value),
    (supabase.from("brand_charter") as any).select("logo_url, color_primary, color_secondary, color_accent, font_title, font_body, mood_keywords, photo_style").eq(filter.column, filter.value).maybeSingle(),
  ]);

  return {
    storytellingList: stRes.data,
    persona: perRes.data,
    proposition: propRes.data,
    brandProfile: toneRes.data,
    strategy: stratRes.data,
    offersList: offersRes.data,
    charter: charterRes.data,
  };
}

function filled(val: unknown): boolean {
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
  const hasDescription = filled(per?.description);
  const personaFilled = personaFields.filter(filled).length;
  let persona: number;
  if (personaFilled > 0) {
    persona = Math.round((personaFilled / 5) * 100);
  } else if (hasDescription) {
    persona = 50;
  } else {
    persona = 0;
  }

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

  // CHARTER: weighted score
  const ch = data.charter;
  let charterScore = 0;
  if (ch) {
    if (filled(ch.logo_url)) charterScore += 20;
    const defaults: Record<string, string> = { color_primary: "#E91E8C", color_secondary: "#1A1A2E", color_accent: "#FFE561" };
    const changedColors = (["color_primary", "color_secondary", "color_accent"] as const)
      .filter(k => ch[k] && ch[k] !== defaults[k]).length;
    if (changedColors >= 3) charterScore += 25;
    if (ch.font_title && ch.font_title !== "Inter" && ch.font_body && ch.font_body !== "Inter") charterScore += 20;
    if (Array.isArray(ch.mood_keywords) && ch.mood_keywords.length >= 3) charterScore += 20;
    if (filled(ch.photo_style)) charterScore += 15;
  }
  const charter = charterScore;

  // OFFERS: at least 1 offer with name + promise or price
  const offerList = data.offersList || [];
  const completedOffers = offerList.filter((o: any) => filled(o.name) && (filled(o.promise) || filled(o.price_text)));
  const offers = completedOffers.length >= 1 ? 100 : offerList.length > 0 ? 50 : 0;

  const total = Math.round((storytelling + persona + proposition + tone + strategy + offers + charter) / 7);

  return { storytelling, persona, proposition, tone, strategy, offers, charter, total };
}

/**
 * Legacy helper used by BrandingPrompt and SiteAccueil.
 * Returns a simple percent + toneComplete flag.
 */
export async function getBrandingCompletion(filter: { column: string; value: string }): Promise<{ percent: number; toneComplete: boolean }> {
  const data = await fetchBrandingData(filter);
  const completion = calculateBrandingCompletion(data);
  return { percent: completion.total, toneComplete: completion.tone > 50 };
}
