// Écritures de la relecture de marque (BrandingReview) : une fonction par
// section, dans 7 tables. Sorti de BrandingReview.tsx à l'identique (fiche 14
// de docs/robustesse/gros-fichiers.md, lot 2). La colonne de portée reste
// choisie à la main dans chaque fonction (voir le constat du lot T dans la fiche).
import { supabase } from "@/integrations/supabase/client";
import { importTarget, readImportRows } from "@/lib/branding-import-persistence";
import { isEmptyVal, fillOnlyEmpty } from "@/lib/fill-only-empty";
import { withoutOnboardingDefaults } from "@/lib/onboarding-strategy-defaults";
import type { AnalysisResult, SectionKey } from "@/components/branding/review/types";

// ─── Save helpers ────────────────────────────────────────────
// supabase-js ne LÈVE PAS d'exception sur erreur DB : il renvoie { error }.
// Sans ce garde, une écriture échouée (RLS, colonne inexistante…) passait
// inaperçue et la section affichait « sauvegardée ✓ » alors que rien n'était
// persisté (cf. bug portrait_age). On force la remontée vers handleValidate.
async function writeOrThrow(query: any, ctx: string) {
  const { data, error } = await query.select("id");
  if (error) {
    console.error(`[branding save] ${ctx}:`, error);
    throw error;
  }
  if (!data?.length) throw new Error("Aucune fiche enregistrée. Recharge les données avant de réessayer.");
}

/**
 * Upsert ciblé de quelques colonnes de `brand_profile` (la table de synthèse lue
 * par la génération via _shared/user-context.ts), en complétant uniquement les
 * champs vides (fillOnlyEmpty n'écrase jamais une saisie existante).
 * Sert à alimenter target_description / target_problem / mission depuis l'autofill,
 * qui étaient lus par l'IA mais jamais remplis. Les save* tournent par section
 * (au clic « valider »), donc séquentiellement → pas de race sur la ligne.
 */
async function fillBrandProfileSynthesis(
  fields: Record<string, any>,
  userId: string,
  workspaceId: string,
  overwrite = false,
) {
  if (Object.keys(fields).length === 0) return;
  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;
  const selectCols = `id, ${Object.keys(fields).join(", ")}`;
  const { data: existing, error: readError } = await (supabase.from("brand_profile") as any)
    .select(selectCols).eq(filterCol, filterVal).maybeSingle();
  if (readError) throw readError;
  if (existing?.id) {
    const toWrite = fillOnlyEmpty(fields, existing, overwrite);
    if (Object.keys(toWrite).length === 0) return;
    await writeOrThrow((supabase.from("brand_profile") as any).update({ ...toWrite, updated_at: new Date().toISOString() }).eq("id", existing.id), "brand_profile.synthesis.update");
  } else {
    await writeOrThrow((supabase.from("brand_profile") as any).insert({ user_id: userId, workspace_id: workspaceId && workspaceId !== userId ? workspaceId : null, updated_at: new Date().toISOString(), ...fields }), "brand_profile.synthesis.insert");
  }
}

