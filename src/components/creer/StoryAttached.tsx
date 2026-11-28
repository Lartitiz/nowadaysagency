// « Je te pose des questions » : ce qu'elle a raconté, visible sous son idée.
// Loom du 28/11/2026 : la case ne montrait que le titre et l'angle (2 lignes) ;
// Laetitia croyait le reste perdu (« tout ce que j'ai pu dire doit se retrouver
// là »). Ses réponses partaient bien à l'écriture (withStoryAnswers) : on le montre.
import type { TakenStory } from "@/features/creer/story/story-answers";

export default function StoryAttached({ story, onDrop }: { story: TakenStory; onDrop?: () => void }) {
  const answers = story.answers.filter((a) => a.answer.trim());
  if (answers.length === 0) return null;
  return (
    <div className="rounded-xl bg-rose-pale/50 p-3 text-sm" data-testid="story-attached">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">
          Ton histoire part avec ton idée · {answers.length} réponse{answers.length > 1 ? "s" : ""}
        </p>
        {onDrop && (
          <button type="button" onClick={onDrop} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-primary" data-testid="story-attached-drop">
            Ne pas l'utiliser
          </button>
        )}
      </div>
      <details className="mt-1">
        <summary className="w-fit cursor-pointer text-xs text-primary underline underline-offset-4">Voir tout ce que tu as raconté</summary>
        <ul className="mt-2 space-y-2">
          {answers.map((a) => (
            <li key={a.id} className="border-l-2 border-primary/25 pl-3 text-xs leading-snug">
              <span className="text-muted-foreground">{a.question}</span>
              <span className="mt-0.5 block whitespace-pre-wrap text-foreground">{a.answer.trim()}</span>
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-1 text-2xs text-muted-foreground">Le contenu racontera ce que tu as vécu, avec tes mots, même si la case au-dessus le résume.</p>
    </div>
  );
}
