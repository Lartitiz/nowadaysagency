import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, ArrowLeft } from "lucide-react";

export default function StrategieRecapPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("brand_strategy").select("*").eq("user_id", user.id).maybeSingle()
      .then(({ data: d }) => { setData(d); setLoading(false); });
  }, [user]);

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copié !" });
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[640px] px-6 py-8">
        <p className="text-muted-foreground">Aucune stratégie enregistrée.</p>
        <Link to="/branding/strategie" className="text-primary hover:underline mt-4 block">Commencer →</Link>
      </main>
    </div>
  );

  const facets = [
    { text: data.facet_1, format: data.facet_1_format },
    { text: data.facet_2, format: data.facet_2_format },
    { text: data.facet_3, format: data.facet_3_format },
  ].filter((f) => f.text);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[640px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Récap stratégie" />

        <h1 className="font-display text-[26px] font-bold text-foreground mb-6">Ta stratégie de contenu</h1>

        {/* Facettes */}
        {facets.length > 0 && (
          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-foreground mb-3">Les facettes que tu vas oser montrer</h2>
            <div className="space-y-2">
              {facets.map((f, i) => (
                <div key={i} className="rounded-xl border-2 border-border bg-card p-4 flex justify-between items-center">
                  <div>
                    <p className="text-[15px] text-foreground font-medium">{f.text}</p>
                    {f.format && <p className="text-[12px] text-muted-foreground">📱 {f.format}</p>}
                  </div>
                  <button onClick={() => copyText(f.text)} className="text-primary hover:text-primary/80"><Copy className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Nuage de mots */}
        {(data.cloud_offer || data.cloud_clients || data.cloud_universe) && (
          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-foreground mb-3">Ton univers de mots</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {data.cloud_offer && (
                <div className="rounded-xl border-2 border-border bg-card p-4">
                  <p className="font-semibold text-[13px] text-foreground mb-2">🌿 Ce que tu proposes</p>
                  <p className="text-[13px] text-muted-foreground">{data.cloud_offer}</p>
                </div>
              )}
              {data.cloud_clients && (
                <div className="rounded-xl border-2 border-border bg-card p-4">
                  <p className="font-semibold text-[13px] text-foreground mb-2">🧠 Tes client·es</p>
                  <p className="text-[13px] text-muted-foreground">{data.cloud_clients}</p>
                </div>
              )}
              {data.cloud_universe && (
                <div className="rounded-xl border-2 border-border bg-card p-4">
                  <p className="font-semibold text-[13px] text-foreground mb-2">✨ Ton univers</p>
                  <p className="text-[13px] text-muted-foreground">{data.cloud_universe}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Piliers */}
        {data.pillar_major && (
          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-foreground mb-3">Tes piliers de contenu</h2>
            <div className="rounded-xl border-2 border-primary/30 bg-card p-4 mb-2">
              <p className="font-semibold text-foreground">🔥 Majeure : {data.pillar_major}</p>
            </div>
            {[data.pillar_minor_1, data.pillar_minor_2, data.pillar_minor_3].filter(Boolean).map((p, i) => (
              <div key={i} className="rounded-xl border-2 border-border bg-card p-4 mb-2">
                <p className="text-foreground">🌱 {p}</p>
              </div>
            ))}
          </section>
        )}

        {/* Concept créatif */}
        {(data.creative_concept || data.ai_concepts) && (
          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-foreground mb-3">Ton concept créatif</h2>
            {data.creative_concept && (
              <div className="rounded-xl border-2 border-border bg-card p-4 mb-3">
                <p className="text-[15px] text-foreground italic leading-relaxed">{data.creative_concept}</p>
              </div>
            )}
            {data.ai_concepts && Array.isArray(data.ai_concepts) && (
              <div className="space-y-2">
                {data.ai_concepts.map((c: any, i: number) => (
                  <div key={i} className="rounded-xl border-2 border-border bg-card p-4">
                    <p className="font-semibold text-sm text-foreground mb-1">{c.concept}</p>
                    <p className="text-[12px] text-muted-foreground">{c.exemple}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">📱 {c.format}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Message */}
        <div className="rounded-xl bg-rose-pale p-5 text-[14px] text-foreground leading-relaxed mb-6">
          Ta stratégie de contenu est posée. Maintenant, chaque fois que tu vas dans l'atelier d'idées, l'IA s'appuie sur tes piliers, tes combats, et ton concept créatif pour te proposer des idées qui te ressemblent vraiment.
        </div>

        <Link to="/branding">
          <Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Retour au Branding</Button>
        </Link>
      </main>
    </div>
  );
}