async function saveStory(data: AnalysisResult["story"], userId: string, workspaceId: string, overwrite = false) {
  if (!data) return;

  const fields: Record<string, any> = {};
  if (data.origin) fields.step_1_raw = data.origin;
  if (data.trigger) fields.step_2_location = data.trigger;
  if (data.struggles) fields.step_3_action = data.struggles;
  if (data.uniqueness) fields.step_4_thoughts = data.uniqueness;
  if (data.vision) fields.step_5_emotions = data.vision;
  if (data.full_story) fields.step_6_full_story = data.full_story;

  if (Object.keys(fields).length === 0) return;
  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;

  const existing = importTarget(await readImportRows("storytelling", { column: filterCol, value: filterVal, userId }), true);

  if (existing?.id) {
    const toWrite = fillOnlyEmpty(fields, existing, false);
    if (data.full_story && overwrite) toWrite.step_7_polished = data.full_story;
    if (Object.keys(toWrite).length > 0) {
      await writeOrThrow((supabase.from("storytelling") as any).update({ ...toWrite, updated_at: new Date().toISOString() }).eq("id", existing.id), "storytelling.update");
    }
  } else {
    await writeOrThrow((supabase.from("storytelling") as any).insert({
      user_id: userId,
      workspace_id: workspaceId && workspaceId !== userId ? workspaceId : null,
      is_primary: true,
      title: "Mon histoire fondatrice",
      story_type: "fondatrice",
      source: "autofill",
      updated_at: new Date().toISOString(),
      ...fields,
    }), "storytelling.insert");
  }

  // La vision tient lieu de mission tant que celle-ci est vide : brand_profile.mission
  // est injectée dans le prompt de génération (section IDENTITÉ) et restait vide.
  if (data.vision) await fillBrandProfileSynthesis({ mission: data.vision }, userId, workspaceId, overwrite);
}
async function savePersona(data: AnalysisResult["persona"], userId: string, workspaceId: string, overwrite = false) {
  if (!data) return;

  const fields: Record<string, any> = {};
  if (data.name) fields.portrait_prenom = data.name;
  // L'âge ET le métier vivent dans le JSON portrait.qui_elle_est (leur vraie
  // place, lue par la synthèse). Il n'existe PAS de colonne plate portrait_age :
  // écrire dessus faisait rejeter tout l'INSERT/SELECT en silence (« column
  // does not exist ») → la cliente idéale n'était jamais enregistrée.
  if (data.description) fields.description = data.description;
  if (data.frustrations?.length) fields.step_1_frustrations = data.frustrations.join("\n");
  if (data.desires?.length) fields.step_2_transformation = data.desires.join("\n");
  if (data.goals?.length) fields.step_3a_objections = data.goals.join("\n");
  if (data.beautiful_world) fields.step_4_beautiful = data.beautiful_world;
  if (data.first_actions) fields.step_5_actions = data.first_actions;
  if (data.channels?.length) fields.channels = data.channels;
  if (data.brands_they_follow?.length) fields.step_4_inspiring = data.brands_they_follow.join(", ");

  if (Object.keys(fields).length === 0) return;
  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;

  const existing = importTarget(await readImportRows("persona", { column: filterCol, value: filterVal, userId }), true);

  if (existing?.id) {
    const toWrite = fillOnlyEmpty(fields, existing, overwrite);
    // Merge l'âge + le métier dans portrait.qui_elle_est, uniquement s'ils manquent.
    const baseQui = (existing?.portrait?.qui_elle_est && typeof existing.portrait.qui_elle_est === "object")
      ? existing.portrait.qui_elle_est
      : {};
    const quiPatch: Record<string, any> = {};
    if (data.age_range && isEmptyVal(baseQui.age)) quiPatch.age = data.age_range;
    if (data.job && isEmptyVal(baseQui.metier)) quiPatch.metier = data.job;
    if (Object.keys(quiPatch).length > 0) {
      const basePortrait = (existing?.portrait && typeof existing.portrait === "object" && !Array.isArray(existing.portrait))
        ? { ...existing.portrait }
        : {};
      basePortrait.qui_elle_est = { ...(basePortrait.qui_elle_est || {}), ...quiPatch };
      toWrite.portrait = basePortrait;
    }
    // rien à compléter sur persona si toWrite vide — mais on tente quand même la synthèse brand_profile plus bas
    if (Object.keys(toWrite).length > 0) {
      await writeOrThrow((supabase.from("persona") as any).update({ ...toWrite, updated_at: new Date().toISOString() }).eq("id", existing.id), "persona.update");
    }
  } else {
    const qui: Record<string, any> = {};
    if (data.age_range) qui.age = data.age_range;
    if (data.job) qui.metier = data.job;
    if (Object.keys(qui).length > 0) fields.portrait = { qui_elle_est: qui };
    await writeOrThrow((supabase.from("persona") as any).insert({
      user_id: userId,
      workspace_id: workspaceId && workspaceId !== userId ? workspaceId : null,
      is_primary: true,
      updated_at: new Date().toISOString(),
      ...fields,
    }), "persona.insert");
  }

  // La description de la cible est lue par la génération (brand_profile.target_description)
  // et restait vide après l'autofill — on la complète depuis le persona.
  if (data.description) await fillBrandProfileSynthesis({ target_description: data.description }, userId, workspaceId, overwrite);
}
async function saveValueProp(data: AnalysisResult["value_proposition"], userId: string, workspaceId: string, overwrite = false) {
  if (!data) return;
  const fields: Record<string, any> = {};
  // version_final = source de vérité lue par la génération/synthèse/Coach. On la
  // remplit avec la phrase-clé (si vide) pour que la proposition analysée soit
  // considérée comme « complétée » et non « à faire ». fillOnlyEmpty protège
  // toute version_final déjà rédigée par l'utilisatrice.
  if (data.key_phrase) { fields.step_1_what = data.key_phrase; fields.version_one_liner = data.key_phrase; fields.version_final = data.key_phrase; }
  if (data.solution) fields.step_2a_process = data.solution;


  // Preuves/témoignages : extraits + affichés mais jamais sauvegardés jusqu'ici.
  // On les range dans step_2c_feedback (« validation reçue » de la proposition).
  if (data.proofs?.length) fields.step_2c_feedback = data.proofs.join("\n");
  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;
  const { data: existing, error: readError } = await (supabase.from("brand_proposition") as any)
    .select("id, step_1_what, version_one_liner, version_final, step_2a_process, step_2d_refuse, step_3_for_whom, step_2c_feedback").eq(filterCol, filterVal).maybeSingle();
  if (readError) throw readError;
  if (Object.keys(fields).length > 0) {
  if (existing?.id) {
    const toWrite = fillOnlyEmpty(fields, existing, overwrite);
    if (!isEmptyVal(existing.version_one_liner)) delete toWrite.version_one_liner;
    if (Object.keys(toWrite).length > 0) {
      await writeOrThrow((supabase.from("brand_proposition") as any).update({ ...toWrite, updated_at: new Date().toISOString() }).eq("id", existing.id), "brand_proposition.update");
    }
  } else {
    await writeOrThrow((supabase.from("brand_proposition") as any).insert({ user_id: userId, workspace_id: workspaceId && workspaceId !== userId ? workspaceId : null, updated_at: new Date().toISOString(), ...fields }), "brand_proposition.insert");
  }
  }

  // Le problème principal de la cible est lu par la génération (brand_profile.target_problem)
  // et restait vide — on le complète depuis le problème de la proposition de valeur.
  if (data.problem) await fillBrandProfileSynthesis({ target_problem: data.problem, value_prop_problem: data.problem }, userId, workspaceId, overwrite);
  if (data.differentiator) await fillBrandProfileSynthesis({ value_prop_difference: data.differentiator }, userId, workspaceId, overwrite);
  // L'offre (brand_profile.offer) est injectée dans le prompt de génération (section
  // IDENTITÉ) et restait vide — on la complète depuis la solution de la proposition.
  if (data.solution) await fillBrandProfileSynthesis({ offer: data.solution }, userId, workspaceId, overwrite);
}
async function saveTone(data: AnalysisResult["tone_style"], userId: string, workspaceId: string, overwrite = false) {
  if (!data) return;
  const fields: Record<string, any> = {};
  if (data.tone_keywords?.length) fields.tone_keywords = data.tone_keywords;
  if (data.voice_description) fields.voice_description = data.voice_description;
  if (data.tone_register) fields.tone_register = data.tone_register;
  if (data.tone_level) fields.tone_level = data.tone_level;
  if (data.tone_style_chip) fields.tone_style = data.tone_style_chip;
  if (data.tone_humor) fields.tone_humor = data.tone_humor;
  if (data.tone_engagement) fields.tone_engagement = data.tone_engagement;
  if (data.i_do?.length) fields.tone_do = data.i_do.join("\n");
  if (data.i_never_do?.length) fields.tone_dont = data.i_never_do.join("\n");
  if (data.fights?.length) fields.combat_cause = data.fights.join("\n");
  if (data.key_expressions) fields.key_expressions = data.key_expressions;
  if (data.things_to_avoid) fields.things_to_avoid = data.things_to_avoid;
  if (data.target_verbatims) fields.target_verbatims = data.target_verbatims;
  if (data.channels?.length) fields.channels = data.channels;
  if (data.visual_style) fields.visual_style = data.visual_style;
  if (Object.keys(fields).length === 0) return;
  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;
  const { data: existing, error: readError } = await (supabase.from("brand_profile") as any)
    .select("id, tone_keywords, voice_description, tone_register, tone_level, tone_style, tone_humor, tone_engagement, tone_do, tone_dont, combat_cause, key_expressions, things_to_avoid, target_verbatims, channels, visual_style").eq(filterCol, filterVal).maybeSingle();
  if (readError) throw readError;
  if (existing?.id) {
    const toWrite = fillOnlyEmpty(fields, existing, overwrite);
    if (Object.keys(toWrite).length === 0) return;
    await writeOrThrow((supabase.from("brand_profile") as any).update({ ...toWrite, updated_at: new Date().toISOString() }).eq("id", existing.id), "brand_profile.update");
  } else {
    await writeOrThrow((supabase.from("brand_profile") as any).insert({ user_id: userId, workspace_id: workspaceId && workspaceId !== userId ? workspaceId : null, updated_at: new Date().toISOString(), ...fields }), "brand_profile.insert");
  }
}
async function saveStrategy(data: AnalysisResult["content_strategy"], userId: string, workspaceId: string, overwrite = false) {
  if (!data) return;
  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;
  const stratFields: Record<string, any> = {};
  if (data.pillars?.[0]) stratFields.pillar_major = data.pillars[0];
  if (data.pillars?.[1]) stratFields.pillar_minor_1 = data.pillars[1];
  if (data.pillars?.[2]) stratFields.pillar_minor_2 = data.pillars[2];
  if (data.pillars?.[3]) stratFields.pillar_minor_3 = data.pillars[3]; // 4e pilier (était jeté)
  if (data.creative_twist) stratFields.creative_concept = data.creative_twist;
  const { data: existingStrat, error: readError } = await (supabase.from("brand_strategy") as any)
    .select("id, pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3, creative_concept").eq(filterCol, filterVal).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (readError) throw readError;
  if (Object.keys(stratFields).length > 0) {
  if (existingStrat?.id) {
    // Le pilier générique posé par l'onboarding (« Organisation & régularité »…)
    // compte comme vide : sinon il bloquait le vrai pilier trouvé par l'analyse.
    const toWrite = fillOnlyEmpty(stratFields, withoutOnboardingDefaults(existingStrat), overwrite);
    if (Object.keys(toWrite).length > 0) {
      await writeOrThrow((supabase.from("brand_strategy") as any).update({ ...toWrite, updated_at: new Date().toISOString() }).eq("id", existingStrat.id), "brand_strategy.update");
    }
  } else {
    await writeOrThrow((supabase.from("brand_strategy") as any).insert({ user_id: userId, workspace_id: workspaceId && workspaceId !== userId ? workspaceId : null, updated_at: new Date().toISOString(), ...stratFields }), "brand_strategy.insert");
  }
  }
  if (data.editorial_line || data.formats?.length || data.rhythm || data.pillars?.length) {
    const profileFields: Record<string, any> = {};
    if (data.pillars?.length) profileFields.content_pillars = data.pillars;
    if (data.editorial_line) profileFields.content_editorial_line = data.editorial_line;
    if (data.formats?.length) profileFields.content_formats = data.formats;
    if (data.rhythm) profileFields.content_frequency = data.rhythm;
    const { data: existingProfile, error: readError } = await (supabase.from("brand_profile") as any)
      .select("id, content_pillars, content_editorial_line, content_formats, content_frequency").eq(filterCol, filterVal).maybeSingle();
  if (readError) throw readError;
    if (existingProfile?.id) {
      const toWrite = fillOnlyEmpty(profileFields, existingProfile, overwrite);
      if (Object.keys(toWrite).length > 0) {
        await writeOrThrow((supabase.from("brand_profile") as any).update({ ...toWrite, updated_at: new Date().toISOString() }).eq("id", existingProfile.id), "brand_profile.content.update");
      }
    } else {
      await writeOrThrow((supabase.from("brand_profile") as any).insert({ user_id: userId, workspace_id: workspaceId && workspaceId !== userId ? workspaceId : null, updated_at: new Date().toISOString(), ...profileFields }), "brand_profile.content.insert");
    }
  }
}
async function saveOffers(data: AnalysisResult["offers"], userId: string, workspaceId: string, overwrite = false) {
  if (!data?.offers?.length) return;
  const col = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const val = workspaceId && workspaceId !== userId ? workspaceId : userId;
  const existing = await readImportRows("offers", { column: col, value: val, userId });
  const names = new Set(existing.map(o => (o.name || "").toLocaleLowerCase().trim()));
  const payload = data.offers.map(offer => {
    const name = offer.name?.trim();
    if (!name) throw new Error("Donne un nom à chaque offre avant de valider.");
    const normalized = name.toLocaleLowerCase();
    if (names.has(normalized)) throw new Error(`Une offre « ${name} » existe déjà. Renomme la nouvelle offre ou retire-la de cet import pour conserver la fiche existante.`);
    names.add(normalized);
    return {
      user_id: userId,
      workspace_id: workspaceId && workspaceId !== userId ? workspaceId : null,
      name,
      offer_type: "paid",
      price_text: offer.price || null,
      description_short: offer.description || null,
      target_ideal: offer.target || null,
      promise: offer.promise || null,
    };
  });
  await writeOrThrow((supabase.from("offers") as any).insert(payload), "offers.insert");
}

