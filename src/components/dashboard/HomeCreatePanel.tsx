import { ArrowRight, Instagram, Linkedin, Mail, Pin } from "lucide-react";
import { Link } from "react-router-dom";
import { usePendingBrandReview } from "@/hooks/use-pending-brand-review";
import { cleanIdeaTitle, type IdeaToCreate } from "@/lib/idea-create-link";

const CHANNELS = [
  { id: "instagram", label: "Instagram", description: "Posts, carrousels, Reels et stories", icon: Instagram },
  { id: "linkedin", label: "LinkedIn", description: "Posts et carrousels", icon: Linkedin },
  { id: "newsletter", label: "Newsletter", description: "Un email pour ton audience", icon: Mail },
  { id: "pinterest", label: "Pinterest", description: "Des épingles pour faire découvrir ton activité", icon: Pin },
] as const;

/** Les quatre canaux du créateur restent accessibles : les préférences et les
 * flags des hubs spécialisés ne sont pas des permissions de création. */
export default function HomeCreatePanel({ onCreate, incompleteBrand, nextIdea, onCreateIdea }: {
  onCreate: (path: string) => void;
  incompleteBrand: boolean;
  /** Prochaine idée encore sans contenu (celles du diagnostic d'abord, choix I10 du 18/10/2026). */
  nextIdea?: IdeaToCreate | null;
  onCreateIdea?: (idea: IdeaToCreate) => void;
}) {
  const { pending, checking } = usePendingBrandReview();
  return (
    <section data-tour="card-next-step" aria-labelledby="home-create-title" className="rounded-2xl bg-[hsl(var(--bento-dark))] p-6 sm:p-9 text-white">
      <div className="grid gap-6 md:grid-cols-2 md:gap-10 md:items-center">
        <div>
          <h1 id="home-create-title" className="font-display text-4xl sm:text-[44px] leading-tight">Créer mon contenu</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/85">Choisis où tu veux partager ton contenu.</p>
          {incompleteBrand && !pending && <p className="mt-4 text-sm text-white/85">Tu peux commencer et compléter ton identité plus tard.</p>}
        </div>
        <div>
          {checking ? <p role="status" className="text-sm">Chargement de ton espace…</p> : pending ? (
            <div>
              <p className="mb-3 text-sm leading-relaxed">Ta fiche importée est prête à être relue pour personnaliser tes contenus.</p>
              <Link to="/branding?from=onboarding&next=creer" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-bordeaux">Relire ma fiche <ArrowRight size={16} /></Link>
            </div>
          ) : (
            <div className="divide-y divide-white/20 border-y border-white/20">
              {CHANNELS.map(({ id, label, description, icon: Icon }) => (
                <button key={id} type="button" onClick={() => onCreate(`/creer?canal=${id}&new=1`)} className="group flex w-full items-center gap-3 px-2 py-3.5 text-left hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  <Icon size={19} className="shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><span className="block text-xl font-medium">{label}</span><span className="mt-0.5 block text-xs text-white/80">{description}</span></span>
                  <ArrowRight size={18} className="shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Sous les canaux : au doigt, la ligne ne repousse pas les boutons de création. */}
      {!checking && !pending && nextIdea && onCreateIdea && (
        <div data-testid="home-next-idea" className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-sm leading-relaxed"><span className="text-white/80">Ta prochaine idée : </span><span className="font-semibold">{cleanIdeaTitle(nextIdea.titre)}</span></p>
          <button type="button" onClick={() => onCreateIdea(nextIdea)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-bordeaux focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Créer ce contenu <ArrowRight size={16} aria-hidden="true" /></button>
        </div>
      )}
    </section>
  );
}
