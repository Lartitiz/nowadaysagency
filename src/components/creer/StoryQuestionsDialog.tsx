// « Je te pose des questions » (écran Idée de /creer, 15/11/2026).
// 4 questions adaptées à sa fiche, une à la fois (dictée possible), puis un titre
// et un angle tirés de SES réponses. « Garder cette idée » pose le titre dans le
// champ et garde l'histoire pour l'écriture (story-answers.ts, use-taken-story.ts).
// Gratuit : rien n'est compté en crédit avant l'écriture du contenu.
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QuestionsWaiting, QuestionCounter, QuestionField } from "@/components/creer/QuestionParts";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  fetchStoryIdea, fetchStoryQuestions, storyIdeaText,
  type StoryAnswer, type StoryIdea, type StoryQuestion,
} from "@/features/creer/story/story-answers";

const LOADING_MESSAGES = ["Je prépare tes questions…", "Je pars de ta fiche pour les adapter à toi…"];
const THINKING_MESSAGES = ["Je tire une idée de ton histoire…", "Je cherche l'angle qui te ressemble…"];

type Phase = "loading" | "questions" | "thinking" | "idea";

export default function StoryQuestionsDialog({ open, onOpenChange, workspaceId, onKeep }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string | null;
  /** Titre (et angle) choisis, avec les réponses qui partiront à l'écriture. */
  onKeep: (subject: string, answers: StoryAnswer[]) => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<StoryQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>(["", "", "", ""]);
  const [index, setIndex] = useState(0);
  const [idea, setIdea] = useState<StoryIdea | null>(null);
  const [notice, setNotice] = useState<string | undefined>();
  const run = useRef(0);

  // Chaque ouverture repart de zéro : nouvelles questions, champs vides.
  useEffect(() => {
    if (!open) return;
    const id = ++run.current;
    setPhase("loading"); setIndex(0); setAnswers(["", "", "", ""]); setIdea(null); setNotice(undefined);
    fetchStoryQuestions(workspaceId).then((r) => {
      if (run.current !== id) return;
      setQuestions(r.questions); setNotice(r.capMessage); setPhase("questions");
    });
  }, [open, workspaceId]);

  const filled = (): StoryAnswer[] => questions
    .map((q, i) => ({ id: q.id, question: q.question, answer: answers[i] || "" }))
    .filter((a) => a.answer.trim());

  const finish = () => {
    const id = run.current;
    setPhase("thinking");
    fetchStoryIdea(filled(), workspaceId).then((r) => {
      if (run.current !== id) return;
      setIdea(r); setPhase("idea");
    });
  };

  const q = questions[index];
  const current = answers[index] || "";
  const last = index === questions.length - 1;
  // La scène est la seule réponse nécessaire : les suivantes ont « Passer ».
  const next = () => (last ? finish() : setIndex(index + 1));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) run.current++; onOpenChange(v); }}>
      <DialogContent className="max-w-lg" data-testid="story-questions-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-normal text-primary">Je te pose des questions</DialogTitle>
          <DialogDescription>Raconte un moment vécu : on en tire un post qui le raconte.</DialogDescription>
        </DialogHeader>

        {phase === "loading" && <QuestionsWaiting messages={LOADING_MESSAGES} className="py-8 text-center animate-fade-in space-y-5" />}
        {phase === "thinking" && <QuestionsWaiting messages={THINKING_MESSAGES} className="py-8 text-center animate-fade-in space-y-5" />}

        {phase === "questions" && q && (
          <div className="space-y-4">
            {notice && index === 0 && <p className="rounded-xl bg-rose-pale/60 p-3 text-xs text-muted-foreground">{notice}</p>}
            <QuestionCounter index={index} total={questions.length} />
            <QuestionField
              id="story-answer"
              testId="story-answer"
              autoFocus
              question={q.question}
              value={current}
              onChange={(value) => setAnswers((all) => all.map((a, i) => (i === index ? value : a)))}
              placeholder={q.placeholder}
              labelClassName="block font-display text-lg leading-snug text-foreground"
              textareaClassName="resize-y text-base"
            />
            <div className="flex items-center justify-between gap-3">
              {index > 0 ? (
                <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => setIndex(index - 1)}>
                  <ArrowLeft className="h-4 w-4" /> Retour
                </Button>
              ) : <span />}
              <div className="flex items-center gap-2">
                {index > 0 && !current.trim() && (
                  <Button type="button" variant="ghost" size="sm" onClick={next} data-testid="story-skip">Passer</Button>
                )}
                <Button type="button" onClick={next} disabled={!current.trim()} className="gap-2" data-testid="story-next">
                  {last ? "Trouver mon idée" : "Question suivante"} <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {phase === "idea" && idea && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-primary/40 bg-rose-pale/40 p-4">
              <p className="font-display text-lg leading-snug text-primary" data-testid="story-idea-title">{idea.titre || "Ton histoire"}</p>
              {idea.angle && <p className="mt-2 text-sm text-foreground">{idea.angle}</p>}
            </div>
            <p className="text-xs text-muted-foreground">Ton histoire part avec : le contenu racontera ce que tu as vécu, avec tes mots.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => { setIndex(questions.length - 1); setPhase("questions"); }}>
                Modifier mes réponses
              </Button>
              <Button
                type="button"
                className="gap-2"
                data-testid="story-keep"
                onClick={() => { onKeep(storyIdeaText(idea) || filled()[0]?.answer || "", filled()); onOpenChange(false); }}
              >
                Garder cette idée <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
