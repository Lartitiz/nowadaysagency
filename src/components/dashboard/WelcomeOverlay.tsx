import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/use-profile";
import { useOnboardingMissions } from "@/hooks/use-onboarding-missions";
import { Button } from "@/components/ui/button";

const LS_KEY = "lac_welcome_seen";

/* ─── Label helpers ─── */
function goalLabel(goal: string): string {
  const map: Record<string, string> = {
    visibility: "Gagner en visibilité",
    clients: "Trouver des client·es",
    credibility: "Renforcer ta crédibilité",
    community: "Créer une communauté",
    launch: "Lancer un produit/service",
  };
  return map[goal] || goal;
}

function canalLabel(canal: string): string {
  const map: Record<string, string> = {
    instagram: "Instagram",
    linkedin: "LinkedIn",
    newsletter: "Newsletter",
    website: "Site web",
    pinterest: "Pinterest",
    none: "Aucun pour l'instant",
  };
  return map[canal] || canal;
}

function tempsLabel(temps: string): string {
  const map: Record<string, string> = {
    "30min": "30 minutes",
    "1h": "1 heure",
    "2h": "2 heures",
    "3h": "3 heures",
    "5h+": "5 heures ou plus",
  };
  return map[temps] || temps;
}

/* ─── Main ─── */
interface WelcomeOverlayProps {
  prenom?: string;
}

