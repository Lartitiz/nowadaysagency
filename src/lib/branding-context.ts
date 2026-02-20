import { supabase } from "@/integrations/supabase/client";

/**
 * Builds a dynamic branding context block for AI prompts.
 * Returns a string to inject BEFORE any specific AI prompt.
 */
export async function buildBrandingContext(userId: string): Promise<string> {
  const [stRes, perRes, toneRes, profRes, propRes] = await Promise.all([
    supabase.from("storytelling").select("step_7_polished").eq("user_id", userId).maybeSingle(),
    supabase.from("persona").select("step_1_frustrations, step_2_transformation, step_3a_objections, step_3b_cliches").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_profile").select("tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims, channels, mission, offer").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("activite, offre, mission, cible").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_proposition").select("version_final, version_complete").eq("user_id", userId).maybeSingle(),
  ]);

  const lines: string[] = ["CONTEXTE DE LA MARQUE (généré à partir du module Branding) :\n"];

  // Storytelling
  const story = stRes.data?.step_7_polished;
  if (story) lines.push(`HISTOIRE :\n${story}\n`);

  // Persona
  const p = perRes.data;
  if (p) {
    const personaLines: string[] = [];
    if (p.step_1_frustrations) personaLines.push(`- Frustrations : ${p.step_1_frustrations}`);
    if (p.step_2_transformation) personaLines.push(`- Transformation rêvée : ${p.step_2_transformation}`);
    if (p.step_3a_objections) personaLines.push(`- Objections : ${p.step_3a_objections}`);
    if (p.step_3b_cliches) personaLines.push(`- Clichés : ${p.step_3b_cliches}`);
    if (personaLines.length) lines.push(`CLIENTE IDÉALE :\n${personaLines.join("\n")}\n`);
  }

  // Tone & Style
  const t = toneRes.data;
  if (t) {
    const toneLines: string[] = [];
    const reg = [t.tone_register, t.tone_level, t.tone_style].filter(Boolean).join(" - ");
    if (reg) toneLines.push(`- Registre : ${reg}`);
    if (t.tone_humor) toneLines.push(`- Humour : ${t.tone_humor}`);
    if (t.tone_engagement) toneLines.push(`- Engagement : ${t.tone_engagement}`);
    if (t.key_expressions) toneLines.push(`- Expressions clés : ${t.key_expressions}`);
    if (t.things_to_avoid) toneLines.push(`- Ce qu'on évite : ${t.things_to_avoid}`);
    if (t.target_verbatims) toneLines.push(`- Verbatims de la cible : ${t.target_verbatims}`);
    if (t.channels?.length) toneLines.push(`- Canaux : ${t.channels.join(", ")}`);
    if (toneLines.length) lines.push(`TON & STYLE :\n${toneLines.join("\n")}\n`);

    if (t.mission || t.offer) {
      const idLines: string[] = [];
      if (t.mission) idLines.push(`- Mission : ${t.mission}`);
      if (t.offer) idLines.push(`- Offre : ${t.offer}`);
      lines.push(`IDENTITÉ :\n${idLines.join("\n")}\n`);
    }
  }

  // Proposition de valeur
  const propValue = propRes.data?.version_final || propRes.data?.version_complete;
  if (propValue) lines.push(`PROPOSITION DE VALEUR :\n${propValue}\n`);

  if (lines.length <= 1) {
    return "NOTE : Le profil branding est très peu rempli. Indique à l'utilisatrice qu'elle gagnerait à compléter son Branding pour des résultats plus pertinents.\n";
  }

  return lines.join("\n");
}

/**
 * Returns a completion percentage for the branding module.
 */
export async function getBrandingCompletion(userId: string): Promise<{ percent: number; toneComplete: boolean }> {
  const [stRes, perRes, toneRes] = await Promise.all([
    supabase.from("storytelling").select("step_1_raw, step_7_polished").eq("user_id", userId).maybeSingle(),
    supabase.from("persona").select("step_1_frustrations, step_5_actions").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_profile").select("tone_register, key_expressions, things_to_avoid, target_verbatims").eq("user_id", userId).maybeSingle(),
  ]);

  const filled = (v: any) => v && String(v).trim().length > 0;
  const stScore = filled(stRes.data?.step_7_polished) ? 1 : filled(stRes.data?.step_1_raw) ? 0.3 : 0;
  const perScore = filled(perRes.data?.step_5_actions) ? 1 : filled(perRes.data?.step_1_frustrations) ? 0.3 : 0;
  const toneFields = toneRes.data ? [toneRes.data.tone_register, toneRes.data.key_expressions, toneRes.data.things_to_avoid, toneRes.data.target_verbatims] : [];
  const toneScore = toneFields.filter(filled).length / 4;
  const toneComplete = toneScore > 0.5;

  // 3 available sections out of 6
  const percent = Math.round(((stScore + perScore + toneScore) / 3) * 100);
  return { percent, toneComplete };
}
