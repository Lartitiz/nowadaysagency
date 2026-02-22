import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { ArrowLeft, Camera, Film, Smartphone, Lightbulb, PenLine, Image, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Format = "post" | "reel" | "stories";
type Parcours = "idee-floue" | "je-sais" | "inspire" | "aucune-idee";

const FORMAT_OPTIONS: { id: Format; emoji: string; label: string; desc: string }[] = [
  { id: "post", emoji: "📸", label: "Post", desc: "Carrousel, image ou texte" },
  { id: "reel", emoji: "🎬", label: "Reel", desc: "Script complet avec hook et CTA" },
  { id: "stories", emoji: "📱", label: "Stories", desc: "Séquence complète avec stickers" },
];

const PARCOURS_OPTIONS: { id: Parcours; emoji: string; label: string; desc: string }[] = [
  { id: "idee-floue", emoji: "💡", label: "J'ai une idée mais c'est flou", desc: "L'IA pose des questions pour préciser" },
  { id: "je-sais", emoji: "✍️", label: "Je sais ce que je veux dire", desc: "Sujet + ce que tu as en tête" },
  { id: "inspire", emoji: "📸", label: "J'ai un contenu qui m'inspire", desc: "Upload ou colle un lien, l'IA crée ta version" },
  { id: "aucune-idee", emoji: "🤷", label: "Aucune idée", desc: "L'IA propose des sujets selon ta ligne éditoriale" },
];

export default function InstagramCreer() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedFormat, setSelectedFormat] = useState<Format | null>(null);
  const [selectedParcours, setSelectedParcours] = useState<Parcours | null>(null);

  // Handle query params for deep-links
  useEffect(() => {
    const format = searchParams.get("format") as Format | null;
    if (format && FORMAT_OPTIONS.some((f) => f.id === format)) {
      setSelectedFormat(format);
    }
    const from = searchParams.get("from");
    if (from === "inspire") setSelectedParcours("inspire");
    if (from === "ideas") setSelectedParcours("aucune-idee");
  }, [searchParams]);

  const handleContinue = () => {
    if (!selectedFormat || !selectedParcours) return;

    // Route to the appropriate existing page based on format + parcours
    if (selectedFormat === "reel") {
      navigate("/instagram/reels");
      return;
    }
    if (selectedFormat === "stories") {
      navigate("/instagram/stories");
      return;
    }
    // Post format
    if (selectedParcours === "inspire") {
      navigate("/instagram/inspirer");
      return;
    }
    if (selectedParcours === "aucune-idee") {
      navigate("/atelier?canal=instagram");
      return;
    }
    // "idee-floue" or "je-sais" → atelier en mode rédaction
    navigate("/atelier?canal=instagram&mode=rediger");
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 animate-fade-in">
        <Link to="/instagram" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6">
          <ArrowLeft className="h-4 w-4" />
          Mon Instagram
        </Link>

        <div className="mb-8">
          <h1 className="font-display text-[26px] sm:text-3xl font-bold text-bordeaux">✨ Créer un contenu</h1>
          <p className="mt-2 text-sm text-muted-foreground">L'IA t'aide à rédiger. Tu choisis le format et le point de départ.</p>
        </div>

        {/* ─── Étape 1 : Format ─── */}
        <section className="mb-8">
          <h2 className="font-display text-lg font-bold text-foreground mb-3">1. Quel format ?</h2>
          <div className="grid grid-cols-3 gap-3">
            {FORMAT_OPTIONS.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedFormat(f.id)}
                className={`rounded-2xl border-2 p-4 text-center transition-all ${
                  selectedFormat === f.id
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <span className="text-2xl block mb-2">{f.emoji}</span>
                <p className="font-display font-bold text-sm text-foreground">{f.label}</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{f.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* ─── Étape 2 : Parcours ─── */}
        {selectedFormat && (
          <section className="mb-8 animate-fade-in">
            <h2 className="font-display text-lg font-bold text-foreground mb-3">2. D'où tu pars ?</h2>
            <div className="space-y-3">
              {PARCOURS_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedParcours(p.id)}
                  className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${
                    selectedParcours === p.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">{p.emoji}</span>
                    <div>
                      <p className="font-display font-bold text-sm text-foreground">{p.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ─── Bouton continuer ─── */}
        {selectedFormat && selectedParcours && (
          <div className="animate-fade-in">
            <Button onClick={handleContinue} className="w-full rounded-full h-12 text-base">
              Continuer →
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
