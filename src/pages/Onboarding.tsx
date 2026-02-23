import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, SkipForward, Film } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

/* ────────────────────────────────────────────── constants */

const ACTIVITY_SECTIONS = [
  {
    label: "Créatrices & artisanes",
    items: [
      { key: "artisane", emoji: "🧶", label: "Artisane / Créatrice", desc: "bijoux, céramique, textile, maroquinerie" },
      { key: "mode_textile", emoji: "👗", label: "Mode & textile éthique", desc: "styliste, vêtements, accessoires" },
      { key: "art_design", emoji: "🎨", label: "Art & design", desc: "artiste visuelle, illustratrice, designer, DA" },
      { key: "deco_interieur", emoji: "🏡", label: "Déco & design d'intérieur", desc: "mobilier, upcycling, scénographie" },
      { key: "beaute_cosmetiques", emoji: "🌿", label: "Beauté & cosmétiques naturels", desc: "soins, coiffure, esthétique bio" },
    ],
  },
  {
    label: "Accompagnantes & prestataires",
    items: [
      { key: "bien_etre", emoji: "🧘", label: "Bien-être & corps", desc: "yoga, naturopathe, sophrologue" },
      { key: "coach", emoji: "🧠", label: "Coach / Thérapeute", desc: "dev perso, facilitatrice, retraites" },
      { key: "coach_sportive", emoji: "💪", label: "Coach sportive", desc: "fitness, pilates, sport bien-être" },
      { key: "consultante", emoji: "📱", label: "Consultante / Freelance", desc: "com', social media, rédaction, marketing" },
      { key: "formatrice", emoji: "📚", label: "Formatrice", desc: "ateliers, formations, pédagogie" },
    ],
  },
];

const CHANNELS = [
  { key: "instagram", emoji: "📱", label: "Instagram" },
  { key: "website", emoji: "🌐", label: "Site web" },
  { key: "newsletter", emoji: "✉️", label: "Newsletter" },
  { key: "linkedin", emoji: "💼", label: "LinkedIn" },
  { key: "pinterest", emoji: "📌", label: "Pinterest" },
  { key: "podcast", emoji: "🎙️", label: "Podcast" },
  { key: "none", emoji: "🤷", label: "Rien pour l'instant" },
];

const BLOCKERS = [
  { key: "invisible", emoji: "😶", label: "Je suis invisible malgré mes efforts" },
  { key: "lost", emoji: "😵", label: "Je sais pas par où commencer" },
  { key: "no_time", emoji: "⏰", label: "J'ai pas le temps" },
  { key: "fear", emoji: "🫣", label: "J'ai peur de me montrer / de vendre" },
  { key: "no_structure", emoji: "🌀", label: "J'ai trop d'idées, aucune structure" },
  { key: "boring", emoji: "😴", label: "Ma com' est plate, elle me ressemble pas" },
];

const OBJECTIVES = [
  { key: "system", emoji: "📅", label: "Avoir un système de com' clair et tenable" },
  { key: "visibility", emoji: "📈", label: "Être visible et attirer des client·es" },
  { key: "sell", emoji: "🛒", label: "Vendre régulièrement sans me forcer" },
  { key: "zen", emoji: "🧘", label: "Communiquer sans stress ni culpabilité" },
  { key: "expert", emoji: "🌟", label: "Être reconnue comme experte dans mon domaine" },
];

const TIME_OPTIONS = [
  { key: "15min", emoji: "😅", label: "15 min par-ci par-là" },
  { key: "30min", emoji: "⏱️", label: "30 minutes" },
  { key: "1h", emoji: "📱", label: "1 heure" },
  { key: "2h", emoji: "💪", label: "2 heures" },
  { key: "more", emoji: "🔥", label: "Plus de 2 heures" },
];

const TOTAL_STEPS = 9; // steps 1-9 (step 0 is welcome, not counted in progress)

/* ────────────────────────────────────────────── types */

interface Answers {
  prenom: string;
  activite: string;
  activity_type: string;
  activity_detail: string;
  canaux: string[];
  blocage: string;
  objectif: string;
  temps: string;
  instagram: string;
  website: string;
}

