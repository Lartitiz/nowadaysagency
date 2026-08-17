import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";

export interface InsightsSaveCtx {
  column: string;
  value: string;
  profileUserId: string;
  workspaceId: string;
}

/** Saves charter insights to brand_charter. Returns the payload actually written (null when there was nothing to save), so the caller can merge it into its local charterData ref. */
export async function saveCharterInsights(
  insights: Record<string, any>,
  ctx: InsightsSaveCtx
): Promise<Record<string, any> | null> {
  const charterPayload: Record<string, any> = {};
  if (insights.mood_keywords) charterPayload.mood_keywords = insights.mood_keywords;
  if (insights.color_primary) charterPayload.color_primary = insights.color_primary;
  if (insights.color_secondary) charterPayload.color_secondary = insights.color_secondary;
  if (insights.color_accent) charterPayload.color_accent = insights.color_accent;
  if (insights.photo_style) charterPayload.photo_style = insights.photo_style;
  if (insights.font_title) charterPayload.font_title = insights.font_title;
  if (insights.font_body) charterPayload.font_body = insights.font_body;
  if (insights.font_rationale) charterPayload.font_rationale = insights.font_rationale;
  if (insights.visual_donts) charterPayload.visual_donts = insights.visual_donts;
  if (insights.ai_generated_brief) charterPayload.ai_generated_brief = insights.ai_generated_brief;

  if (Object.keys(charterPayload).length === 0) return null;

  charterPayload.updated_at = new Date().toISOString();
  const { data: existing } = await (supabase.from("brand_charter") as any)
    .select("id")
    .eq(ctx.column, ctx.value)
    .maybeSingle();
  if (existing?.id) {
    await (supabase.from("brand_charter") as any)
      .update(charterPayload)
      .eq("id", existing.id);
  } else {
    await (supabase.from("brand_charter") as any)
      .insert({ user_id: ctx.profileUserId, workspace_id: ctx.workspaceId !== ctx.profileUserId ? ctx.workspaceId : undefined, ...charterPayload });
  }
  return charterPayload;
}

/** Saves persona insights, creating the primary persona if none exists yet. Returns the persona id used (new or existing), so the caller can update its resolvedPersonaId ref. */
export async function savePersonaInsights(
  insights: Record<string, any>,
  ctx: InsightsSaveCtx,
  existingPersonaId: string | null
): Promise<string | null> {
  let targetPersonaId = existingPersonaId;

  if (!targetPersonaId) {
    const { data: primaryPersona } = await (supabase.from("persona") as any)
      .select("id").eq(ctx.column, ctx.value).eq("is_primary", true).maybeSingle();
    targetPersonaId = primaryPersona?.id || null;
  }

  if (targetPersonaId) {
    await (supabase.from("persona") as any)
      .update({ ...insights, updated_at: new Date().toISOString() })
      .eq("id", targetPersonaId);
    return targetPersonaId;
  }

  const { data: newPersona } = await (supabase.from("persona") as any).insert({
    user_id: ctx.profileUserId,
    workspace_id: ctx.workspaceId !== ctx.profileUserId ? ctx.workspaceId : undefined,
    is_primary: true,
    ...insights,
    updated_at: new Date().toISOString(),
  }).select("id").single();
  return newPersona?.id || null;
}

