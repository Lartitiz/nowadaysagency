import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useOnboardingMissions } from "@/hooks/use-onboarding-missions";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

const LS_KEY = "lac_welcome_seen";
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

interface WelcomeOverlayProps {
  prenom?: string;
}

export default function WelcomeOverlay({ prenom }: WelcomeOverlayProps) {
  const { user } = useAuth();
  const { data: profileData } = useProfile();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => {
    if (!user || !profileData) return;
    if (localStorage.getItem(LS_KEY) === "true") return;
    const completedAt = (profileData as any)?.onboarding_completed_at;
    if (!completedAt) return;
    if (Date.now() - new Date(completedAt).getTime() > MAX_AGE_MS) return;
    setVisible(true);
  }, [user, profileData]);

  const close = () => {
    localStorage.setItem(LS_KEY, "true");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-2xl">
        {step === 1 ? (
          <StepOne prenom={prenom} onNext={() => setStep(2)} />
        ) : (
          <StepTwo onClose={close} />
        )}
      </div>
    </div>
  );
}

/* ─── Step 1 ─── */
function StepOne({ prenom, onNext }: { prenom?: string; onNext: () => void }) {
  const features = [
    {
      emoji: "🎨",
      title: "Ton branding",
      desc: "Ton positionnement, ta mission, tes valeurs : tout est enregistré. L'IA s'en sert pour chaque contenu.",
    },
    {
      emoji: "✨",
      title: "Tes contenus",
      desc: "Génère des posts, carrousels, reels, stories... avec TON ton et TES mots.",
    },
    {
      emoji: "📅",
      title: "Ton calendrier",
      desc: "Planifie ta semaine. Fini le 'je poste quoi aujourd'hui ?'",
    },
  ];

  return (
    <div className="text-center">
      <p className="text-4xl mb-4">🎉</p>
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">
        Bienvenue dans ton Assistant Com', {prenom || "toi"} !
      </h2>
      <p className="text-muted-foreground mb-8">Ton espace est prêt</p>

      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-[20px] bg-card border border-border p-5 text-left"
          >
            <span className="text-3xl">{f.emoji}</span>
            <h3 className="font-display font-bold text-foreground mt-3 mb-1">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </div>

      <Button onClick={onNext} size="lg">
        Suivant →
      </Button>
    </div>
  );
}

/* ─── Step 2 ─── */
function StepTwo({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { missions, nextMission } = useOnboardingMissions();

  return (
    <div className="text-center">
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">
        Par où commencer ?
      </h2>
      <p className="text-muted-foreground mb-6">Tes 5 premières missions</p>

      <div className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory mb-6 px-1">
        {missions.map((m) => {
          const isNext = nextMission?.id === m.id;
          return (
            <button
              key={m.id}
              onClick={() => {
                onClose();
                navigate(m.route);
              }}
              className={`min-w-[220px] snap-start rounded-[20px] border p-5 flex flex-col gap-2 cursor-pointer transition-all text-left shrink-0 ${
                isNext
                  ? "border-primary bg-secondary shadow-md"
                  : "border-border bg-card"
              }`}
            >
              <span className="text-3xl">{m.emoji}</span>
              <span className="text-sm font-bold text-foreground">{m.title}</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {m.time}
              </span>
              <span className="text-xs text-muted-foreground line-clamp-2">
                {m.description}
              </span>
              {isNext && (
                <span className="text-xs font-medium text-primary animate-pulse mt-auto">
                  Commencer →
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        Pas obligé de tout faire d'un coup. Commence par ce qui t'inspire.
      </p>

      <Button onClick={onClose} size="lg">
        C'est parti, je commence →
      </Button>
    </div>
  );
}
