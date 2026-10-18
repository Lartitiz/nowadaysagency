import { Link } from "react-router-dom";
import { cleanIdeaTitle, type IdeaToCreate } from "@/lib/idea-create-link";

/** Les idées montrées sans repli sous « Ton idée » (chantier S, 18/10/2026). */
export function IdeaPicks({ ideas, max, onPick }: { ideas: IdeaToCreate[]; max: number; onPick: (idea: IdeaToCreate) => void }) {
  return (
    <div data-testid="creer-idea-picks">
      <p className="mb-2 text-sm font-semibold text-primary">Ou choisis une de tes idées</p>
      <div className="flex flex-col gap-2">
        {ideas.slice(0, max).map((idea) => (
          <button key={idea.id} type="button" data-testid="creer-idea-pick" onClick={() => onPick(idea)} className="rounded-xl border border-border bg-card px-3 py-2.5 text-left text-sm leading-snug hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            {cleanIdeaTitle(idea.titre)}
          </button>
        ))}
      </div>
      <Link to="/idees" className="mt-2 inline-block text-xs text-primary underline underline-offset-4">Voir toutes mes idées</Link>
    </div>
  );
}