/* ────────────────────────────────────────────── animation */

const variants = {
  enter: { opacity: 0, y: 24 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -24 },
};

/* ────────────────────────────────────────────── main */

export default function Onboarding() {
  const { user } = useAuth();
  const { isDemoMode, demoData, skipDemoOnboarding } = useDemoContext();
  const navigate = useNavigate();
  const { toast } = useToast();

  const demoDefaults = demoData?.onboarding;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [answers, setAnswers] = useState<Answers>({
    prenom: isDemoMode ? (demoDefaults?.prenom ?? "") : (localStorage.getItem("lac_prenom") || ""),
    activite: isDemoMode ? (demoDefaults?.activite ?? "") : (localStorage.getItem("lac_activite") || ""),
    activity_type: isDemoMode ? "artisane" : "",
    activity_detail: "",
    canaux: isDemoMode ? ["instagram", "website", "newsletter"] : [],
    blocage: isDemoMode ? "invisible" : "",
    objectif: isDemoMode ? "visibility" : "",
    temps: isDemoMode ? "2h" : "",
    instagram: isDemoMode ? "@lea_portraits" : "",
    website: isDemoMode ? "www.leaportraits.fr" : "",
  });

  // Check if onboarding already completed (real mode only)
  useEffect(() => {
    if (isDemoMode || !user) return;
    const check = async () => {
      const { data: config } = await supabase
        .from("user_plan_config")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (config?.onboarding_completed) {
        navigate("/dashboard", { replace: true });
      }
    };
    check();
  }, [user?.id, isDemoMode, navigate]);

  const set = useCallback(<K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
  }, []);

  const next = useCallback(() => setStep(s => s + 1), []);
  const prev = useCallback(() => setStep(s => Math.max(0, s - 1)), []);

  const progress = step === 0 ? 0 : (step / TOTAL_STEPS) * 100;

  // Keyboard shortcut: Escape → back
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step > 0) prev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step, prev]);

  /* ── save ── */
  const handleFinish = async () => {
    if (isDemoMode) {
      skipDemoOnboarding();
      navigate("/dashboard", { replace: true });
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      // Update profiles
      const { data: existingProfile } = await supabase
        .from("profiles").select("id").eq("user_id", user.id).maybeSingle();

      const profileData: Record<string, unknown> = {
        prenom: answers.prenom,
        activite: answers.activite,
        type_activite: answers.activity_type,
        activity_detail: answers.activity_detail || null,
        canaux: answers.canaux,
        main_blocker: answers.blocage,
        main_goal: answers.objectif,
        weekly_time: answers.temps,
        onboarding_completed: true,
      };
      if (answers.instagram) profileData.instagram_username = answers.instagram.replace(/^@/, "");
      if (answers.website) profileData.website_url = answers.website;

      if (existingProfile) {
        await supabase.from("profiles").update(profileData).eq("user_id", user.id);
      } else {
        await supabase.from("profiles").insert({ user_id: user.id, ...profileData });
      }

      // Update user_plan_config
      const { data: existingConfig } = await supabase
        .from("user_plan_config").select("id").eq("user_id", user.id).maybeSingle();

      const configData = {
        main_goal: answers.objectif,
        level: "beginner",
        weekly_time: answers.temps,
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

      // Step 9 (building screen) will navigate after animation
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSkipDemo = () => {
    skipDemoOnboarding();
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[hsl(340,100%,97%)] flex flex-col">
      {/* Demo skip banner */}
      {isDemoMode && (
        <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2.5 bg-secondary border-b border-border">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Film className="h-4 w-4 text-primary" />
            <span>🎬 Mode démo · {demoData?.profile.first_name}, {demoData?.profile.activity_type}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleSkipDemo} className="h-8 text-xs gap-1.5 border-primary/30 hover:bg-primary/5">
            <SkipForward className="h-3.5 w-3.5" />
            Skip → Voir l'outil rempli
          </Button>
        </div>
      )}

      {/* Progress bar */}
      {step > 0 && step < 9 && (
        <div className="fixed top-0 left-0 right-0 z-40 h-1 bg-border/30">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Back button */}
      {step > 0 && step < 9 && (
        <button
          onClick={prev}
          className="fixed top-4 left-4 z-40 text-muted-foreground hover:text-foreground text-sm flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
      )}

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-lg w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {step === 0 && <WelcomeScreen onNext={next} />}
              {step === 1 && <PrenomScreen value={answers.prenom} onChange={v => set("prenom", v)} onNext={next} />}
              {step === 2 && <ActiviteScreen prenom={answers.prenom} value={answers.activite} onChange={v => set("activite", v)} onNext={next} />}
              {step === 3 && <TypeScreen value={answers.activity_type} detailValue={answers.activity_detail} onChange={v => { set("activity_type", v); if (v !== "autre") { set("activity_detail", ""); setTimeout(next, 600); } }} onDetailChange={v => set("activity_detail", v)} onNext={next} />}
              {step === 4 && <CanauxScreen value={answers.canaux} onChange={v => set("canaux", v)} onNext={next} />}
              {step === 5 && <BlocageScreen value={answers.blocage} onChange={v => { set("blocage", v); setTimeout(next, 500); }} />}
              {step === 6 && <ObjectifScreen value={answers.objectif} onChange={v => { set("objectif", v); setTimeout(next, 500); }} />}
              {step === 7 && <TempsScreen value={answers.temps} onChange={v => { set("temps", v); setTimeout(next, 500); }} />}
              {step === 8 && <InstagramScreen answers={answers} set={set} onNext={() => { next(); handleFinish(); }} onSkip={() => { next(); handleFinish(); }} />}
              {step === 9 && <BuildingScreen prenom={answers.prenom} onDone={() => navigate("/welcome")} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   SCREEN COMPONENTS
   ════════════════════════════════════════════════════════ */

function WelcomeScreen({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center space-y-8">
      <div className="space-y-5">
        <p className="text-3xl md:text-4xl font-display font-bold text-foreground leading-tight">
          Hey 👋<br />Je suis ton assistante com'.
        </p>
        <p className="text-base text-muted-foreground leading-relaxed max-w-sm mx-auto">
          Avant de commencer, j'ai besoin de te poser quelques questions pour personnaliser ton espace.
        </p>
        <p className="text-sm text-muted-foreground">
          Ça prend 2 minutes. Promis.
        </p>
        <p className="text-xs text-muted-foreground/70 italic">
          Tu peux répondre en tapant ou en vocal 🎤
        </p>
      </div>
      <Button onClick={onNext} size="lg" className="rounded-full px-8 gap-2">
        C'est parti →
      </Button>
    </div>
  );
}

/* ── Text input with voice ── */
function VoiceInput({ value, onChange, placeholder, onEnter, autoFocus = true }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onEnter?: () => void;
  autoFocus?: boolean;
}) {
  const { isListening, toggle } = useSpeechRecognition(
    (transcript) => onChange(value ? value + " " + transcript : transcript),
  );

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && onEnter) onEnter(); }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full text-xl p-4 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50"
      />
      <button
        type="button"
        onClick={toggle}
        className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all ${
          isListening
            ? "bg-destructive text-destructive-foreground animate-pulse"
            : "bg-muted text-muted-foreground hover:bg-secondary"
        }`}
      >
        🎤
      </button>
    </div>
  );
}

function PrenomScreen({ value, onChange, onNext }: { value: string; onChange: (v: string) => void; onNext: () => void }) {
  const canNext = value.trim().length > 0;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground text-center">
        C'est quoi ton prénom ?
      </h1>
      <VoiceInput value={value} onChange={onChange} placeholder="Ton prénom" onEnter={canNext ? onNext : undefined} />
      <div className="text-center space-y-2">
        <p className="text-xs text-muted-foreground/60">Appuie sur Entrée ↵</p>
        <Button onClick={onNext} disabled={!canNext} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function ActiviteScreen({ prenom, value, onChange, onNext }: { prenom: string; value: string; onChange: (v: string) => void; onNext: () => void }) {
  const canNext = value.trim().length > 0;
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Enchanté·e {prenom} !<br />Tu fais quoi dans la vie ?
        </h1>
        <p className="text-sm text-muted-foreground italic">
          en une phrase, comme tu le dirais à quelqu'un dans un café
        </p>
      </div>
      <VoiceInput value={value} onChange={onChange} placeholder="Photographe portrait pour entrepreneures" onEnter={canNext ? onNext : undefined} />
      <div className="text-center">
        <Button onClick={onNext} disabled={!canNext} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function TypeScreen({ value, detailValue, onChange, onDetailChange, onNext }: {
  value: string;
  detailValue: string;
  onChange: (v: string) => void;
  onDetailChange: (v: string) => void;
  onNext: () => void;
}) {
  const showDetail = value === "autre";
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Tu te reconnais dans quoi ?
        </h1>
        <p className="text-sm text-muted-foreground italic">choisis ce qui te correspond le mieux</p>
      </div>
      <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
        {ACTIVITY_SECTIONS.map(section => (
          <div key={section.label}>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{section.label}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {section.items.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onChange(t.key)}
                  className={`relative text-left rounded-xl border-2 px-4 py-3.5 transition-all duration-200 ${
                    value === t.key
                      ? "border-primary bg-secondary shadow-sm"
                      : "border-border bg-card hover:border-primary/40 hover:bg-secondary/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none mt-0.5">{t.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground">{t.label}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                    </div>
                  </div>
                  {value === t.key && <span className="absolute top-2.5 right-3 text-primary font-bold text-sm">✓</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
        {/* Autre */}
        <div>
          <button
            type="button"
            onClick={() => onChange("autre")}
            className={`w-full text-left rounded-xl border-2 px-4 py-3.5 transition-all duration-200 ${
              showDetail
                ? "border-primary bg-secondary shadow-sm"
                : "border-border bg-card hover:border-primary/40 hover:bg-secondary/30"
            }`}
          >
            <span className="flex items-center gap-3">
              <span className="text-2xl">✏️</span>
              <span className="text-sm font-semibold text-foreground">Autre</span>
              {showDetail && <span className="ml-auto text-primary font-bold text-sm">✓</span>}
            </span>
          </button>
          {showDetail && (
            <div className="mt-3 space-y-3">
              <input
                type="text"
                value={detailValue}
                onChange={e => onDetailChange(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && detailValue.trim()) onNext(); }}
                placeholder="Décris ton activité en quelques mots"
                autoFocus
                className="w-full text-base p-3 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50"
              />
              <div className="text-center">
                <Button onClick={onNext} disabled={!detailValue.trim()} className="rounded-full px-8">Suivant →</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CanauxScreen({ value, onChange, onNext }: { value: string[]; onChange: (v: string[]) => void; onNext: () => void }) {
  const toggle = (key: string) => {
    if (key === "none") {
      onChange(["none"]);
      return;
    }
    const without = value.filter(v => v !== "none");
    if (without.includes(key)) {
      onChange(without.filter(v => v !== key));
    } else {
      onChange([...without, key]);
    }
  };
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Tu communiques où aujourd'hui ?
        </h1>
        <p className="text-sm text-muted-foreground italic">sélectionne tout ce que tu utilises, même un petit peu</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {CHANNELS.map(c => (
          <button
            key={c.key}
            onClick={() => toggle(c.key)}
            className={`px-5 py-3 rounded-full border-2 text-sm font-medium transition-all ${
              value.includes(c.key)
                ? "border-primary bg-secondary text-primary"
                : "border-border bg-card text-foreground hover:border-primary/40"
            }`}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>
      <div className="text-center">
        <Button onClick={onNext} disabled={value.length === 0} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function BlocageScreen({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          C'est quoi ton plus gros blocage en com' aujourd'hui ?
        </h1>
        <p className="text-sm text-muted-foreground italic">ce qui te fait soupirer quand tu y penses</p>
      </div>
      <div className="space-y-3">
        {BLOCKERS.map(b => (
          <ChoiceCard key={b.key} emoji={b.emoji} label={b.label} selected={value === b.key} onClick={() => onChange(b.key)} />
        ))}
      </div>
    </div>
  );
}

function ObjectifScreen({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Et si tout marchait bien dans 6 mois, ça ressemblerait à quoi ?
        </h1>
      </div>
      <div className="space-y-3">
        {OBJECTIVES.map(o => (
          <ChoiceCard key={o.key} emoji={o.emoji} label={o.label} selected={value === o.key} onClick={() => onChange(o.key)} />
        ))}
      </div>
    </div>
  );
}

function TempsScreen({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Tu peux consacrer combien de temps à ta com' par semaine ?
        </h1>
        <p className="text-sm text-muted-foreground italic">sois honnête, on s'adapte</p>
      </div>
      <div className="space-y-3">
        {TIME_OPTIONS.map(t => (
          <ChoiceCard key={t.key} emoji={t.emoji} label={t.label} selected={value === t.key} onClick={() => onChange(t.key)} />
        ))}
      </div>
    </div>
  );
}

function InstagramScreen({ answers, set, onNext, onSkip }: {
  answers: Answers;
  set: <K extends keyof Answers>(k: K, v: Answers[K]) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Dernière chose :<br />ton @ Instagram ?
        </h1>
        <p className="text-sm text-muted-foreground italic">
          pour qu'on puisse analyser ton profil et te donner des conseils personnalisés
        </p>
      </div>
      <div className="space-y-6">
        <div>
          <input
            type="text"
            value={answers.instagram}
            onChange={e => set("instagram", e.target.value)}
            placeholder="@"
            autoFocus
            className="w-full text-xl p-4 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50"
          />
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-2">Et ton site web ? <span className="italic">(optionnel)</span></p>
          <input
            type="text"
            value={answers.website}
            onChange={e => set("website", e.target.value)}
            placeholder="https://"
            className="w-full text-xl p-4 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50"
          />
        </div>
      </div>
      <div className="flex justify-center gap-4">
        <Button variant="ghost" onClick={onSkip} className="rounded-full text-muted-foreground">
          Passer →
        </Button>
        <Button onClick={onNext} className="rounded-full px-8">
          C'est parti ! 🚀
        </Button>
      </div>
    </div>
  );
}

function BuildingScreen({ prenom, onDone }: { prenom: string; onDone: () => void }) {
  const [lines, setLines] = useState<number>(0);
  const [showButton, setShowButton] = useState(false);

  const steps = [
    "Tes canaux sont configurés",
    "Ton profil est enregistré",
    "Tes premières recommandations arrivent",
    "Ton tableau de bord se met en place…",
  ];

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    steps.forEach((_, i) => {
      timers.push(setTimeout(() => setLines(i + 1), 500 * (i + 1)));
    });
    timers.push(setTimeout(() => setShowButton(true), 500 * (steps.length + 1)));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="text-center space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Parfait {prenom} !
        </h1>
        <p className="text-base text-muted-foreground">Je prépare ton espace...</p>
      </div>
      <div className="space-y-4 text-left max-w-sm mx-auto">
        {steps.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -12 }}
            animate={i < lines ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.35 }}
            className="flex items-center gap-3"
          >
            {i < lines - 1 || (i === steps.length - 1 && lines === steps.length) ? (
              <span className="text-lg">✅</span>
            ) : i < lines ? (
              <span className="text-lg animate-spin">🔄</span>
            ) : null}
            <span className={`text-sm ${i < lines ? "text-foreground" : "text-muted-foreground/40"}`}>{s}</span>
          </motion.div>
        ))}
      </div>
      {showButton && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Button onClick={onDone} size="lg" className="rounded-full px-8 gap-2">
            Découvrir mon espace →
          </Button>
        </motion.div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────── shared */

function ChoiceCard({ emoji, label, selected, onClick, fullWidth }: {
  emoji: string;
  label: string;
  selected: boolean;
  onClick: () => void;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border-2 px-5 py-4 transition-all duration-200 ${
        fullWidth ? "col-span-2" : ""
      } ${
        selected
          ? "border-primary bg-secondary shadow-sm"
          : "border-border bg-card hover:border-primary/40 hover:bg-secondary/30"
      }`}
    >
      <span className="flex items-center gap-3">
        <span className="text-xl">{emoji}</span>
        <span className="text-sm font-medium text-foreground flex-1">{label}</span>
        {selected && <span className="text-primary font-bold">✓</span>}
      </span>
    </button>
  );
}
