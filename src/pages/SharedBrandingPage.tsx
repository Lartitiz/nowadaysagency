import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, AlertCircle, Sparkles } from "lucide-react";

interface SharedData {
  title: string;
  profile: { prenom: string | null; activite: string | null; mission: string | null };
  storytelling: any;
  persona: any;
  voice: any;
  proposition: any;
  strategy: any;
  offers: any[];
}

function Section({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="text-xl">{emoji}</span>
        <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-base text-foreground/80 leading-relaxed whitespace-pre-line">{value}</p>
    </div>
  );
}

export default function SharedBrandingPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shared-branding-access?token=${encodeURIComponent(token)}`;
        const response = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          setError(err.error || "Lien invalide");
          setLoading(false);
          return;
        }
        setData(await response.json());
      } catch {
        setError("Impossible de charger cette synthèse");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center max-w-sm space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="font-display text-xl font-bold text-foreground">{error || "Lien introuvable"}</h1>
          <p className="text-sm text-muted-foreground">Ce lien de partage est invalide ou a expiré.</p>
          <Link to="/" className="inline-block text-sm text-primary font-medium hover:underline mt-4">
            Découvrir L'Assistant Com' →
          </Link>
        </div>
      </div>
    );
  }

  const { profile, storytelling, persona, voice, proposition, strategy, offers } = data;
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-[700px] px-6 py-6 max-md:px-4 text-center">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">
            {profile.prenom ? `Synthèse Branding de ${profile.prenom}` : "Synthèse Branding"}
          </h1>
          {profile.activite && (
            <p className="text-sm text-muted-foreground mt-1">{profile.activite}</p>
          )}
          <p className="text-xs text-muted-foreground/60 mt-2 flex items-center justify-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Générée avec L'Assistant Com' · {today}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4 space-y-8">

        {/* L'essentiel */}
        {(proposition?.version_final || proposition?.version_one_liner || profile.mission) && (
          <Section emoji="🎯" title="L'essentiel">
            <Field label="Positionnement" value={proposition?.version_final || proposition?.version_one_liner} />
            <Field label="Mission" value={profile.mission} />
            <Field label="Bio" value={proposition?.version_bio} />
            <Field label="Pitch naturel" value={proposition?.version_pitch_naturel} />
          </Section>
        )}

        {/* Mon histoire */}
        {storytelling?.step_7_polished && (
          <Section emoji="📖" title="Mon histoire">
            <Field label="Mon récit" value={storytelling.step_7_polished} />
            <Field label="Pitch court" value={storytelling.pitch_short} />
          </Section>
        )}

        {/* Ma cliente idéale */}
        {persona && (persona.step_1_frustrations || persona.step_2_transformation) && (
          <Section emoji="👩‍💻" title="Ma cliente idéale">
            <Field label="Ses frustrations" value={persona.step_1_frustrations} />
            <Field label="Sa transformation rêvée" value={persona.step_2_transformation} />
            <Field label="Ses objections" value={persona.step_3a_objections} />
          </Section>
        )}

        {/* Ma voix */}
        {voice && (voice.voice_description || voice.combat_cause) && (
          <Section emoji="🎨" title="Ma voix & mes combats">
            <Field label="Comment je parle" value={voice.voice_description} />
            <Field label="Ma cause" value={voice.combat_cause} />
            <Field label="Mes combats" value={voice.combat_fights} />
            <Field label="Ce que je refuse" value={voice.combat_refusals} />
            <Field label="Mes expressions clés" value={voice.key_expressions} />
            <Field label="Ce que j'évite" value={voice.things_to_avoid} />
          </Section>
        )}

        {/* Ma stratégie */}
        {strategy && (strategy.pillar_major || strategy.creative_concept) && (
          <Section emoji="🍒" title="Ma ligne éditoriale">
            <Field label="Pilier majeur" value={strategy.pillar_major} />
            {[strategy.pillar_minor_1, strategy.pillar_minor_2, strategy.pillar_minor_3].filter(Boolean).length > 0 && (
              <Field
                label="Piliers mineurs"
                value={[strategy.pillar_minor_1, strategy.pillar_minor_2, strategy.pillar_minor_3].filter(Boolean).join(" · ")}
              />
            )}
            <Field label="Concept créatif" value={strategy.creative_concept} />
            {[strategy.facet_1, strategy.facet_2, strategy.facet_3].filter(Boolean).length > 0 && (
              <Field
                label="Facettes"
                value={[strategy.facet_1, strategy.facet_2, strategy.facet_3].filter(Boolean).join(" · ")}
              />
            )}
          </Section>
        )}

        {/* Mes offres */}
        {offers.length > 0 && (
          <Section emoji="💎" title="Mes offres">
            <div className="space-y-4">
              {offers.map((offer: any, i: number) => (
                <div key={i} className="rounded-xl border border-border/60 bg-background p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm text-foreground">{offer.name}</p>
                    {offer.price_text && (
                      <span className="text-xs font-medium text-muted-foreground">{offer.price_text}</span>
                    )}
                  </div>
                  {offer.promise && <p className="text-sm text-foreground/70">{offer.promise}</p>}
                  {offer.sales_line && <p className="text-sm italic text-foreground/60">{offer.sales_line}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}
      </main>

      {/* Footer CTA */}
      <footer className="border-t border-border bg-card py-6 text-center">
        <p className="text-xs text-muted-foreground mb-2">Créé avec</p>
        <Link to="/" className="text-sm font-semibold text-primary hover:underline">
          L'Assistant Com' →
        </Link>
      </footer>
    </div>
  );
}
