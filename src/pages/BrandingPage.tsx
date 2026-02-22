import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, Pencil, Sparkles } from "lucide-react";
import { fetchBrandingData, calculateBrandingCompletion, type BrandingCompletion } from "@/lib/branding-completion";
import { supabase } from "@/integrations/supabase/client";

interface BrandingCard {
  emoji: string;
  title: string;
  description: string;
  stepperRoute: string;
  recapRoute: string;
  scoreKey: keyof Omit<BrandingCompletion, "total">;
}

const CARDS: BrandingCard[] = [
  {
    emoji: "👑",
    title: "Mon histoire",
    description: "Écris ton histoire en 8 étapes guidées. L'IA t'aide à chaque moment.",
    stepperRoute: "/branding/storytelling",
    recapRoute: "/branding/storytelling/__PRIMARY__/recap",
    scoreKey: "storytelling",
  },
  {
    emoji: "👩‍💻",
    title: "Mon client·e idéal·e",
    description: "Comprends qui tu veux toucher, ce qui la bloque, ce qu'elle désire.",
    stepperRoute: "/branding/persona",
    recapRoute: "/branding/persona/recap",
    scoreKey: "persona",
  },
  {
    emoji: "❤️",
    title: "Ma proposition de valeur",
    description: "Ce qui te rend unique. Les phrases que tu vas utiliser partout.",
    stepperRoute: "/branding/proposition",
    recapRoute: "/branding/proposition/recap",
    scoreKey: "proposition",
  },
  {
    emoji: "🎨",
    title: "Mon ton, mon style & mes combats",
    description: "Comment tu parles, ce que tu défends, tes limites. Tout ce qui fait que c'est toi.",
    stepperRoute: "/branding/ton",
    recapRoute: "/branding/ton/recap",
    scoreKey: "tone",
  },
  {
    emoji: "🍒",
    title: "Ma stratégie de contenu",
    description: "Tes piliers, ton twist créatif. Ce qui donne une colonne vertébrale à tes contenus.",
    stepperRoute: "/branding/strategie",
    recapRoute: "/branding/strategie/recap",
    scoreKey: "strategy",
  },
];

export default function BrandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [completion, setCompletion] = useState<BrandingCompletion>({ storytelling: 0, persona: 0, proposition: 0, tone: 0, strategy: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [primaryStoryId, setPrimaryStoryId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const data = await fetchBrandingData(user.id);
      setCompletion(calculateBrandingCompletion(data));

      // Find primary storytelling id for recap link
      if (data.storytellingList && data.storytellingList.length > 0) {
        const primary = data.storytellingList.find((s: any) => s.is_primary);
        setPrimaryStoryId(primary?.id || data.storytellingList[0].id);
      }
      setLoading(false);
    };
    load();
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

  const getRecapRoute = (card: BrandingCard) => {
    if (card.scoreKey === "storytelling" && primaryStoryId) {
      return card.recapRoute.replace("__PRIMARY__", primaryStoryId);
    }
    return card.recapRoute;
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[900px] px-6 py-8 max-md:px-4">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Retour au hub
        </Link>

        <h1 className="font-display text-[26px] font-bold text-foreground mb-2">Mon Branding</h1>
        <p className="text-[15px] text-muted-foreground mb-6">
          C'est ici que tout commence. Plus tu remplis, plus L'Assistant Com' te connaît et te propose des idées qui te ressemblent.
        </p>

        <div className="rounded-2xl border border-border bg-card p-5 mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-ui text-[12px] font-semibold text-foreground">
              Mon branding est complet à {completion.total}%
            </span>
          </div>
          <Progress value={completion.total} className="h-2.5 mb-2" />
          <p className="text-[12px] text-muted-foreground">{globalMessage}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map((card) => {
            const pValue = completion[card.scoreKey];
            const isCompleted = pValue === 100;
            const pLabel = isCompleted ? "✅ Complet" : `${pValue}%`;

            return (
              <div
                key={card.stepperRoute}
                className="rounded-2xl border-2 bg-card p-5 transition-all border-border hover:border-primary/30 hover:shadow-md"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{card.emoji}</span>
                </div>
                <h3 className="font-display text-base font-bold text-foreground mb-1">{card.title}</h3>
                <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">{card.description}</p>
                <div className="flex items-center gap-2 mb-4">
                  <Progress value={pValue} className="h-1.5 flex-1" />
                  <span className={`font-mono-ui text-[10px] font-semibold shrink-0 ${isCompleted ? "text-[#2E7D32]" : "text-muted-foreground"}`}>{pLabel}</span>
                </div>

                {isCompleted ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="rounded-pill text-xs flex-1"
                      onClick={() => navigate(getRecapRoute(card))}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      Voir ma fiche
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-pill text-xs"
                      onClick={() => navigate(card.stepperRoute)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : pValue > 0 ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="rounded-pill text-xs flex-1"
                      onClick={() => navigate(card.stepperRoute)}
                    >
                      Continuer →
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="rounded-pill text-xs w-full"
                    onClick={() => navigate(card.stepperRoute)}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    Commencer
                  </Button>
                )}
              </div>
            );
          })}

          {/* Mes offres card */}
          <div
            className="rounded-2xl border-2 bg-card p-5 transition-all border-primary/30 hover:border-primary hover:shadow-md cursor-pointer"
            onClick={() => navigate("/branding/offres")}
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-2xl">🎁</span>
            </div>
            <h3 className="font-display text-base font-bold text-foreground mb-1">Mes offres</h3>
            <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">
              Formule tes offres de manière désirable. L'IA te coache à chaque étape.
            </p>
            <Button
              size="sm"
              className="rounded-pill text-xs w-full"
              onClick={(e) => { e.stopPropagation(); navigate("/branding/offres"); }}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Voir mes offres
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
