import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowRight, Sparkles } from "lucide-react";
import {
  LAUNCH_TEMPLATES,
  OFFER_TYPE_OPTIONS,
  PRICE_RANGE_OPTIONS,
  AUDIENCE_SIZE_OPTIONS,
  RECURRENCE_OPTIONS,
  TIME_OPTIONS,
  FALLBACK_TIME_OPTIONS,
  recommendLaunchModel,
  type RecommendationAnswers,
} from "@/lib/launch-templates";

export default function InstagramLaunchRecommendation() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const navigate = useNavigate();

  const [launch, setLaunch] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [showReco, setShowReco] = useState(false);
  const [editorialTime, setEditorialTime] = useState<number | null>(null);
  const [hasEditorialLine, setHasEditorialLine] = useState(false);

  // Answers
  const [offerType, setOfferType] = useState("");
  const [priceRange, setPriceRange] = useState("");
  const [audienceSize, setAudienceSize] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [extraTime, setExtraTime] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: launchesData } = await supabase
        .from("launches")
        (supabase.from("launches") as any)
        .select("*")
        .eq(column, value)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!launchesData?.length) { navigate("/instagram/lancement"); return; }
      setLaunch(launchesData[0]);

      const { data: edito } = await supabase
        .from("instagram_editorial_line")
        (supabase.from("instagram_editorial_line") as any)
        .select("estimated_weekly_minutes")
        .eq(column, value)
        .maybeSingle();
      if (edito?.estimated_weekly_minutes) {
        setEditorialTime(Math.round(edito.estimated_weekly_minutes / 60));
        setHasEditorialLine(true);
      }
      setLoaded(true);
    })();
  }, [user?.id]);

  const canShowReco = offerType && priceRange && audienceSize && recurrence && extraTime;

  const recommended = canShowReco
    ? recommendLaunchModel({ offerType, priceRange, audienceSize, recurrence, extraTime })
    : null;

  const recommendedTemplate = recommended ? LAUNCH_TEMPLATES.find((t) => t.id === recommended) : null;
  const otherTemplates = LAUNCH_TEMPLATES.filter((t) => t.id !== recommended);

  const chooseModel = async (modelId: string) => {
    if (!launch) return;
    const extraHours = extraTime
      ? TIME_OPTIONS.find((t) => t.id === extraTime)?.hours ?? FALLBACK_TIME_OPTIONS.find((t) => t.id === extraTime)?.hours ?? 0
      : 0;

    await supabase.from("launches").update({
      launch_model: modelId,
      offer_type: offerType,
      price_range: priceRange,
      audience_size: audienceSize,
      recurrence,
      extra_weekly_hours: extraHours,
    }).eq("id", launch.id);

    toast.success("Modèle sélectionné !");
    navigate("/instagram/lancement/plan");
  };

  if (!loaded) return null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Lancement" parentTo="/instagram/lancement" currentLabel="Recommandation" />
        <h1 className="font-display text-[26px] font-bold text-foreground">🎯 On choisit ton modèle de lancement</h1>
        <p className="mt-1 text-sm text-muted-foreground italic">
          Quelques questions pour te recommander le plan qui te correspond le mieux.
        </p>

        {!showReco ? (
          <div className="mt-6 space-y-6">
            {/* Q1: Offer type */}
            <QuestionBlock title="1. Quel type d'offre ?">
              {OFFER_TYPE_OPTIONS.map((o) => (
                <RadioOption key={o.id} selected={offerType === o.id} onClick={() => setOfferType(o.id)}>
                  {o.emoji} {o.label}
                </RadioOption>
              ))}
            </QuestionBlock>

            {/* Q2: Price range */}
            <QuestionBlock title="2. Quelle gamme de prix ?">
              {PRICE_RANGE_OPTIONS.map((o) => (
                <RadioOption key={o.id} selected={priceRange === o.id} onClick={() => setPriceRange(o.id)}>
                  {o.label}
                </RadioOption>
              ))}
            </QuestionBlock>

            {/* Q3: Audience */}
            <QuestionBlock title="3. Taille de ton audience Instagram ?">
              {AUDIENCE_SIZE_OPTIONS.map((o) => (
                <RadioOption key={o.id} selected={audienceSize === o.id} onClick={() => setAudienceSize(o.id)}>
                  {o.label}
                </RadioOption>
              ))}
            </QuestionBlock>

            {/* Q4: Recurrence */}
            <QuestionBlock title="4. C'est une offre récurrente ou ponctuelle ?">
              {RECURRENCE_OPTIONS.map((o) => (
                <RadioOption key={o.id} selected={recurrence === o.id} onClick={() => setRecurrence(o.id)}>
                  {o.label}
                </RadioOption>
              ))}
            </QuestionBlock>

            {/* Q5: Time */}
            <QuestionBlock title="5. Temps disponible par semaine pour ce lancement ?">
              {hasEditorialLine && editorialTime && (
                <p className="text-xs text-muted-foreground mb-2">
                  D'après ta ligne éditoriale : <strong>{editorialTime}h/semaine</strong> habituelles
                </p>
              )}
              {TIME_OPTIONS.map((o) => (
                <RadioOption key={o.id} selected={extraTime === o.id} onClick={() => setExtraTime(o.id)}>
                  {o.label}
                </RadioOption>
              ))}
            </QuestionBlock>

            <Button
              onClick={() => setShowReco(true)}
              disabled={!canShowReco}
              size="lg"
              className="w-full rounded-full gap-2"
            >
              <Sparkles className="h-4 w-4" /> Voir ma recommandation
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-6 animate-fade-in">
            <h2 className="font-display text-lg font-bold">✨ Ma recommandation pour toi</h2>

            {/* Recommended */}
            {recommendedTemplate && (
              <Card className="border-primary ring-2 ring-primary/20">
                <CardContent className="p-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{recommendedTemplate.emoji}</span>
                    <h3 className="font-display text-lg font-bold text-foreground">
                      {recommendedTemplate.label} ({recommendedTemplate.duration})
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {getRecommendationExplanation(recommended!, { offerType, priceRange, audienceSize, recurrence, extraTime })}
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>📊 {recommendedTemplate.contentRange}</span>
                    <span>⏱️ {recommendedTemplate.duration}</span>
                  </div>
                  <Button onClick={() => chooseModel(recommendedTemplate.id)} className="rounded-full gap-2 mt-2">
                    📅 Choisir ce plan <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Others */}
            <h3 className="font-display font-bold text-muted-foreground">💡 D'autres options</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {otherTemplates.map((t) => (
                <Card key={t.id} className="hover:border-primary/40 transition-all">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{t.emoji}</span>
                      <h4 className="font-display font-bold text-sm">{t.label}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground">{t.duration} · {t.contentRange}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                    <Button variant="outline" size="sm" onClick={() => chooseModel(t.id)} className="rounded-full text-xs">
                      Choisir
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button variant="outline" onClick={() => setShowReco(false)} className="rounded-full">
              ← Modifier mes réponses
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Helper components ──

function QuestionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-display font-bold text-foreground">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function RadioOption({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border p-3 text-sm transition-colors",
        selected
          ? "border-primary bg-primary/5 font-medium"
          : "border-border bg-card hover:border-primary/40"
      )}
    >
      {children}
    </button>
  );
}