/** Maps coaching insights to storytelling columns and upserts the "fondatrice" story. */
export async function saveStoryInsights(insights: Record<string, any>, ctx: InsightsSaveCtx): Promise<void> {
  const { data: existing } = await (supabase.from("storytelling") as any)
    .select("id")
    .eq(ctx.column, ctx.value)
    .eq("story_type", "fondatrice")
    .limit(1)
    .maybeSingle();

  const storyData: Record<string, any> = {};
  if (insights.story_origin) storyData.step_1_raw = insights.story_origin;
  if (insights.story_turning_point) storyData.step_2_location = insights.story_turning_point;
  if (insights.story_struggles) storyData.step_3_action = insights.story_struggles;
  if (insights.story_unique) storyData.step_4_thoughts = insights.story_unique;
  if (insights.story_vision) storyData.step_5_emotions = insights.story_vision;

  if (existing?.id) {
    await (supabase.from("storytelling") as any)
      .update({ ...storyData, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await (supabase.from("storytelling") as any).insert({
      user_id: ctx.profileUserId,
      workspace_id: ctx.workspaceId !== ctx.profileUserId ? ctx.workspaceId : undefined,
      ...storyData,
      title: "Mon histoire fondatrice",
      story_type: "fondatrice",
      source: "coaching",
      is_primary: true,
      updated_at: new Date().toISOString(),
    });
  }
}

/** Maps coaching insights to brand_strategy (pillars/concept) and instagram_editorial_line (rhythm/formats/notes). Invalidates the affected query caches, matching the previous inline behavior. */
export async function saveContentStrategyInsights(
  insights: Record<string, any>,
  ctx: InsightsSaveCtx,
  queryClient: QueryClient
): Promise<void> {
  const strategyData: Record<string, any> = {};
  if (insights.content_pillars) {
    const pillars = typeof insights.content_pillars === "string"
      ? insights.content_pillars.split(/[,;\n]/).map((s: string) => s.trim()).filter(Boolean)
      : Array.isArray(insights.content_pillars) ? insights.content_pillars : [];
    if (pillars.length > 0) strategyData.pillar_major = pillars[0];
    if (pillars.length > 1) strategyData.pillar_minor_1 = pillars[1];
    if (pillars.length > 2) strategyData.pillar_minor_2 = pillars[2];
    if (pillars.length > 3) strategyData.pillar_minor_3 = pillars[3];
  }
  if (insights.pillar_major) strategyData.pillar_major = insights.pillar_major;
  if (insights.pillar_minor_1) strategyData.pillar_minor_1 = insights.pillar_minor_1;
  if (insights.pillar_minor_2) strategyData.pillar_minor_2 = insights.pillar_minor_2;
  if (insights.pillar_minor_3) strategyData.pillar_minor_3 = insights.pillar_minor_3;
  if (insights.content_twist || insights.creative_concept) {
    strategyData.creative_concept = insights.content_twist || insights.creative_concept;
  }
  // Combine formats + editorial line in step_1_hidden_facets (no data loss)
  const hiddenParts: string[] = [];
  if (insights.content_formats) {
    hiddenParts.push("Formats : " + (typeof insights.content_formats === "string" ? insights.content_formats : JSON.stringify(insights.content_formats)));
  }
  if (insights.content_editorial_line) {
    hiddenParts.push("Ligne éditoriale : " + insights.content_editorial_line);
  }
  if (hiddenParts.length > 0) {
    strategyData.step_1_hidden_facets = hiddenParts.join("\n\n");
  }

  if (Object.keys(strategyData).length > 0) {
    strategyData.updated_at = new Date().toISOString();
    const { data: existingStrat } = await (supabase.from("brand_strategy") as any)
      .select("id").eq(ctx.column, ctx.value).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (existingStrat?.id) {
      await (supabase.from("brand_strategy") as any).update(strategyData).eq("id", existingStrat.id);
    } else {
      await (supabase.from("brand_strategy") as any).insert({
        user_id: ctx.profileUserId,
        workspace_id: ctx.workspaceId !== ctx.profileUserId ? ctx.workspaceId : undefined,
        ...strategyData,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["brand-strategy"] });
  }

  // Save frequency and formats to editorial line if available
  if (insights.content_frequency || insights.content_formats || insights.content_editorial_line) {
    const editoData: Record<string, any> = { updated_at: new Date().toISOString(), source: "coaching" };
    if (insights.content_frequency) editoData.recommended_rhythm = insights.content_frequency;
    if (insights.content_formats) {
      const fmts = typeof insights.content_formats === "string"
        ? insights.content_formats.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean)
        : Array.isArray(insights.content_formats) ? insights.content_formats : [];
      if (fmts.length > 0) editoData.preferred_formats = fmts;
    }
    if (insights.content_editorial_line) {
      editoData.free_notes = insights.content_editorial_line;
    }
    const { data: existingEdito } = await (supabase.from("instagram_editorial_line") as any)
      .select("id").eq(ctx.column, ctx.value).maybeSingle();
    if (existingEdito?.id) {
      await (supabase.from("instagram_editorial_line") as any).update(editoData).eq("id", existingEdito.id);
    } else {
      await (supabase.from("instagram_editorial_line") as any).insert({
        user_id: ctx.profileUserId,
        workspace_id: ctx.workspaceId !== ctx.profileUserId ? ctx.workspaceId : undefined,
        ...editoData,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["editorial-line"] });
  }
}

/** Maps free-text cadence to the series.cadence DB enum. */
function mapSeriesCadence(raw?: string): "weekly" | "biweekly" | "monthly" | "irregular" | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.toLowerCase().trim();
  if (/(hebdo|chaque semaine|toutes les semaines|une fois par semaine|weekly|every week)/.test(s)) return "weekly";
  if (/(bimensuel|tous les 15 jours|toutes les deux semaines|deux fois par mois|biweekly|every two weeks)/.test(s)) return "biweekly";
  if (/(mensuel|chaque mois|tous les mois|une fois par mois|monthly|every month)/.test(s)) return "monthly";
  if (/(irr[ée]gulier|quand [çc]a vient|sporadique|al[ée]atoire|irregular|ad hoc)/.test(s)) return "irregular";
  if (["weekly", "biweekly", "monthly", "irregular"].includes(s)) return s as any;
  return null;
}

/** Saves content_series insights: up to 8 series (upserted by name) plus pillars_new (only fills empty brand_strategy pillar columns). Invalidates the affected query caches, matching the previous inline behavior. */
export async function saveContentSeriesInsights(
  insights: Record<string, any>,
  ctx: InsightsSaveCtx,
  queryClient: QueryClient
): Promise<void> {
  // A. Sauvegarde des séries
  const seriesArr: any[] = Array.isArray(insights.series) ? insights.series.slice(0, 8) : [];
  for (const serie of seriesArr) {
    try {
      if (!serie?.name || !serie?.promise) continue;
      const name = String(serie.name).trim();
      if (!name) continue;

      const { data: existingSerie } = await (supabase.from("series") as any)
        .select("id")
        .eq(ctx.column, ctx.value)
        .eq("name", name)
        .maybeSingle();

      const payload: Record<string, any> = {
        name,
        promise: String(serie.promise).trim(),
      };
      if (serie.pillar_key && ["pillar_major", "pillar_minor_1", "pillar_minor_2", "pillar_minor_3"].includes(serie.pillar_key)) {
        payload.pillar_key = serie.pillar_key;
      }
      const cadence = mapSeriesCadence(serie.cadence ?? serie.cadence_raw);
      if (cadence) payload.cadence = cadence;
      if (serie.format_template) payload.format_template = String(serie.format_template).trim();
      if (serie.signature_description) payload.signature_description = String(serie.signature_description).trim();
      if (Array.isArray(serie.channels) && serie.channels.length > 0) {
        payload.channels = serie.channels.filter((c: any) => typeof c === "string");
      }

      if (existingSerie?.id) {
        const { error } = await (supabase.from("series") as any)
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", existingSerie.id);
        if (error) console.error("[ContentSeries] Update error:", error);
      } else {
        const { error } = await (supabase.from("series") as any).insert({
          ...payload,
          user_id: ctx.profileUserId,
          workspace_id: ctx.workspaceId !== ctx.profileUserId ? ctx.workspaceId : undefined,
        });
        if (error) console.error("[ContentSeries] Insert error:", error);
      }
    } catch (serieErr) {
      console.error("[ContentSeries] Failed to save serie:", serie?.name, serieErr);
    }
  }

  // B. Mode combo : pillars_new (n'écrit que si vide en DB)
  const pillarsNew: string[] = Array.isArray(insights.pillars_new)
    ? insights.pillars_new.filter((p: any) => typeof p === "string" && p.trim()).slice(0, 4)
    : [];
  if (pillarsNew.length > 0) {
    try {
      const { data: existingStrat } = await (supabase.from("brand_strategy") as any)
        .select("id, pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3")
        .eq(ctx.column, ctx.value)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isEmpty = (v: any) => !v || (typeof v === "string" && v.trim().length === 0);
      const cols = ["pillar_major", "pillar_minor_1", "pillar_minor_2", "pillar_minor_3"];
      const updates: Record<string, any> = {};
      cols.forEach((col, i) => {
        if (i < pillarsNew.length && (!existingStrat || isEmpty(existingStrat[col]))) {
          updates[col] = pillarsNew[i].trim();
        }
      });

      if (Object.keys(updates).length > 0) {
        if (existingStrat?.id) {
          await (supabase.from("brand_strategy") as any)
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq("id", existingStrat.id);
        } else {
          await (supabase.from("brand_strategy") as any).insert({
            user_id: ctx.profileUserId,
            workspace_id: ctx.workspaceId !== ctx.profileUserId ? ctx.workspaceId : undefined,
            ...updates,
          });
        }
      }
    } catch (pillarsErr) {
      console.error("[ContentSeries] Failed to save pillars_new:", pillarsErr);
    }
  }

  queryClient.invalidateQueries({ queryKey: ["series"] });
  queryClient.invalidateQueries({ queryKey: ["brand-strategy"] });
}

/** Default path (tone_style, offers, ...): upserts brand_profile directly with the raw insights and invalidates every cache section that reads from it. */
export async function saveDefaultBrandProfileInsights(
  insights: Record<string, any>,
  ctx: InsightsSaveCtx,
  queryClient: QueryClient
): Promise<void> {
  const { data: existingBP } = await (supabase.from("brand_profile") as any)
    .select("id").eq(ctx.column, ctx.value).maybeSingle();
  if (existingBP?.id) {
    await (supabase.from("brand_profile") as any).update({ ...insights, updated_at: new Date().toISOString() }).eq("id", existingBP.id);
  } else {
    await (supabase.from("brand_profile") as any).insert({
      user_id: ctx.profileUserId,
      workspace_id: ctx.workspaceId !== ctx.profileUserId ? ctx.workspaceId : undefined,
      ...insights,
      updated_at: new Date().toISOString(),
    });
  }
  queryClient.invalidateQueries({ queryKey: ["brand-profile"] });
  queryClient.invalidateQueries({ queryKey: ["brand-strategy"] });
  queryClient.invalidateQueries({ queryKey: ["profile"] });
  queryClient.invalidateQueries({ queryKey: ["storytelling-primary"] });
  queryClient.invalidateQueries({ queryKey: ["storytelling-list"] });
  queryClient.invalidateQueries({ queryKey: ["brand-charter"] });
  queryClient.invalidateQueries({ queryKey: ["persona"] });
}
