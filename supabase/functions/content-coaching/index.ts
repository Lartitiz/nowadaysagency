import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { AnthropicError } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";
import { generateDeepIdeas } from "../_shared/ideas/pipeline.ts";
import { parseDeepIdea } from "../_shared/ideas/contract.ts";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Non authentifié" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "Non authentifié" }, 401);
    const rate = checkRateLimit(user.id);
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterMs!, cors);
    const body = await req.json();
    const workspace = body.workspace_id || undefined;
    if (workspace && (typeof workspace !== "string" || !/^[0-9a-f-]{36}$/i.test(workspace))) return json({ error: "Espace invalide" }, 400);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (!(await assertWorkspaceMembership(service, user.id, workspace)).ok) return workspaceDeniedResponse(cors);
    const quota = await checkQuota(user.id, "suggestion", workspace);
    if (!quota.allowed) return json({ error: quota.message, quota }, 429);
    if (body.mode === "seeds") return json({ seeds: [] }); // old clients continue directly, without an extra charged generation
    const text = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
    const a = body.answers || {};
    const subject = text(a.sujet, 1500), activity = text(a.activity, 500);
    const channel = ["instagram", "linkedin", "pinterest", "newsletter"].includes(a.canal) ? a.canal : undefined;
    // Personal scope must exclude every workspace, including spaces owned by user.
    const scoped = (table: string, fields: string) => {
      const q = service.from(table).select(fields);
      return workspace ? q.eq("workspace_id", workspace) : q.eq("user_id", user.id).is("workspace_id", null);
    };
    const read = async (query: any) => { const r = await query; if (r.error) throw new Error("Impossible de charger la matière de ton activité. Réessaie."); return r.data || []; };
    const [ctx, posts, saved, personas, stories, generated] = await Promise.all([
      getUserContext(service, user.id, workspace, channel),
      read(scoped("calendar_posts", "theme,angle,canal").order("created_at", { ascending: false }).limit(16)),
      read(scoped("saved_ideas", "titre,angle").order("created_at", { ascending: false }).limit(16)),
      read(scoped("persona", "portrait_prenom,description,step_1_frustrations,step_2_transformation,step_3a_objections").order("is_primary", { ascending: false }).order("updated_at", { ascending: false }).limit(3)),
      read(scoped("storytelling", "title,step_7_polished,step_6_full_story,pitch_short").order("is_primary", { ascending: false }).order("updated_at", { ascending: false }).limit(3)),
      read(scoped("generated_carousels", "subject,hook_text").order("created_at", { ascending: false }).limit(12)),
    ]);
    const hasActivity = activity || ctx.profile?.activite || ctx.profile?.mission || ctx.profile?.offre || ctx.tone?.mission || ctx.tone?.offer || ctx.proposition?.version_final || ctx.proposition?.version_complete || ctx.proposition?.version_one_liner || ctx.offers?.length;
    if (!hasActivity) return json({ needs_activity: true, message: "Pour proposer des idées adaptées, décris simplement ton activité et à qui tu t'adresses." });
    const base = formatContextForAI(ctx, { ...CONTEXT_PRESETS.content, includeStory: false, includePersona: false, includeCharter: false, includeMirror: false });
    const seasonal = (Array.isArray(body.upcoming_marronniers) ? body.upcoming_marronniers : []).slice(0, 3).map((m: any) => `${text(m?.label, 60)} ${text(m?.date, 10)}`).join("; ");
    const context = `${base.slice(0, 15000)}\nREPÈRES CALENDAIRES : ${seasonal}. Au plus une idée liée à un temps fort, uniquement si pertinent pour le métier.\nACTIVITÉ PRÉCISÉE : ${activity}\nPUBLICS DISPONIBLES (ne pas les confondre) :\n${JSON.stringify(personas).slice(0, 6500)}\nRÉCITS DISPONIBLES :\n${stories.map((s: any) => `${s.title || "Récit"} : ${text(s.step_7_polished || s.step_6_full_story || s.pitch_short, 1600)}`).join("\n")}`;
    const previous = (Array.isArray(body.previous_ideas) ? body.previous_ideas : []).slice(-24).map((p: any) => ({ subject: text(p?.subject, 220), insight: text(p?.insight, 500), feedback: text(p?.feedback, 200) }));
    // A previous idea is editorial material, not an authority for a new citation.
    // Research runs again when an assertion needs support. No client URL is trusted.
    const deepen = body.deepen_idea ? parseDeepIdea(body.deepen_idea) : undefined;
    if (body.deepen_idea && !deepen) return json({ error: "Cette idée ne peut pas être approfondie. Relance une sélection." }, 400);
    const result = await generateDeepIdeas({ context, history: JSON.stringify([...posts, ...saved, ...generated]).slice(0, 6500), subject, objective: text(a.objectif, 50) || "auto", channel, format: text(a.format, 50) || "auto", previous, deepen: deepen || undefined, refinement: text(body.refinement, 1000) });
    await logUsage(user.id, "suggestion", "content_coaching", result.usage.total_tokens, result.usage.model, workspace);
    // Compatibility for older open clients: render the fuller explanation too.
    return json({ ...result, ideas: result.ideas.map(i => ({ ...i, why_it_works: i.reader_benefit, brief: i.mechanism })), recommended_subject: result.ideas[0].subject, format_reason: "Choisis le format qui sert cette idée à l'étape suivante." });
  } catch (error) {
    console.error("[content-coaching]", error);
    return json({ error: error instanceof AnthropicError ? error.message : error instanceof Error ? error.message : "Impossible de préparer les idées. Réessaie." }, error instanceof AnthropicError ? error.status : 500);
  }
});