export default function WelcomeOverlay({ prenom }: WelcomeOverlayProps) {
  const { user } = useAuth();
  const { data: profileData } = useProfile();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  useEffect(() => {
    if (!user || !profileData) return;
    if (localStorage.getItem(LS_KEY) === "true") return;
    const completedAt = (profileData as any)?.onboarding_completed_at;
    if (!completedAt) return;
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
          <StepOne prenom={prenom} profile={profileData} onNext={() => setStep(2)} />
        ) : step === 2 ? (
          <StepMethod onNext={() => setStep(3)} />
        ) : step === 3 ? (
          <StepTwo onNext={() => setStep(4)} />
        ) : (
          <StepThree onClose={close} />
        )}

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mt-8">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all ${
                s === step ? "w-8 bg-primary" : s < step ? "w-2 bg-primary/40" : "w-2 bg-border"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Step 1 : Ce que j'ai retenu de toi ─── */
function StepOne({ prenom, profile, onNext }: { prenom?: string; profile: any; onNext: () => void }) {
  const activite = profile?.activite;
  const mainGoal = profile?.main_goal;
  const canaux: string[] = profile?.canaux || [];
  const weeklyTime = profile?.weekly_time;

  return (
    <div className="text-center max-w-lg mx-auto">
      <p className="text-4xl mb-4">✨</p>
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-3">
        {prenom || "Toi"}, ton espace est prêt.
      </h2>
      <p className="text-muted-foreground mb-6">
        Voilà ce que j'ai retenu de notre échange :
      </p>

      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-left space-y-3 mb-8">
        {activite && (
          <div className="flex items-start gap-3">
            <span className="text-lg">🎯</span>
            <div>
              <p className="text-sm font-medium text-foreground">Ton activité</p>
              <p className="text-sm text-muted-foreground">{activite}</p>
            </div>
          </div>
        )}
        {mainGoal && (
          <div className="flex items-start gap-3">
            <span className="text-lg">🎯</span>
            <div>
              <p className="text-sm font-medium text-foreground">Ton objectif</p>
              <p className="text-sm text-muted-foreground">{goalLabel(mainGoal)}</p>
            </div>
          </div>
        )}
        {canaux.length > 0 && (
          <div className="flex items-start gap-3">
            <span className="text-lg">📱</span>
            <div>
              <p className="text-sm font-medium text-foreground">Tes canaux</p>
              <p className="text-sm text-muted-foreground">{canaux.map(canalLabel).join(", ")}</p>
            </div>
          </div>
        )}
        {weeklyTime && (
          <div className="flex items-start gap-3">
            <span className="text-lg">⏱️</span>
            <div>
              <p className="text-sm font-medium text-foreground">Ton temps dispo</p>
              <p className="text-sm text-muted-foreground">{tempsLabel(weeklyTime)} par semaine</p>
            </div>
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground italic mb-6">
        Tout ça, l'IA s'en sert à chaque contenu que tu génères. Rien n'est perdu.
      </p>

      <Button onClick={onNext} size="lg" className="rounded-full px-8">
        Voir ce que l'outil peut faire →
      </Button>
    </div>
  );
}

/* ─── Step 2 : Ce qui change pour toi (fusionné du RoomTour) ─── */
function StepMethod({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center max-w-lg mx-auto">
      <p className="text-4xl mb-4">🧠</p>
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-6">
        Concrètement, ça change quoi pour toi ?
      </h2>

      <div className="space-y-4 text-left mb-8">
        <div className="flex items-start gap-3">
          <span className="text-lg shrink-0">⚡</span>
          <div>
            <p className="text-sm font-medium text-foreground">Tu ne repars plus de zéro</p>
            <p className="text-sm text-muted-foreground">L'outil sait à qui tu parles, comment tu parles, ce que tu vends. Ce qui te prenait une heure t'en prend vingt.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <span className="text-lg shrink-0">🎯</span>
          <div>
            <p className="text-sm font-medium text-foreground">C'est pas du ChatGPT générique</p>
            <p className="text-sm text-muted-foreground">Chaque contenu est basé sur des structures testées et approuvées. Tu n'as pas besoin de maîtriser tout ça : l'outil le fait pour toi.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <span className="text-lg shrink-0">🧭</span>
          <div>
            <p className="text-sm font-medium text-foreground">Tu sais toujours quoi faire</p>
            <p className="text-sm text-muted-foreground">Fini le "bon, je poste quoi aujourd'hui ?". Tu es guidée. Tu as un plan. Tu avances. Même quand t'as que 30 minutes devant toi.</p>
          </div>
        </div>
      </div>

      <Button onClick={onNext} size="lg" className="rounded-full px-8">
        Voir les super-pouvoirs →
      </Button>
    </div>
  );
}

/* ─── Step 3 : Les 4 super-pouvoirs ─── */
function StepTwo({ onNext }: { onNext: () => void }) {
  const features = [
    {
      emoji: "🎨",
      title: "Ton branding, centralisé",
      desc: "Ton positionnement, ta mission, ton ton, ta cible : tout est au même endroit. Tu peux compléter, modifier, faire auditer.",
    },
    {
      emoji: "✨",
      title: "Des contenus avec TA voix",
      desc: "L'IA utilise tout ce que tu as renseigné pour écrire avec tes mots. Pas du contenu générique : du toi.",
    },
    {
      emoji: "📅",
      title: "Un calendrier qui te guide",
      desc: "Planifie ta semaine en un clic. Tu sais quoi poster, quand, et pourquoi.",
    },
    {
      emoji: "📋",
      title: "Un plan de com' sur mesure",
      desc: "Étape par étape, à ton rythme. Pas de pression, juste une direction claire.",
    },
  ];

  return (
    <div className="text-center">
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">
        Ton assistant com' en 4 super-pouvoirs
      </h2>
      <p className="text-muted-foreground mb-8">
        <em>(Oui, c'est un grand mot. Mais tu vas voir.)</em>
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-8 text-left">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <span className="text-3xl">{f.emoji}</span>
            <h3 className="font-display font-bold text-foreground mt-3 mb-1">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </div>

      <Button onClick={onNext} size="lg" className="rounded-full px-8">
        OK et maintenant, par où je commence ?
      </Button>
    </div>
  );
}

/* ─── Step 3 : Premières missions ─── */
function StepThree({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { missions, nextMission } = useOnboardingMissions();

  return (
    <div className="text-center">
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">
        5 premières missions pour démarrer
      </h2>
      <p className="text-muted-foreground mb-2">
        Pas besoin de tout faire d'un coup. Commence par ce qui t'inspire.
      </p>
      <p className="text-sm text-muted-foreground italic mb-6">
        (Tu retrouveras ces missions sur ton tableau de bord.)
      </p>

      <div className="space-y-3 mb-8 max-w-md mx-auto">
        {missions.map((m) => {
          const isNext = nextMission?.id === m.id;
          return (
            <button
              key={m.id}
              onClick={() => { onClose(); navigate(m.route); }}
              className={`w-full rounded-xl border p-4 flex items-center gap-4 text-left transition-all ${
                isNext
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-primary/20"
              }`}
            >
              <span className="text-2xl shrink-0">{m.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{m.title}</p>
                <p className="text-xs text-muted-foreground">{m.description}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{m.time}</span>
            </button>
          );
        })}
      </div>

      <Button onClick={onClose} size="lg" className="rounded-full px-8">
        C'est parti →
      </Button>
    </div>
  );
}
