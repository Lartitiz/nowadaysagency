import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { STRIPE_PLANS } from "@/lib/stripe-config";
import { Button } from "@/components/ui/button";
import { Check, Shield, Heart, Loader2, ArrowLeft, ArrowRight } from "lucide-react";

const INCLUDES = [
  "L'outil complet — 300 crédits IA / mois",
  "3 sessions fondations",
  "4 sessions focus personnalisées",
  "7 sessions avec Laetitia (~12h)",
  "WhatsApp illimité 6 mois",
  "Comptes-rendus détaillés",
];

export default function CheckoutBinomePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const handleCheckout = async () => {
    if (!user) {
      navigate("/login?redirect=/checkout/binome");
      return;
    }
    setCheckoutLoading(true);
    try {
      const { data } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId: STRIPE_PLANS.studio_monthly.priceId,
          mode: "subscription",
        },
      });
      if (data?.url) window.location.href = data.url;
    } catch {
      // silent
    }
    setCheckoutLoading(false);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header minimal */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-display text-lg font-bold text-foreground">
            Nowadays
          </Link>
          {user ? (
            <Link to="/dashboard" className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
              Mon espace <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <Link to="/login?redirect=/checkout/binome" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Se connecter
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-12 animate-fade-in">
        {/* Title */}
        <div className="text-center mb-8">
          <span className="text-5xl mb-4 block">🤝</span>
          <h1 className="font-display text-3xl font-bold text-foreground">
            Ta binôme de com'
          </h1>
          <p className="text-muted-foreground mt-3 text-balance leading-relaxed">
            6 mois pour poser les bases d'une communication qui te ressemble.
            <br className="hidden sm:block" />
            L'outil + Laetitia à tes côtés.
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border border-border p-6 sm:p-8"
          style={{ background: "linear-gradient(180deg, hsl(48 100% 95%) 0%, hsl(0 0% 100%) 40%)" }}
        >
          {/* Price */}
          <div className="text-center mb-6">
            <p className="text-4xl font-bold text-foreground">
              250€<span className="text-lg font-normal text-muted-foreground">/mois</span>
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Engagement 6 mois · 1 500€ au total
            </p>
          </div>

          {/* Includes */}
          <ul className="space-y-3 mb-8">
            {INCLUDES.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-foreground">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <Button
            onClick={handleCheckout}
            disabled={checkoutLoading}
            className="w-full rounded-full h-12 text-base font-semibold"
            size="lg"
          >
            {checkoutLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Un instant...
              </>
            ) : (
              "Démarrer mon accompagnement"
            )}
          </Button>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-6 mt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Paiement sécurisé
            </span>
            <span className="flex items-center gap-1.5">
              <Heart className="h-3.5 w-3.5" /> Satisfaite ou remboursée
            </span>
          </div>

          {/* Note */}
          <p className="text-xs text-muted-foreground text-center mt-5 italic leading-relaxed">
            L'abonnement s'arrête automatiquement après 6 mois.
            <br />
            Pas de mauvaise surprise, pas de renouvellement caché.
          </p>
        </div>

        {/* Back link */}
        <div className="text-center mt-6">
          <Link to="/pricing" className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Voir tous les plans
          </Link>
        </div>
      </main>
    </div>
  );
}
