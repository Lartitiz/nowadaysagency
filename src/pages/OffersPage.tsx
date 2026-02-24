import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Plus, Eye, Sparkles, Gift, Gem, Mic, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDemoContext } from "@/contexts/DemoContext";
import { DEMO_DATA } from "@/lib/demo-data";
import CoachingFlow from "@/components/CoachingFlow";
import EmptyState from "@/components/EmptyState";

const TYPE_CONFIG = {
  paid: { label: "💎 Offres payantes", emoji: "💎", icon: Gem, color: "text-violet-600", badge: "bg-violet-50 text-violet-700" },
  free: { label: "🎁 Ressources gratuites (lead magnets)", emoji: "🎁", icon: Gift, color: "text-emerald-600", badge: "bg-emerald-50 text-emerald-700" },
  service: { label: "🎤 Services ponctuels", emoji: "🎤", icon: Mic, color: "text-amber-600", badge: "bg-amber-50 text-amber-700" },
};

export default function OffersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isDemoMode } = useDemoContext();
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [coachingOpen, setCoachingOpen] = useState(false);

  useEffect(() => {
    if (isDemoMode) {
      setOffers(DEMO_DATA.offers.map((o, i) => ({
        id: `demo-offer-${i}`,
        offer_type: "paid",
        name: o.name,
        price_text: o.price,
        description: o.description,
        promise: "Accompagnement sur-mesure pour développer ta marque",
        target_ideal: "Entrepreneures créatives",
        completed: true,
        completion_pct: 100,
      })));
      setLoading(false);
      return;
    }
    if (!user) return;
    supabase
      .from("offers")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setOffers(data || []);
        setLoading(false);
      });
  }, [user?.id, isDemoMode]);

  const createOffer = async (type: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("offers")
      .insert({ user_id: user.id, offer_type: type, name: "" })
      .select()
      .single();
    if (error) { toast.error("Erreur lors de la création"); return; }
    navigate(`/branding/offres/${data.id}`);
  };

  const grouped = {
    paid: offers.filter((o) => o.offer_type === "paid"),
    free: offers.filter((o) => o.offer_type === "free"),
    service: offers.filter((o) => o.offer_type === "service"),
  };

  const reloadOffers = async () => {
    if (!user) return;
    const { data } = await supabase.from("offers").select("*").eq("user_id", user.id).order("created_at", { ascending: true });
    setOffers(data || []);
  };

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
        <Link to="/branding" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Retour au branding
        </Link>

        <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
          <h1 className="font-display text-[26px] font-bold text-foreground">🎁 Mes offres</h1>
          <Button onClick={() => setCoachingOpen(true)} variant="outline" className="gap-2 rounded-full text-sm">
            <Sparkles className="h-4 w-4" />
            Coaching offres
          </Button>
        </div>
        <p className="text-[15px] text-muted-foreground mb-8">
          Formule tes offres de manière désirable. L'IA te coache à chaque étape pour que tes offres parlent à ta cliente idéale.
        </p>

        {offers.length === 0 ? (
          <EmptyState
            icon="🎁"
            title="Tu n'as pas encore d'offres"
            body="C'est le moment de les formuler ! L'IA t'accompagne pour rendre chaque offre désirable et claire."
            cta="✨ Créer ma première offre"
            onAction={() => createOffer("paid")}
          />
        ) : (
          (["paid", "free", "service"] as const).map((type) => {
            const config = TYPE_CONFIG[type];
            const items = grouped[type];
            return (
              <div key={type} className="mb-8">
                <h2 className="font-display text-base font-bold text-foreground mb-3">{config.label}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((offer) => {
                    const pct = offer.completion_pct || 0;
                    const isComplete = offer.completed || pct === 100;
                    return (
                      <div
                        key={offer.id}
                        className="rounded-2xl border-2 bg-card p-5 transition-all border-border hover:border-primary/30 hover:shadow-md cursor-pointer"
                        onClick={() => navigate(`/branding/offres/${offer.id}`)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-display text-sm font-bold text-foreground truncate flex-1">
                            {offer.name || "Sans nom"}
                          </h3>
                          <Badge variant="secondary" className={`${config.badge} text-[10px] ml-2 shrink-0`}>
                            {config.emoji}
                          </Badge>
                        </div>

                        {offer.price_text && (
                          <p className="text-xs font-semibold text-primary mb-1">{offer.price_text}</p>
                        )}

                        {offer.promise && (
                          <p className="text-xs italic text-muted-foreground mb-2 line-clamp-2">"{offer.promise}"</p>
                        )}

                        {offer.target_ideal && (
                          <p className="text-[11px] text-muted-foreground mb-3">🎯 {offer.target_ideal}</p>
                        )}

                        {/* Completion bar */}
                        <div className="flex items-center gap-2 mb-3">
                          <Progress value={pct} className="h-1.5 flex-1" />
                          <span className={`font-mono-ui text-[10px] font-semibold ${isComplete ? "text-emerald-600" : "text-muted-foreground"}`}>
                            {isComplete ? "✅" : `${pct}%`}
                          </span>
                        </div>

                        <Button
                          size="sm"
                          variant={isComplete ? "outline" : "default"}
                          className="rounded-full text-xs w-full"
                          onClick={(e) => { e.stopPropagation(); navigate(`/branding/offres/${offer.id}`); }}
                        >
                          {isComplete ? (
                            <><Eye className="h-3.5 w-3.5 mr-1" />Voir la fiche</>
                          ) : pct > 0 ? (
                            <>Continuer →</>
                          ) : (
                            <><Sparkles className="h-3.5 w-3.5 mr-1" />Commencer</>
                          )}
                        </Button>
                      </div>
                    );
                  })}
                  <div
                    className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-5 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/30 transition-all min-h-[140px]"
                    onClick={() => createOffer(type)}
                  >
                    <Plus className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground font-medium">Ajouter</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* Coaching panel (slide-in) */}
      {coachingOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCoachingOpen(false)} />
          <div className="relative ml-auto w-full max-w-lg bg-background h-full overflow-y-auto shadow-xl animate-fade-in">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" /> Coaching offres
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setCoachingOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <CoachingFlow
                module="offers"
                onComplete={async () => {
                  setCoachingOpen(false);
                  await reloadOffers();
                }}
                onSkip={() => setCoachingOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