function getRecommendationExplanation(model: string, answers: RecommendationAnswers): string {
  const priceLabel = PRICE_RANGE_OPTIONS.find((p) => p.id === answers.priceRange)?.label || answers.priceRange;
  const audienceLabel = AUDIENCE_SIZE_OPTIONS.find((a) => a.id === answers.audienceSize)?.label || answers.audienceSize;

  switch (model) {
    case "express":
      return `Avec un prix ${priceLabel} et ton audience de ${audienceLabel}, un plan rapide et percutant est idéal. Pas besoin de chauffer longtemps : ton audience est prête.`;
    case "moyen":
      return `Pour ton offre à ${priceLabel} avec ${audienceLabel} abonné·es, c'est le meilleur compromis : assez de temps pour chauffer ton audience sans t'épuiser.`;
    case "long":
      return `Ton offre à ${priceLabel} mérite un lancement d'envergure. Avec le temps que tu as, un plan long te permet de construire l'anticipation et la confiance.`;
    case "soft":
      return `Avec une audience de ${audienceLabel}, un lancement doux est plus adapté. Pas de pression : tu testes, tu observes, tu ajustes.`;
    case "evenementiel":
      return `Ton événement mérite un plan dédié qui crée l'anticipation, engage pendant le live, et convertit après.`;
    case "evergreen":
      return `Ton offre permanente/récurrente fonctionne mieux avec un système evergreen + des mini-lancements saisonniers pour relancer l'intérêt.`;
    default:
      return "Ce plan est adapté à ta situation.";
  }
}
