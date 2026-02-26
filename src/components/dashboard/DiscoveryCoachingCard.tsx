import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import laetitiaPhoto from "@/assets/laetitia-portrait.webp";

const DISMISS_KEY = "coaching_card_dismissed_at";
const DISCOVERY_URL = "https://calendly.com/laetitia-mattioli/appel-decouverte";

function shouldShow(): boolean {
  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (!dismissed) return true;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return new Date(dismissed) < thirtyDaysAgo;
}

const BENEFITS = [
  "Plan de com' personnalisé",
  "Sessions visio 2h/mois",
  "WhatsApp jours ouvrés",
  "Tous les outils débloqués",
];

export default function DiscoveryCoachingCard({ animationDelay = 0 }: { animationDelay?: number }) {
  const { user } = useAuth();
  const [visible, setVisible] = useState(shouldShow);

  if (!visible) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setVisible(false);
  };

  const openDiscovery = () => {
    const url = new URL(DISCOVERY_URL);
    if (user?.email) url.searchParams.set("email", user.email);
    window.open(url.toString(), "_blank");
  };

  return (
    <div
      className="relative rounded-[20px] border border-primary/15 bg-card shadow-[var(--shadow-bento)] opacity-0 animate-reveal-up mb-6"
      style={{ animationDelay: `${animationDelay}s`, animationFillMode: "forwards" }}
    >
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors z-10"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-5 sm:p-6">
        {/* Mobile: photo on top */}
        <div className="sm:hidden flex justify-center">
          <img
            src={laetitiaPhoto}
            alt="Laetitia Mattioli"
            className="w-[80px] h-auto object-contain drop-shadow-md rounded-xl"
            loading="lazy"
          />
        </div>

        {/* Left: content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">🤝</span>
            <h3 className="font-heading text-base font-bold text-foreground">Envie d'être accompagnée ?</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
            T'aimerais qu'on travaille ta com' ensemble ? Laetitia accompagne des créatrices comme toi pendant 6 mois.
          </p>

          <div className="space-y-1.5 mb-4">
            {BENEFITS.map((b) => (
              <div key={b} className="flex items-center gap-2">
                <span className="text-primary text-sm font-bold">✓</span>
                <span className="text-sm text-foreground">{b}</span>
              </div>
            ))}
          </div>

          <Button
            size="sm"
            className="rounded-full gap-1.5 text-xs"
            onClick={openDiscovery}
          >
            Réserver un appel découverte
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>

          <p className="mt-2 text-[13px] text-muted-foreground italic">
            Gratuit, 30 min, sans engagement.
          </p>
        </div>

        {/* Desktop: photo on right */}
        <div className="hidden sm:block shrink-0">
          <img
            src={laetitiaPhoto}
            alt="Laetitia Mattioli"
            className="w-[100px] h-auto object-contain drop-shadow-md rounded-xl"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
}
