import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { fetchBrandingData, calculateBrandingCompletion, type BrandingCompletion } from "@/lib/branding-completion";

/* ─── Card definition ─── */
interface BrandingCard {
  emoji: string;
  title: string;
  description: string;
  route: string;
  cta: string;
  scoreKey: keyof Omit<BrandingCompletion, "total">;
  available: boolean;
}

const CARDS: BrandingCard[] = [
  {
    emoji: "👑",
    title: "Mon histoire",
    description: "Écris ton histoire en 8 étapes guidées. L'IA t'aide à chaque moment.",
    route: "/branding/storytelling",
    cta: "Voir mes storytellings →",
    scoreKey: "storytelling",
    available: true,
  },
  {
    emoji: "👩‍💻",
    title: "Mon client·e idéal·e",
    description: "Comprends qui tu veux toucher, ce qui la bloque, ce qu'elle désire.",
    route: "/branding/persona",
    cta: "Définir mon persona →",
    scoreKey: "persona",
    available: true,
  },
  {
    emoji: "❤️",
    title: "Ma proposition de valeur",
    description: "Ce qui te rend unique. Les phrases que tu vas utiliser partout.",
    route: "/branding/proposition",
    cta: "Trouver ma proposition de valeur →",
    scoreKey: "proposition",
    available: true,
  },
  {
    emoji: "🎨",
    title: "Mon ton, mon style & mes combats",
    description: "Comment tu parles, ce que tu défends, tes limites. Tout ce qui fait que c'est toi.",
    route: "/branding/ton",
    cta: "Définir ma voix →",
    scoreKey: "tone",
    available: true,
  },
  {
    emoji: "🍒",
    title: "Ma stratégie de contenu",
    description: "Tes piliers, ton twist créatif. Ce qui donne une colonne vertébrale à tes contenus.",
    route: "/branding/strategie",
    cta: "Poser ma stratégie →",
    scoreKey: "strategy",
    available: true,
  },
];

/* ─── Main ─── */
export default function BrandingPage() {
  const { user } = useAuth();
  const [completion, setCompletion] = useState<BrandingCompletion>({ storytelling: 0, persona: 0, proposition: 0, tone: 0, strategy: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchBrandingData(user.id).then((data) => {
      setCompletion(calculateBrandingCompletion(data));
      setLoading(false);
    });
  }, [user]);

  const globalMessage =
    completion.total > 80
      ? "Ton branding est solide. L'IA te connaît bien."
      : completion.total >= 50
        ? "Tu avances bien ! Quelques sections à compléter."
        : "Continue à remplir pour débloquer tout le potentiel de l'outil.";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[900px] px-6 py-8 max-md:px-4">
        {/* Back */}
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Retour au hub
        </Link>

        {/* Header */}
        <h1 className="font-display text-[26px] font-bold text-foreground mb-2">Mon Branding</h1>
        <p className="text-[15px] text-muted-foreground mb-6">
          C'est ici que tout commence. Plus tu remplis, plus L'Assistant Com' te connaît et te propose des idées qui te ressemblent.
        </p>

        {/* Global score */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-ui text-[12px] font-semibold text-foreground">
              Mon branding est complet à {completion.total}%
            </span>
          </div>
          <Progress value={completion.total} className="h-2.5 mb-2" />
          <p className="text-[12px] text-muted-foreground">{globalMessage}</p>
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map((card) => {
            const pValue = completion[card.scoreKey];
            const pLabel = pValue === 100 ? "✅ Complet" : `${pValue}%`;

            return (
              <Link
                key={card.route}
                to={card.route}
                className="block rounded-2xl border-2 bg-card p-5 transition-all group border-border hover:border-primary hover:shadow-md cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{card.emoji}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h3 className="font-display text-base font-bold text-foreground mb-1">{card.title}</h3>
                <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">{card.description}</p>
                <div className="flex items-center gap-2 mb-2">
                  <Progress value={pValue} className="h-1.5 flex-1" />
                  <span className={`font-mono-ui text-[10px] font-semibold shrink-0 ${pValue === 100 ? "text-[#2E7D32]" : "text-muted-foreground"}`}>{pLabel}</span>
                </div>
                <span className="font-mono-ui text-[11px] font-semibold text-primary">{card.cta}</span>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
