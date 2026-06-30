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

export interface BrandingFetchResult {
  data: BrandingRawData;
  /** Non-null quand au moins une requête a échoué (réseau / 500). Permet de
   *  distinguer « pas de données » d'« échec de chargement » côté UI. */
  error: Error | null;
}

/**
 * Variante de fetchBrandingData qui REMONTE l'erreur de chargement au lieu de la
 * masquer en données vides. À utiliser quand l'UI doit afficher un état d'erreur
 * (ex. BrandingPage) plutôt que de retomber sur l'écran d'onboarding vide.
 */
export async function fetchBrandingDataWithStatus(
  filter: { column: string; value: string },
  fallbackFilter?: { column: string; value: string }
): Promise<BrandingFetchResult> {
  const runQueries = async (f: { column: string; value: string }): Promise<BrandingFetchResult> => {
    const [stRes, perRes, propRes, toneRes, stratRes, offersRes, charterRes] = await Promise.all([
      (supabase.from("storytelling") as any).select("id, is_primary, completed, step_7_polished, imported_text").eq(f.column, f.value),
      (supabase.from("persona") as any).select("description, step_1_frustrations, step_2_transformation, step_3a_objections, step_4_beautiful, step_5_actions").eq(f.column, f.value).order("is_primary", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      (supabase.from("brand_proposition") as any).select("step_1_what, step_2a_process, step_2b_values, step_3_for_whom, version_final, version_pitch_naturel").eq(f.column, f.value).maybeSingle(),
      (supabase.from("brand_profile") as any).select("voice_description, combat_cause, combat_fights, combat_alternative, combat_refusals, tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims, channels").eq(f.column, f.value).maybeSingle(),
      (supabase.from("brand_strategy") as any).select("step_1_hidden_facets, facet_1, pillar_major, creative_concept").eq(f.column, f.value).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      (supabase.from("offers") as any).select("id, name, promise, target_ideal, price_text, completed").eq(f.column, f.value),
      (supabase.from("brand_charter") as any).select("logo_url, color_primary, color_secondary, color_accent, color_background, color_text, font_title, font_body, mood_keywords, photo_style, uploaded_templates").eq(f.column, f.value).maybeSingle(),
    ]);
    // On NE confond plus une requête en erreur avec « pas de données » : si l'une
    // des requêtes a échoué, on remonte l'erreur.
    const firstErr = stRes.error || perRes.error || propRes.error || toneRes.error || stratRes.error || offersRes.error || charterRes.error;
    return {
      data: {
        storytellingList: stRes.data,
        persona: perRes.data,
        proposition: propRes.data,
        brandProfile: toneRes.data,
        strategy: stratRes.data,
        offersList: offersRes.data,
        charter: charterRes.data,
      },
      error: firstErr ? new Error(firstErr.message || "Erreur de chargement du branding") : null,
    };
  };

  const result = await runQueries(filter);

  // En cas d'erreur, on remonte tel quel : surtout PAS de fallback (qui pourrait
  // masquer l'échec en faux « vide »).
  if (result.error) return result;

  // If all data is empty and a fallback filter exists, retry with fallback
  if (fallbackFilter && fallbackFilter.value !== filter.value) {
    const isEmpty =
      (!result.data.storytellingList || result.data.storytellingList.length === 0) &&
      !result.data.persona &&
      !result.data.proposition &&
      !result.data.brandProfile &&
      !result.data.strategy &&
      (!result.data.offersList || result.data.offersList.length === 0) &&
      !result.data.charter;
    if (isEmpty) {
      return runQueries(fallbackFilter);
    }
  }

  return result;
}

/**
 * Compat : renvoie uniquement les données (erreurs ignorées silencieusement,
 * comportement historique). Conserve la signature attendue par les nombreux
 * appelants existants (Dashboard, SessionContext, bannières…).
 */
export async function fetchBrandingData(
  filter: { column: string; value: string },
  fallbackFilter?: { column: string; value: string }
): Promise<BrandingRawData> {
  return (await fetchBrandingDataWithStatus(filter, fallbackFilter)).data;
}

function filled(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === "string") return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

export function calculateBrandingCompletion(data: BrandingRawData): BrandingCompletion {
  // STORYTELLING: complete if at least 1 exists with polished text or imported text.
  // An auto-created empty draft row must NOT count as 100% (it gonflait le score).
  const hasStory = Array.isArray(data.storytellingList) &&
    data.storytellingList.some((s: any) => filled(s?.step_7_polished) || filled(s?.imported_text));
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

  // CHARTER: aligned with BrandCharterPage computeCompletion
  const ch = data.charter;
  let charterScore = 0;
  if (ch) {
    if (filled(ch.logo_url)) charterScore += 15;
    const filledColors = (["color_primary", "color_secondary", "color_accent"] as const)
      .filter(k => filled(ch[k])).length;
    if (filledColors >= 3) charterScore += 25;
    if (filled(ch.font_title) && filled(ch.font_body)) charterScore += 20;
    if (Array.isArray(ch.mood_keywords) && ch.mood_keywords.length >= 3) charterScore += 15;
    if (filled(ch.photo_style)) charterScore += 15;
    const templates = Array.isArray(ch.uploaded_templates) ? ch.uploaded_templates : [];
    if (templates.length > 0) charterScore += 10;
  }
  const charter = Math.min(charterScore, 100);

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

/**
 * Variante de getBrandingCompletion qui REMONTE l'erreur de chargement au lieu
 * de la masquer en 0 %. À utiliser par les surfaces qui « nudgent » (carte du
 * hub, bannières, prompts) : sur une simple erreur réseau transitoire, on ne
 * doit PAS afficher « branding vide / 0 % / commence à remplir » à un
 * utilisateur déjà complet (même piège erreur-vs-vide que sur /branding).
 */
export async function getBrandingCompletionWithStatus(
  filter: { column: string; value: string }
): Promise<{ percent: number; toneComplete: boolean; error: Error | null }> {
  const { data, error } = await fetchBrandingDataWithStatus(filter);
  const completion = calculateBrandingCompletion(data);
  return { percent: completion.total, toneComplete: completion.tone > 50, error };
}
