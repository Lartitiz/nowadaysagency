import { ArrowRight, Instagram, Linkedin, Mail, Pin } from "lucide-react";
import { Link } from "react-router-dom";
import { useActiveChannels } from "@/hooks/use-active-channels";
import { usePendingBrandReview } from "@/hooks/use-pending-brand-review";

const CHANNELS = [
  { id: "instagram", label: "Instagram", description: "Posts, carrousels, Reels et stories", icon: Instagram },
  { id: "linkedin", label: "LinkedIn", description: "Posts et carrousels", icon: Linkedin },
  { id: "newsletter", label: "Newsletter", description: "Un email pour ton audience", icon: Mail },
  { id: "pinterest", label: "Pinterest", description: "Des épingles pour faire découvrir ton activité", icon: Pin },
] as const;

/** Les préférences de canal ne sont pas les flags des hubs spécialisés. */
export default function HomeCreatePanel({ onCreate, incompleteBrand }: {
  onCreate: (path: string) => void;
  incompleteBrand: boolean;
}) {
  const { channels, loading, error, reload } = useActiveChannels();
  const { pending, checking } = usePendingBrandReview();
  const visible = CHANNELS.filter(channel => channels.includes(channel.id));
  return (
    <section data-tour="card-next-step" aria-labelledby="home-create-title" className="rounded-3xl bg-[hsl(var(--bento-dark))] p-6 sm:p-8 text-white">
      <div className="grid gap-6 md:grid-cols-2 md:gap-10 md:items-center">
        <div>
          <h1 id="home-create-title" className="font-display text-3xl sm:text-[38px] leading-tight">Créer mon contenu</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/85">Pars d’une idée, d’un texte ou de tes photos.</p>
          {incompleteBrand && !pending && <p className="mt-4 text-sm text-white/85">Tu peux commencer et compléter ton identité plus tard.</p>}
        </div>
        <div>
          {checking ? <p role="status" className="text-sm">Chargement de ton espace…</p> : pending ? (
            <div>
              <p className="mb-3 text-sm leading-relaxed">Ta fiche importée est prête à être relue pour personnaliser tes contenus.</p>
              <Link to="/branding?from=onboarding&next=creer" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-bordeaux">Relire ma fiche <ArrowRight size={16} /></Link>
            </div>
          ) : loading ? <p role="status" className="text-sm">Chargement de tes canaux…</p> : error ? (
            <div role="alert"><p className="text-sm">Tes canaux n’ont pas pu être chargés.</p><button type="button" onClick={reload} className="mt-3 underline underline-offset-4">Réessayer</button></div>
          ) : visible.length ? (
            <div className="divide-y divide-white/20">
              {visible.map(({ id, label, description, icon: Icon }) => (
                <button key={id} type="button" onClick={() => onCreate(`/creer?canal=${id}&new=1`)} className="group flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  <Icon size={19} className="shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><span className="block font-semibold">{label}</span><span className="mt-0.5 block text-xs text-white/80">{description}</span></span>
                  <ArrowRight size={18} className="shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <button type="button" onClick={() => onCreate("/creer?new=1")} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-bordeaux">Commencer un contenu <ArrowRight size={18} /></button>
          )}
        </div>
      </div>
    </section>
  );
}
