import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import Confetti from "@/components/Confetti";
import { Button } from "@/components/ui/button";
import { CheckCircle, Sparkles, ArrowRight } from "lucide-react";

export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const [showConfetti, setShowConfetti] = useState(true);
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      {showConfetti && <Confetti />}
      <main className="mx-auto max-w-lg px-4 py-16 text-center animate-fade-in">
        <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>

        <h1 className="font-display text-3xl font-bold text-foreground mb-3">
          🎉 Paiement confirmé !
        </h1>

        <p className="text-muted-foreground mb-8 leading-relaxed">
          Merci pour ta confiance. Ton accès est maintenant activé.
          <br />
          Tu peux commencer à utiliser tous les outils dès maintenant.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="rounded-full gap-2">
            <Link to="/dashboard">
              <Sparkles className="h-4 w-4" />
              Commencer
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full gap-2">
            <Link to="/parametres">
              Voir mon abonnement
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