async function saveCharter(data: AnalysisResult["charter"], userId: string, workspaceId: string, overwrite = false) {
  if (!data) return;
  const payload: Record<string, any> = {};
  if (data.color_primary) payload.color_primary = data.color_primary;
  if (data.color_secondary) payload.color_secondary = data.color_secondary;
  if (data.color_accent) payload.color_accent = data.color_accent;
  if (data.color_background) payload.color_background = data.color_background;
  if (data.font_title) payload.font_title = data.font_title;
  if (data.font_body) payload.font_body = data.font_body;
  if (data.mood_keywords?.length) payload.mood_keywords = data.mood_keywords;
  if (data.visual_style_description) payload.moodboard_description = data.visual_style_description;
  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;
  if (Object.keys(payload).length === 0) return;
  const { data: existing, error: readError } = await (supabase.from("brand_charter") as any)
    .select("*").eq(filterCol, filterVal).maybeSingle();
  if (readError) throw readError;
  if (existing?.id) {
    const toWrite = fillOnlyEmpty(payload, existing, overwrite);
    // Charte déjà remplie : rien à compléter. Une mise à jour vide ne renvoie
    // aucune ligne côté PostgREST → writeOrThrow affichait « Aucune fiche enregistrée ».
    if (Object.keys(toWrite).length === 0) return;
    const previousEvidence = existing.visual_evidence && typeof existing.visual_evidence === "object" && !Array.isArray(existing.visual_evidence) ? existing.visual_evidence : {};
    toWrite.visual_evidence = { ...previousEvidence, ...Object.fromEntries(Object.keys(toWrite).map(key => [key, { source: "diagnostic", confidence: key === "moodboard_description" ? "low" : data.confidence || "low", reviewed_at: new Date().toISOString() }])) };
    await writeOrThrow((supabase.from("brand_charter") as any).update(toWrite).eq("id", existing.id), "brand_charter.update");
  } else {
    const visual_evidence = Object.fromEntries(Object.keys(payload).map(key => [key, { source: "diagnostic", confidence: key === "moodboard_description" ? "low" : data.confidence || "low", reviewed_at: new Date().toISOString() }]));
    await writeOrThrow((supabase.from("brand_charter") as any).insert({ user_id: userId, workspace_id: workspaceId && workspaceId !== userId ? workspaceId : null, ...payload, visual_evidence }), "brand_charter.insert");
  }
}

export const SAVE_FNS: Record<SectionKey, (data: any, uid: string, wsId: string, overwrite?: boolean) => Promise<void>> = {
  story: saveStory, persona: savePersona, value_proposition: saveValueProp, tone_style: saveTone, content_strategy: saveStrategy, offers: saveOffers, charter: saveCharter,
};

export const QUERY_KEYS: Record<SectionKey, string[]> = {
  story: ["storytelling-primary", "storytelling-list", "brand-profile"], persona: ["persona", "brand-profile"], value_proposition: ["brand-proposition", "brand-profile"], tone_style: ["brand-profile"], content_strategy: ["brand-strategy", "brand-profile"], offers: ["offers", "brand-profile"], charter: ["brand-charter"],
};
