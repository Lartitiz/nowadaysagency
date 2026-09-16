import { ArrowRight, Instagram, Linkedin, Mail, Pin } from "lucide-react";
import { Link } from "react-router-dom";
import { usePendingBrandReview } from "@/hooks/use-pending-brand-review";

const CHANNELS = [
  { id: "instagram", label: "Instagram", description: "Posts, carrousels, Reels et stories", icon: Instagram },
  { id: "linkedin", label: "LinkedIn", description: "Posts et carrousels", icon: Linkedin },
  { id: "newsletter", label: "Newsletter", description: "Un email pour ton audience", icon: Mail },
  { id: "pinterest", label: "Pinterest", description: "Des épingles pour faire découvrir ton activité", icon: Pin },
] as const;

/** Les quatre canaux du créateur restent accessibles : les préférences et les
 * flags des hubs spécialisés ne sont pas des permissions de création. */
export default function HomeCreatePanel({ onCreate, incompleteBrand }: {
  onCreate: (path: string) => void;
  incompleteBrand: boolean;
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
    </section>
  );
}
