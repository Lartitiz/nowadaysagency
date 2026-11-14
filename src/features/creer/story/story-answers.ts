// « Je te pose des questions » (écran Idée de /creer, 14/11/2026) : partie sans écran.
//
// Elle raconte un moment vécu en 4 réponses (scène, paroles, ressenti, déclic) ;
// un titre et un angle en sont tirés (content-coaching, modes story_questions /
// story_idea, supabase/functions/content-coaching/story.ts).
//
// Ses réponses vivent À PART des réponses de l'étape Précisions : ces dernières
// sont vidées quand le sujet change (passage à l'étape Format) et par « Passer ».
// Elles sont ajoutées au moment d'écrire (`withStoryAnswers`), dans un ordre choisi :
// le serveur lit les 3 premières réponses comme anecdote, émotion, conviction
// (stream-body.ts, preGenAnswers) → scène, ressenti, déclic, puis les paroles.
// Développées, elles font reconnaître « son propre cas » (lived-case.ts) : le
// contenu raconte SA scène au lieu d'un vécu inventé.
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";

export type StoryBeat = "scene" | "paroles" | "ressenti" | "declic";
export interface StoryQuestion { id: StoryBeat; question: string; placeholder: string }
export interface StoryAnswer { id: StoryBeat; question: string; answer: string }
export interface StoryIdea { titre: string; angle: string }
/** Histoire prise pour le contenu : ses réponses et le titre qu'elle a gardé. */
export interface TakenStory { subject: string; answers: StoryAnswer[] }

/** Même texte que GENERIC_STORY_QUESTIONS côté serveur : repli hors ligne. */
export const GENERIC_STORY_QUESTIONS: StoryQuestion[] = [
  { id: "scene", question: "Raconte-moi un moment récent qui t'a marquée dans ton travail.", placeholder: "Le jour, le lieu, ce qui s'est passé." },
  { id: "paroles", question: "Qu'est-ce qui a été dit, mot pour mot ?", placeholder: "Sa phrase, puis ta réponse." },
  { id: "ressenti", question: "Qu'as-tu ressenti sur le moment ?", placeholder: "Agacée, touchée, surprise…" },
  { id: "declic", question: "Qu'est-ce que tu veux que tes lectrices en retiennent ?", placeholder: "Ce que tu en as tiré, en une phrase." },
];

/** Préfixe des clés : le modèle qui rédige voit que c'est son vécu, pas une précision. */
export const STORY_KEY_PREFIX = "Histoire vécue · ";
const GENERATION_ORDER: StoryBeat[] = ["scene", "ressenti", "declic", "paroles"];

const workspaceBody = (workspaceId?: string | null) => (workspaceId ? { workspace_id: workspaceId } : {});

/** Les 4 questions adaptées à sa fiche ; les questions générales si l'appel échoue. */
export async function fetchStoryQuestions(workspaceId?: string | null): Promise<{ questions: StoryQuestion[]; fallback: boolean; capMessage?: string }> {
  const { data, error } = await invokeWithTimeout("content-coaching", { body: { mode: "story_questions", ...workspaceBody(workspaceId) } }, 40000);
  if (data?.error === "free_steps_daily_cap") return { questions: GENERIC_STORY_QUESTIONS, fallback: true, capMessage: data.message };
  const list = Array.isArray(data?.questions) ? data.questions : [];
  if (error || list.length !== 4) return { questions: GENERIC_STORY_QUESTIONS, fallback: true };
  return { questions: list, fallback: !!data.fallback };
}

/** Repli sans IA, identique au serveur : 1re phrase de la scène, déclic en angle. */
export function fallbackStoryIdea(answers: StoryAnswer[]): StoryIdea {
  const filled = answers.filter((a) => a.answer.trim());
  const firstSentence = (s: string) => (s.trim().split(/(?<=[.!?…])\s/)[0] || s).trim();
  const cut = (s: string, words: number) => { const w = s.split(/\s+/); return w.length > words ? w.slice(0, words).join(" ") + "…" : s; };
  const scene = filled.find((a) => a.id === "scene")?.answer || filled[0]?.answer || "";
  const declic = filled.find((a) => a.id === "declic")?.answer || "";
  return { titre: cut(firstSentence(scene), 14), angle: declic ? cut(firstSentence(declic), 30) : "" };
}

/** Titre et angle tirés de ses réponses ; jamais d'échec visible (repli sur ses mots). */
export async function fetchStoryIdea(answers: StoryAnswer[], workspaceId?: string | null): Promise<StoryIdea> {
  const filled = answers.filter((a) => a.answer.trim());
  if (filled.length === 0) return { titre: "", angle: "" };
  const { data, error } = await invokeWithTimeout("content-coaching", {
    body: { mode: "story_idea", story_answers: filled.map(({ question, answer }) => ({ question, answer })), ...workspaceBody(workspaceId) },
  }, 40000);
  const idea = data?.idea;
  if (error || !idea || typeof idea.titre !== "string" || !idea.titre.trim()) return fallbackStoryIdea(filled);
  return { titre: idea.titre.trim(), angle: typeof idea.angle === "string" ? idea.angle.trim() : "" };
}

/** Texte de l'idée posé dans « Ton idée » : le titre, puis l'angle s'il existe. */
export function storyIdeaText(idea: StoryIdea): string {
  return [idea.titre, idea.angle].filter((s) => s && s.trim()).join("\n");
}

/** Réponses envoyées à l'écriture : son histoire d'abord (ordre GENERATION_ORDER), puis les Précisions. */
export function withStoryAnswers(answers: Record<string, string>, story: TakenStory | null | undefined): Record<string, string> {
  if (!story || story.answers.length === 0) return answers;
  const out: Record<string, string> = {};
  for (const beat of GENERATION_ORDER) {
    const a = story.answers.find((s) => s.id === beat);
    if (a && a.answer.trim()) out[STORY_KEY_PREFIX + a.question] = a.answer.trim();
  }
  for (const [k, v] of Object.entries(answers)) if (!(k in out)) out[k] = v;
  return out;
}

/** Bloc ajouté au sujet des questions Précisions : elles creusent l'histoire au lieu de la redemander. */
export function storyContextForQuestions(story: TakenStory | null | undefined): string {
  if (!story || story.answers.length === 0) return "";
  const lines = story.answers.filter((a) => a.answer.trim()).map((a) => `- ${a.question} ${a.answer.trim()}`);
  return lines.length ? `\n\n[Histoire déjà racontée par l'utilisatrice, ne pas la redemander]\n${lines.join("\n")}` : "";
}

const significantWords = (s: string) => new Set(
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 4),
);

/**
 * L'histoire suit-elle encore le sujet ? Elle peut retoucher le titre (garder),
 * pas écrire un autre sujet (lâcher, sinon une histoire sans rapport partirait
 * dans le contenu). Gardée si au moins 40 % des mots du titre restent.
 */
export function storyStillApplies(story: TakenStory | null | undefined, subject: string): boolean {
  if (!story) return false;
  if (subject.trim() === story.subject.trim()) return true;
  const titleWords = significantWords(story.subject);
  if (titleWords.size === 0) return subject.trim().length > 0;
  const now = significantWords(subject);
  let kept = 0;
  titleWords.forEach((w) => { if (now.has(w)) kept++; });
  return kept / titleWords.size >= 0.4;
}
