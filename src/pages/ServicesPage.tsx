import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Target, Search, Home, ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

const CALENDLY_URL = "https://calendly.com/laetitia-mattioli/appel-decouverte-academy";

const services = [
  {
    key: "coaching",
    emoji: "🎯",
    title: "Coaching individuel",
    description: "1h avec Laetitia pour débloquer un point précis de ta communication.",
    details: [
      "Audit express de ta situation",
      "Plan d'action concret à appliquer",
      "Compte-rendu écrit post-session",
    ],
    price: 150,
    priceId: "price_1T3irCI0YZbTj9ITc6u9ocSE",
    icon: Target,
  },
  {
    key: "audit_perso",
    emoji: "🔍",
    title: "Audit personnalisé",
    description: "Audit approfondi de ta com' avec recommandations personnalisées par Laetitia.",
    details: [
      "Analyse complète de tes canaux",
      "Recommandations prioritaires",
      "Document PDF livré sous 48h",
    ],
    price: 200,
    priceId: "price_1T3irpI0YZbTj9IT8EtRTNW0",
    icon: Search,
  },
  {
    key: "weekend",
    emoji: "🏡",
    title: "Weekend Bourgogne",
    description: "3 jours au bord de l'eau. Travail sur ta com', yoga, co-développement.",
    details: [
      "Hébergement inclus (La Prochaine Aire)",
      "Ateliers com' en petit groupe",
      "Sessions yoga & bien-être",
    ],
    price: 450,
    priceId: "price_1T3is2I0YZbTj9ITseeo04eS",
    icon: Home,
  },
];

export default function ServicesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const handleCheckout = async (priceId: string, key: string) => {
    if (!user) {
      toast({ title: "Connecte-toi pour réserver", variant: "destructive" });
      return;
    }
    setLoadingKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId,
          mode: "payment",
          successUrl: `${window.location.origin}/payment/success?product=${key}`,
          cancelUrl: `${window.location.origin}/services`,
        },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch {
      toast({ title: "Erreur", description: "Impossible de lancer le paiement.", variant: "destructive" });
    }
    setLoadingKey(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-12 animate-fade-in">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">
            Services à la carte
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Pas prête pour un engagement ? Choisis ce dont tu as besoin.
          </p>
        </div>

        {/* Cards */}
        <div className="grid gap-6 md:grid-cols-3 mb-16">
          {services.map((s) => (
            <div
              key={s.key}
              className="rounded-2xl border border-border bg-card p-6 flex flex-col hover:shadow-lg transition-shadow"
            >
              <div className="text-4xl mb-4">{s.emoji}</div>
              <h2 className="font-display text-xl font-bold text-foreground mb-2">{s.title}</h2>
              <p className="text-sm text-muted-foreground mb-4 flex-1">{s.description}</p>

              <ul className="space-y-2 mb-6">
                {s.details.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="text-primary mt-0.5">✓</span>
                    {d}
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                <p className="font-display text-2xl font-bold text-foreground mb-3">{s.price}€</p>
                <Button
                  className="w-full rounded-full gap-2"
                  onClick={() => handleCheckout(s.priceId, s.key)}
                  disabled={loadingKey === s.key}
                >
                  {loadingKey === s.key ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  Réserver
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* CTA Now Studio */}
        <div className="rounded-2xl border-2 border-primary/20 bg-rose-pale/30 p-8 text-center">
          <Sparkles className="h-6 w-6 text-primary mx-auto mb-3" />
          <h2 className="font-display text-xl font-bold text-foreground mb-2">
            Envie d'un accompagnement complet ?
          </h2>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            Ta binôme de com : 6 mois pour structurer, créer et piloter ta communication. Ensemble.
          </p>
          <Button asChild variant="outline" className="rounded-full gap-2">
            <Link to="/studio">
              Découvrir l'accompagnement <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
