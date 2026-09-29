/**
 * visual-direction-suggest — propose la « direction photo et vidéo » de la
 * charte à partir de ce que l'outil connaît déjà de la marque.
 * Pattern quota : checkQuota → appel IA → logUsage (uniquement si succès).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { callAnthropic, getModelForAction, type UsageSink } from "../_shared/anthropic.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";
import { tryParseAiJson } from "../_shared/parse-ai-json.ts";

const KEYS = ["composition", "light", "framing", "retouch", "video_motion"] as const;

function clip(v: unknown, n = 600): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.slice(0, n);
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Non autorisé" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const sbUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await sbUser.auth.getUser();
    if (!user) return json({ error: "Non autorisé" }, 401);
    const userId = user.id;

    const { charterData, workspace_id } = await req.json().catch(() => ({}));

    const rate = checkRateLimit(userId);
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterMs!, corsHeaders);

    const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const membership = await assertWorkspaceMembership(sb, userId, workspace_id);
    if (!membership.ok) return workspaceDeniedResponse(corsHeaders);

    let ownerId = userId;
    if (workspace_id) {
      const { data: o } = await sb.from("workspace_members").select("user_id")
        .eq("workspace_id", workspace_id).eq("role", "owner").maybeSingle();
      if (o?.user_id) ownerId = o.user_id;
    }

    const quota = await checkQuota(userId, "coach", workspace_id);
    if (!quota.allowed) return quotaDeniedResponse(quota, corsHeaders);

    const col = workspace_id ? "workspace_id" : "user_id";
    const val = workspace_id || ownerId;
    const [profile, brand] = await Promise.all([
      sb.from("profiles").select("activite, type_activite").eq("user_id", ownerId).maybeSingle(),
      sb.from("brand_profile").select("*").eq(col, val).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const b: any = brand.data || {};
    const c: any = charterData || {};
    const context = [
      `Activité : ${clip(profile.data?.activite)} ${clip(profile.data?.type_activite)}`,
      `Positionnement : ${clip(b.positioning)}`,
      `Mission : ${clip(b.mission)}`,
      `Valeurs : ${clip(b.values)}`,
      `Ton : ${clip(b.tone_register)} ${clip(b.tone_style)}`,
      `Ambiance / mood : ${clip(c.mood_keywords)} ${clip(c.mood_description ?? c.mood)}`,
      `Style visuel : ${clip(c.visual_style)} ${clip(c.photo_style)}`,
      `À éviter visuellement : ${clip(c.visual_donts)}`,
      `Couleurs : ${clip([c.color_primary, c.color_secondary, c.color_accent, c.color_background].filter(Boolean).join(", "))}`,
      `Direction actuelle : ${clip(c.visual_direction)}`,
    ].filter((l) => !/:\s*$/.test(l.trim())).join("\n");

    const system = `${BASE_SYSTEM_RULES}

Tu es directrice artistique. À partir de ce que l'on sait de la marque, propose sa direction photo et vidéo.
Règles : concret, visuel, applicable par un·e photographe ou une IA d'image. 1 à 2 phrases courtes par champ (max 300 caractères). Pas de jargon creux, pas d'adjectifs vides. Ne pas inventer de produit ni de personne. Tutoiement non nécessaire (descriptions).
Réponds UNIQUEMENT en JSON : {"composition":"","light":"","framing":"","retouch":"","video_motion":""}
- composition : place du sujet, espace pour le texte, lignes, formes récurrentes
- light : type de lumière attendue
- framing : distance, angle, place autour du sujet
- retouch : grain, contraste, saturation, traitements à éviter
- video_motion : rythme, mouvements de caméra, transitions`;

    const usage: UsageSink = {};
    const raw = await callAnthropic({
      model: getModelForAction("coaching_light"),
      system,
      messages: [{ role: "user", content: `Ce que je sais de la marque :\n${context || "(peu d'informations)"}` }],
      temperature: 0.6,
      max_tokens: 1500,
      abortTimeoutMs: 60_000,
    }, usage);

    const parsed = tryParseAiJson<Record<string, unknown>>(raw, "visual-direction-suggest");
    if (!parsed) return json({ error: "L'IA a renvoyé une réponse illisible. Réessaie." }, 502);
    const direction: Record<string, string> = {};
    for (const k of KEYS) if (typeof parsed[k] === "string") direction[k] = (parsed[k] as string).trim().slice(0, 500);
    if (!Object.keys(direction).length) return json({ error: "Aucune proposition exploitable. Réessaie." }, 502);

    await logUsage(userId, "coach", "visual_direction_suggest", usage.total_tokens, usage.model, workspace_id);
    return json({ direction });
  } catch (e) {
    console.error("visual-direction-suggest error:", e);
    return json({ error: e instanceof Error ? e.message : "Erreur interne" }, (e as any)?.status || 500);
  }
});
