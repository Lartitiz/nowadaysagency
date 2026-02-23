import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { useToast } from "@/hooks/use-toast";
import Confetti from "@/components/Confetti";
import { Film, SkipForward } from "lucide-react";

const GOAL_OPTIONS = [
  { key: "start", emoji: "🌱", label: "Poser les bases de ma com' (je démarre)" },
  { key: "visibility", emoji: "📱", label: "Être plus visible sur les réseaux" },
  { key: "launch", emoji: "🎁", label: "Lancer une offre ou un produit" },
  { key: "clients", emoji: "🎯", label: "Trouver des client·es" },
  { key: "structure", emoji: "🗂️", label: "Structurer ce que je fais déjà" },
];

const LEVEL_OPTIONS = [
  { key: "beginner", emoji: "🐣", label: "Je démarre", desc: "Pas encore de compte ou très récent" },
  { key: "intermediate", emoji: "🐥", label: "J'ai un compte mais je poste au feeling", desc: "" },
  { key: "advanced", emoji: "🦅", label: "J'ai déjà une stratégie, je veux l'optimiser", desc: "" },
];

const TIME_OPTIONS = [
  { key: "less_2h", emoji: "⏰", label: "Moins de 2h", desc: "L'essentiel en mode express" },
  { key: "2_5h", emoji: "⏰", label: "2 à 5h", desc: "Le bon équilibre" },
  { key: "5_10h", emoji: "⏰", label: "5 à 10h", desc: "Tu peux aller loin" },
  { key: "more_10h", emoji: "⏰", label: "Plus de 10h", desc: "La com' c'est ton truc" },
];

