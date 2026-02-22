import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Plus, Pencil, Eye, Sparkles, Gift, Gem, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TYPE_CONFIG = {
  paid: { label: "💎 Offres payantes", emoji: "💎", icon: Gem, color: "text-violet-600" },
  free: { label: "🎁 Ressources gratuites (lead magnets)", emoji: "🎁", icon: Gift, color: "text-emerald-600" },
  service: { label: "🎤 Services ponctuels", emoji: "🎤", icon: Mic, color: "text-amber-600" },
};

export default function OffersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, [user]);

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

        <h1 className="font-display text-[26px] font-bold text-foreground mb-2">🎁 Mes offres</h1>
        <p className="text-[15px] text-muted-foreground mb-8">
          Formule tes offres de manière désirable. L'IA te coache à chaque étape pour que tes offres parlent à ta cliente idéale.
        </p>

        {(["paid", "free", "service"] as const).map((type) => {
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
                      onClick={() => navigate(isComplete ? `/branding/offres/${offer.id}` : `/branding/offres/${offer.id}`)}
                    >
                      <h3 className="font-display text-sm font-bold text-foreground mb-1 truncate">
                        {offer.name || "Sans nom"}
                      </h3>
                      {offer.price_text && (
                        <p className="text-xs text-muted-foreground mb-2">{offer.price_text}</p>
                      )}
                      <div className="flex items-center gap-2 mb-3">
                        <Progress value={pct} className="h-1.5 flex-1" />
                        <span className={`font-mono-ui text-[10px] font-semibold shrink-0 ${isComplete ? "text-[#2E7D32]" : "text-muted-foreground"}`}>
                          {isComplete ? "✅ Complète" : `${pct}%`}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant={isComplete ? "outline" : "default"}
                        className="rounded-pill text-xs w-full"
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
        })}
      </main>
    </div>
  );
}
