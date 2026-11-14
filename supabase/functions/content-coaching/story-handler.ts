// Modes « story_questions » et « story_idea » de content-coaching (voir story.ts).
// Gratuits : comptés dans le plafond quotidien des étapes gratuites, jamais en crédit.
import { callAnthropicToolSimple, getModelForAction, type UsageSink } from "../_shared/anthropic.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { logUsageHorsCredit } from "../_shared/usage-hors-credit.ts";
import { freeStepsCapReached, FREE_STEPS_MESSAGE } from "../creative-flow/free-steps-cap.ts";
import {
  GENERIC_STORY_QUESTIONS, STORY_IDEA_TOOL, STORY_QUESTIONS_TOOL, fallbackStoryIdea,
  normalizeStoryIdea, normalizeStoryQuestions, readStoryAnswers, storyIdeaSystem,
  storyIdeaUser, storyQuestionsSystem, storyQuestionsUser,
} from "./story.ts";

export const STORY_MODES = new Set(["story_questions", "story_idea"]);

interface StoryDeps {
  // deno-lint-ignore no-explicit-any
  service: any;
  userId: string;
  workspace: string | undefined;
  // deno-lint-ignore no-explicit-any
  body: any;
  json: (body: unknown, status?: number) => Response;
}

export async function handleStoryMode({ service, userId, workspace, body, json }: StoryDeps): Promise<Response> {
  if (await freeStepsCapReached(service, userId, workspace)) {
    return json({ error: "free_steps_daily_cap", message: FREE_STEPS_MESSAGE }, 429);
  }
  const usage: UsageSink = {};
  const log = () => logUsageHorsCredit({ source: "etape_gratuite", action: `content_coaching_${body.mode}`, userId, workspaceId: workspace, model: usage.model, tokens: usage.total_tokens }, service);

  if (body.mode === "story_idea") {
    const pairs = readStoryAnswers(body.story_answers);
    if (pairs.length === 0) return json({ error: "Raconte au moins le moment pour que je puisse en tirer une idée." }, 400);
    try {
      const raw = await callAnthropicToolSimple(getModelForAction("questions"), storyIdeaSystem(), storyIdeaUser(pairs), STORY_IDEA_TOOL, 0.4, 400, usage, 30000);
      await log();
      return json({ idea: normalizeStoryIdea(raw, pairs), fallback: false });
    } catch (e) {
      console.error(JSON.stringify({ type: "story_idea_fallback", error: String((e as Error)?.message || e) }));
      return json({ idea: fallbackStoryIdea(pairs), fallback: true });
    }
  }

  // story_questions : la fiche et les histoires déjà racontées, pour adapter et éviter les redites.
  const scoped = (table: string, fields: string) => {
    const q = service.from(table).select(fields);
    return workspace ? q.eq("workspace_id", workspace) : q.eq("user_id", userId).is("workspace_id", null);
  };
  try {
    const [ctx, posts, stories] = await Promise.all([
      getUserContext(service, userId, workspace),
      scoped("calendar_posts", "theme").order("created_at", { ascending: false }).limit(20),
      scoped("storytelling", "title,pitch_short").order("updated_at", { ascending: false }).limit(3),
    ]);
    const context = formatContextForAI(ctx, { ...CONTEXT_PRESETS.content, includeStory: false, includeCharter: false, includeMirror: false }).slice(0, 9000);
    if (!context.trim()) return json({ questions: GENERIC_STORY_QUESTIONS, fallback: true });
    const alreadyTold = [
      ...((stories.data || []) as Array<{ title?: string; pitch_short?: string }>).map((s) => s.pitch_short || s.title || ""),
      ...((posts.data || []) as Array<{ theme?: string }>).map((p) => p.theme || ""),
    ].filter(Boolean).map((t) => `- ${String(t).slice(0, 160)}`).join("\n");
    const raw = await callAnthropicToolSimple(getModelForAction("questions"), storyQuestionsSystem(), storyQuestionsUser(context, alreadyTold), STORY_QUESTIONS_TOOL, 0.7, 900, usage, 30000);
    await log();
    return json({ questions: normalizeStoryQuestions(raw), fallback: false });
  } catch (e) {
    console.error(JSON.stringify({ type: "story_questions_fallback", error: String((e as Error)?.message || e) }));
    return json({ questions: GENERIC_STORY_QUESTIONS, fallback: true });
  }
}
