import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, AlertCircle, Sparkles } from "lucide-react";

interface SharedData {
  title: string;
  personas?: any[];
  stories?: any[];
  read_at?: string;
  link?: { created_at?: string; expires_at?: string };
  scope?: string;
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

function Portrait({ value }: { value: unknown }) {
  if (typeof value === "string") {
    try { return <Portrait value={JSON.parse(value)} />; } catch { return <p className="whitespace-pre-line">{value}</p>; }
  }
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return <ul className="list-disc pl-5">{value.map((item, i) => <li key={i}><Portrait value={item} /></li>)}</ul>;
  if (typeof value === "object") return <dl className="space-y-2">{Object.entries(value).map(([key, item]) => <div key={key}><dt className="text-xs font-semibold">{key.replace(/_/g, " ")}</dt><dd><Portrait value={item} /></dd></div>)}</dl>;
  return <span>{String(value)}</span>;
}

export default function SharedBrandingPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [retryable, setRetryable] = useState(false);
  const [loadedToken, setLoadedToken] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setData(null); setError(null); setLoading(true); setRetryable(false);
    if (!token) { setError("Lien introuvable"); setLoading(false); return; }
    const controller = new AbortController();
    const load = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shared-branding-access?token=${encodeURIComponent(token)}`;
        const response = await fetch(url, {
          signal: controller.signal, cache: "no-store",
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          if (cancelled) return;
          setLoadedToken(token); setRetryable(response.status >= 500);
          setError(err.error || "Lien invalide");
          setLoading(false);
          return;
        }
        const result = await response.json();
        if (!cancelled) { setLoadedToken(token); setData(result); }
      } catch {
        if (cancelled) return;
        setLoadedToken(token); setRetryable(true);
        setError("Impossible de charger cette synthèse");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; controller.abort(); };
  }, [token, retry]);

  if (loading || (token && token !== loadedToken)) {
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
          <p className="text-sm text-muted-foreground">{retryable ? "La lecture a échoué. Tu peux réessayer sans changer de lien." : "Ce lien n’est pas disponible. Contacte la personne qui l’a partagé."}</p>
          {retryable && <button className="text-primary underline" onClick={() => setRetry(n => n + 1)}>Réessayer</button>}
          <Link to="/" className="inline-block text-sm text-primary font-medium hover:underline mt-4">
            Découvrir L'Assistant Com' →
          </Link>
        </div>
      </div>
    );
  }

  const { profile, storytelling, persona, voice, proposition, strategy, offers } = data;
  const personas = data.personas || (persona ? [persona] : []);
  const stories = data.stories || (storytelling ? [storytelling] : []);

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
            <Sparkles className="h-3 w-3" /> Vue actualisée avec L'Assistant Com'
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4 space-y-8">

        <p className="text-sm text-muted-foreground">{data.scope || "Les données sont relues à chaque ouverture."}</p>
        {data.link?.created_at && <p className="text-xs text-muted-foreground">Lien créé le {new Date(data.link.created_at).toLocaleDateString("fr-FR")}{data.link.expires_at && ` · Expire le ${new Date(data.link.expires_at).toLocaleString("fr-FR")}`}</p>}
        {data.read_at && <p className="text-xs text-muted-foreground">Données consultées le {new Date(data.read_at).toLocaleString("fr-FR")}</p>}
        {/* L'essentiel */}
        {(proposition || profile.mission) && (
          <Section emoji="🎯" title="L'essentiel">
            <Field label="Positionnement" value={proposition?.version_final || proposition?.version_one_liner} />
            <Field label="Mission" value={profile.mission} />
            <Field label="Bio" value={proposition?.version_bio} />
            <Field label="Pitch naturel" value={proposition?.version_pitch_naturel} />
            <Field label="One-liner" value={proposition?.version_one_liner} /><Field label="Version site web" value={proposition?.version_site_web} /><Field label="Version engagée" value={proposition?.version_engagee} />
          </Section>
        )}

        <Section emoji="📖" title={`Histoires principales (${stories.length})`}>
          {stories.length === 0 && <p>Aucune histoire principale enregistrée.</p>}
          {stories.map((story: any, index: number) => <div key={story.id || index} className="space-y-3 border-b last:border-0 pb-4">
            <h3 className="font-semibold">{story.title || `Histoire ${index + 1}`}</h3>
            <Field label="Récit de référence" value={story.step_7_polished} />
            {!story.step_7_polished && <p className="text-sm text-muted-foreground">Récit final non renseigné.</p>}
            <Field label="Pitch court" value={story.pitch_short} /><Field label="Pitch moyen" value={story.pitch_medium} /><Field label="Pitch long" value={story.pitch_long} />
          </div>)}
        </Section>
        <Section emoji="👩‍💻" title={`Publics (${personas.length})`}>
          {personas.length === 0 && <p>Aucun public enregistré.</p>}
          {personas.map((publicItem: any, index: number) => <div key={publicItem.id || index} className="space-y-3 border-b last:border-0 pb-4">
            <h3 className="font-semibold">{publicItem.label || publicItem.portrait_prenom || `Public ${index + 1}`}{publicItem.is_primary ? " · Principal" : ""}</h3>
            <Field label="Ses frustrations" value={publicItem.step_1_frustrations} /><Field label="Sa transformation rêvée" value={publicItem.step_2_transformation} /><Field label="Ses objections" value={publicItem.step_3a_objections} />
            <Field label="Les clichés" value={publicItem.step_3b_cliches} /><Field label="Ce qui est beau" value={publicItem.step_4_beautiful} /><Field label="Ce qui inspire" value={publicItem.step_4_inspiring} /><Field label="Ce qui repousse" value={publicItem.step_4_repulsive} /><Field label="Le ressenti" value={publicItem.step_4_feeling} />
            {publicItem.portrait && <details><summary className="cursor-pointer text-sm">Portrait enregistré</summary><Portrait value={publicItem.portrait} /></details>}
          </div>)}
        </Section>

        {/* Ma voix */}
        {voice && (
          <Section emoji="🎨" title="Ma voix & mes combats">
            <Field label="Comment je parle" value={voice.voice_description} />
            <Field label="Ma cause" value={voice.combat_cause} />
            <Field label="Mes combats" value={voice.combat_fights} />
            <Field label="Ce que je refuse" value={voice.combat_refusals} />
            <Field label="Mes expressions clés" value={voice.key_expressions} />
            <Field label="Ce que j'évite" value={voice.things_to_avoid} />
            {["combat_alternative", "tone_register", "tone_level", "tone_style", "tone_humor", "tone_engagement", "target_verbatims"].map((key, i) => <Field key={key} label={["Mon alternative", "Registre", "Niveau de langage", "Style", "Humour", "Engagement", "Verbatims"][i]} value={voice[key]} />)}
          </Section>
        )}

        {/* Ma stratégie */}
        {strategy && (
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
        {offers.length === 0 && <Section emoji="💎" title="Mes offres"><p>Aucune offre enregistrée.</p></Section>}
        {offers.length > 0 && (
          <Section emoji="💎" title="Mes offres">
            <div className="space-y-4">
              {offers.map((offer: any, i: number) => (
                <div key={offer.id || i} className="rounded-xl border border-border/60 bg-background p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm text-foreground">{offer.name}</p>
                    {offer.price_text && (
                      <span className="text-xs font-medium text-muted-foreground">{offer.price_text}</span>
                    )}
                  </div>
                  <Field label="Type" value={offer.offer_type === "paid" ? "Payante" : offer.offer_type === "free" ? "Gratuite" : offer.offer_type === "service" ? "Service" : offer.offer_type} /><Field label="Pour qui" value={offer.target_ideal} />
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
