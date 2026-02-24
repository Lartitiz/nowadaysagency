import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Copy, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";

const TESTIMONIAL_MESSAGE = `Hello [prénom] ! J'aimerais beaucoup avoir ton retour sur notre collaboration. Ça m'aiderait énormément.
Si tu as 5 minutes, voici 4 questions :

1. C'était quoi ta situation AVANT ? (ta galère principale)
2. Qu'est-ce qui a changé concrètement PENDANT ?
3. C'est quoi le résultat le plus concret APRÈS ?
4. À qui tu recommanderais ça ?

Tu peux répondre en 3-4 lignes, c'est parfait.`;

const TIPS = [
  "Demande dans les 2 semaines après la fin (à chaud)",
  "Si possible, demande une vidéo courte (20-30 sec) : les témoignages vidéo augmentent la conversion de 80%",
  "3-5 témoignages sur la page = équilibre optimal",
  "Les notes de 4,2-4,5/5 convertissent mieux que 5/5 (la perfection semble suspecte)",
  "Jamais modifier les mots de la personne",
];

export default function SiteTestimonials() {
  const { user } = useAuth();
  const [rawTestimonial, setRawTestimonial] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié !");
  };

  const structureTestimonial = async () => {
    if (!user || !rawTestimonial.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("website-ai", {
        body: { action: "structure-testimonial", raw_testimonial: rawTestimonial },
      });
      if (error) throw error;
      const raw = data?.content || "";
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      setResult(JSON.parse(cleaned));
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast.error(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon Site Web" parentTo="/site" currentLabel="Témoignages" />

        <h1 className="font-display text-[26px] font-bold text-foreground mb-2">💬 Récolter des témoignages qui convertissent</h1>
        <p className="text-sm text-muted-foreground mb-8">Un bon témoignage = prénom + contexte + résultat concret. Le problème c'est que les gens ne savent pas quoi écrire. Envoie-leur ces questions.</p>

        {/* Message template */}
        <div className="rounded-2xl border border-border bg-card p-6 mb-8">
          <h2 className="font-display text-lg font-bold text-foreground mb-3">📋 Message à envoyer à tes client·es</h2>
          <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed whitespace-pre-line mb-4">
            {TESTIMONIAL_MESSAGE}
          </div>
          <Button variant="outline" size="sm" onClick={() => copyText(TESTIMONIAL_MESSAGE)}>
            <Copy className="h-4 w-4 mr-1" /> Copier le message
          </Button>
        </div>

        {/* Tips */}
        <div className="rounded-2xl border border-border bg-card p-6 mb-8">
          <h2 className="font-display text-lg font-bold text-foreground mb-3">💡 Conseils</h2>
          <ul className="space-y-2">
            {TIPS.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="text-primary mt-0.5">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Structure tool */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold text-foreground mb-3">✨ Structurer un témoignage reçu</h2>
          <p className="text-sm text-muted-foreground mb-4">Colle le retour brut de ta cliente. L'IA va le restructurer sans changer ses mots.</p>

          <Textarea
            className="min-h-[120px] mb-4"
            placeholder="Colle ici le témoignage brut reçu de ta cliente..."
            value={rawTestimonial}
            onChange={(e) => setRawTestimonial(e.target.value)}
          />

          <Button onClick={structureTestimonial} disabled={loading || !rawTestimonial.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {loading ? "Structuration..." : "Structurer pour la page de vente"}
          </Button>

          {result && (
            <div className="mt-6 space-y-4">
              {result.highlight && (
                <div className="rounded-xl bg-primary/10 p-4">
                  <p className="font-mono-ui text-[11px] font-semibold text-primary-text mb-1">💎 Phrase forte</p>
                  <p className="text-base font-bold text-foreground italic">"{result.highlight}"</p>
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyText(result.highlight)}>
                    <Copy className="h-3 w-3 mr-1" /> Copier
                  </Button>
                </div>
              )}

              <div className="rounded-xl bg-rose-pale p-4">
                <p className="font-mono-ui text-[11px] font-semibold text-primary-text mb-1">📝 Citation structurée</p>
                <p className="text-[14px] text-foreground italic leading-relaxed">"{result.quote}"</p>
                {result.name && <p className="text-sm text-muted-foreground mt-2">— {result.name}{result.context ? `, ${result.context}` : ""}</p>}
                {result.result && <p className="text-sm text-primary-text font-semibold mt-1">📊 {result.result}</p>}
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyText(`"${result.quote}"\n— ${result.name || ""}${result.context ? `, ${result.context}` : ""}`)}>
                  <Copy className="h-3 w-3 mr-1" /> Copier
                </Button>
              </div>

              {result.full_version && (
                <div className="rounded-xl border border-border p-4">
                  <p className="font-mono-ui text-[11px] font-semibold text-muted-foreground mb-1">Version complète</p>
                  <p className="text-[13px] text-foreground leading-relaxed">{result.full_version}</p>
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyText(result.full_version)}>
                    <Copy className="h-3 w-3 mr-1" /> Copier
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