export default function Onboarding() {
  const { user } = useAuth();
  const { isDemoMode, demoData, skipDemoOnboarding } = useDemoContext();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showConfetti, setShowConfetti] = useState(false);
  const [saving, setSaving] = useState(false);

  const storedPrenom = localStorage.getItem("lac_prenom") || "";
  const storedActivite = localStorage.getItem("lac_activite") || "";

  const demoDefaults = demoData?.onboarding;

  const [step, setStep] = useState(1);
  const [prenom, setPrenom] = useState(isDemoMode ? (demoDefaults?.prenom ?? "") : storedPrenom);
  const [activite, setActivite] = useState(isDemoMode ? (demoDefaults?.activite ?? "") : storedActivite);
  const [mainGoal, setMainGoal] = useState(isDemoMode ? (demoDefaults?.mainGoal ?? "") : "");
  const [level, setLevel] = useState(isDemoMode ? (demoDefaults?.level ?? "") : "");
  const [weeklyTime, setWeeklyTime] = useState(isDemoMode ? (demoDefaults?.weeklyTime ?? "") : "");

  // Load existing profile data (real mode only)
  useEffect(() => {
    if (isDemoMode) return;
    if (!user) return;
    const load = async () => {
      const [{ data: profile }, { data: config }] = await Promise.all([
        supabase.from("profiles").select("prenom, activite, main_goal, level, weekly_time").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_plan_config").select("main_goal, level, weekly_time, onboarding_completed").eq("user_id", user.id).maybeSingle(),
      ]);
      if (config?.onboarding_completed) {
        navigate("/dashboard", { replace: true });
        return;
      }
      if (profile) {
        if (profile.prenom) setPrenom(profile.prenom);
        if (profile.activite) setActivite(profile.activite);
        if (profile.main_goal) setMainGoal(profile.main_goal);
        if (profile.level) setLevel(profile.level);
        if (profile.weekly_time) setWeeklyTime(profile.weekly_time);
        if (profile.prenom && profile.activite) setStep(2);
      }
      if (config) {
        if (config.main_goal && config.main_goal !== 'start') setMainGoal(config.main_goal);
        if (config.level && config.level !== 'beginner') setLevel(config.level);
        if (config.weekly_time && config.weekly_time !== 'less_2h') setWeeklyTime(config.weekly_time);
      }
    };
    load();
  }, [user?.id, isDemoMode]);

  const canNext = () => {
    if (step === 1) return prenom.trim().length > 0 && activite.trim().length > 0;
    if (step === 2) return mainGoal && level;
    if (step === 3) return !!weeklyTime;
    return true;
  };

  const handleSkipDemo = () => {
    skipDemoOnboarding();
    navigate("/dashboard", { replace: true });
  };

  const handleFinish = async () => {
    // In demo mode, just skip to dashboard
    if (isDemoMode) {
      skipDemoOnboarding();
      navigate("/dashboard", { replace: true });
      return;
    }

    if (!user) return;
    setSaving(true);
    try {
      const { data: existingProfile } = await supabase
        .from("profiles").select("id").eq("user_id", user.id).maybeSingle();

      const profileData = {
        prenom,
        activite,
        main_goal: mainGoal,
        level,
        weekly_time: weeklyTime,
        onboarding_completed: true,
      };

      if (existingProfile) {
        await supabase.from("profiles").update(profileData).eq("user_id", user.id);
      } else {
        await supabase.from("profiles").insert({ user_id: user.id, ...profileData });
      }

      const { data: existingConfig } = await supabase
        .from("user_plan_config").select("id").eq("user_id", user.id).maybeSingle();

      const configData = {
        main_goal: mainGoal,
        level,
        weekly_time: weeklyTime,
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
      };

      if (existingConfig) {
        await supabase.from("user_plan_config").update(configData).eq("user_id", user.id);
      } else {
        await supabase.from("user_plan_config").insert({ user_id: user.id, ...configData });
      }

      localStorage.removeItem("lac_prenom");
      localStorage.removeItem("lac_activite");

      setShowConfetti(true);
      setTimeout(() => navigate("/welcome"), 1800);
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Demo skip banner */}
      {isDemoMode && (
        <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2.5 bg-rose-pale border-b border-border">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Film className="h-4 w-4 text-primary" />
            <span>🎬 Mode démo · {demoData?.profile.first_name}, {demoData?.profile.activity_type}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSkipDemo}
            className="h-8 text-xs gap-1.5 border-primary/30 hover:bg-primary/5"
          >
            <SkipForward className="h-3.5 w-3.5" />
            Skip → Voir l'outil rempli
          </Button>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        {showConfetti && <Confetti />}
        <div className="w-full max-w-lg">
          {/* Step 1: Name + Activity */}
          {step === 1 && (
            <div className="animate-fade-in space-y-6">
              <div className="text-center space-y-3">
                <span className="text-4xl">✨</span>
                <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">
                  {isDemoMode ? `Bienvenue ${prenom} !` : "Bienvenue sur L'Assistant Com'"}
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
                  L'outil qui t'aide à poser, structurer et piloter toute ta communication. À ton rythme.
                </p>
                <p className="text-xs text-muted-foreground">
                  On va prendre 1 minute pour personnaliser ton expérience.
                </p>
              </div>

              <div className="rounded-2xl bg-card border border-border p-6 space-y-5">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    Comment tu t'appelles ?
                  </label>
                  <Input
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                    placeholder="Ton prénom"
                    className="rounded-xl h-12"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    Qu'est-ce que tu fais ? (en une phrase)
                  </label>
                  <Input
                    value={activite}
                    onChange={(e) => setActivite(e.target.value)}
                    placeholder='Ex : "Photographe", "Coach sportive", "Graphiste freelance", "Artisane céramiste"'
                    className="rounded-xl h-12"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => setStep(2)}
                    disabled={!canNext()}
                    className="rounded-pill"
                  >
                    C'est parti →
                  </Button>
                </div>
              </div>

              <ProgressDots current={1} total={3} />
            </div>
          )}

          {/* Step 2: Goal + Level */}
          {step === 2 && (
            <div className="animate-fade-in space-y-6">
              <div className="text-center space-y-2">
                <h1 className="font-display text-2xl font-bold text-foreground">
                  Salut {prenom} 👋
                </h1>
              </div>

              <div className="rounded-2xl bg-card border border-border p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-3">
                    C'est quoi ton objectif principal en ce moment ?
                  </h3>
                  <div className="space-y-2">
                    {GOAL_OPTIONS.map((g) => (
                      <OptionCard
                        key={g.key}
                        emoji={g.emoji}
                        label={g.label}
                        selected={mainGoal === g.key}
                        onClick={() => setMainGoal(g.key)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-foreground mb-3">
                    Et t'en es où avec ta com' ?
                  </h3>
                  <div className="space-y-2">
                    {LEVEL_OPTIONS.map((l) => (
                      <OptionCard
                        key={l.key}
                        emoji={l.emoji}
                        label={l.label}
                        desc={l.desc}
                        selected={level === l.key}
                        onClick={() => setLevel(l.key)}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)} className="rounded-pill">
                    ← Retour
                  </Button>
                  <Button onClick={() => setStep(3)} disabled={!canNext()} className="rounded-pill">
                    Suivant →
                  </Button>
                </div>
              </div>

              <ProgressDots current={2} total={3} />
            </div>
          )}

          {/* Step 3: Weekly Time */}
          {step === 3 && (
            <div className="animate-fade-in space-y-6">
              <div className="text-center space-y-2">
                <h1 className="font-display text-2xl font-bold text-foreground">
                  Dernière question {prenom},
                </h1>
                <p className="text-sm text-muted-foreground">
                  Tu peux consacrer combien de temps par semaine à ta com' ?
                </p>
                <p className="text-xs text-muted-foreground italic">
                  (Pas de jugement. L'outil s'adapte à TON rythme.)
                </p>
              </div>

              <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
                <div className="space-y-2">
                  {TIME_OPTIONS.map((t) => (
                    <OptionCard
                      key={t.key}
                      emoji={t.emoji}
                      label={t.label}
                      desc={t.desc}
                      selected={weeklyTime === t.key}
                      onClick={() => setWeeklyTime(t.key)}
                    />
                  ))}
                </div>

                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setStep(2)} className="rounded-pill">
                    ← Retour
                  </Button>
                  <Button
                    onClick={handleFinish}
                    disabled={!canNext() || saving}
                    className="rounded-pill"
                  >
                    {saving ? "Un instant..." : isDemoMode ? "C'est parti ! 🚀" : "Voir mon plan →"}
                  </Button>
                </div>
              </div>

              <ProgressDots current={3} total={3} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-2.5 w-2.5 rounded-full transition-all ${
            i + 1 === current ? "bg-primary scale-110" : "bg-border"
          }`}
        />
      ))}
    </div>
  );
}

function OptionCard({
  emoji,
  label,
  desc,
  selected,
  onClick,
}: {
  emoji: string;
  label: string;
  desc?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border-2 px-4 py-3.5 transition-all ${
        selected
          ? "border-primary bg-secondary"
          : "border-border hover:border-primary/40 bg-card"
      }`}
    >
      <span className="flex items-center gap-3">
        <span className="text-lg">{emoji}</span>
        <span className="flex-1">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {desc && <span className="block text-xs text-muted-foreground mt-0.5">{desc}</span>}
        </span>
      </span>
    </button>
  );
}
