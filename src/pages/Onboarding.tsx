import { useRef, useState, useCallback, useEffect } from "react";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, SkipForward, Film, Upload, X } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import DiagnosticLoading from "@/components/onboarding/DiagnosticLoading";
import DiagnosticView from "@/components/onboarding/DiagnosticView";
import {
  BLOCKERS, OBJECTIVES, TIME_OPTIONS, TOTAL_STEPS,
} from "@/lib/onboarding-constants";
import { useOnboarding } from "@/hooks/use-onboarding";
import type { Answers, BrandingAnswers, UploadedFile } from "@/hooks/use-onboarding";
import { useToast } from "@/hooks/use-toast";
import WelcomeStep from "@/components/onboarding/steps/WelcomeStep";
import ActivityStep from "@/components/onboarding/steps/ActivityStep";

/* ─── Step validation schemas ─── */
const stepValidators: Record<number, { schema: z.ZodType<any>; getData: (a: Answers, b: BrandingAnswers) => any; message: string }> = {
  1: {
    schema: z.object({ prenom: z.string().trim().min(2), activite: z.string().trim().min(2) }),
    getData: (a) => ({ prenom: a.prenom, activite: a.activite }),
    message: "Ton prénom et ton activité doivent faire au moins 2 caractères",
  },
  2: {
    schema: z.object({ activity_type: z.string().min(1) }),
    getData: (a) => ({ activity_type: a.activity_type }),
    message: "Choisis un type d'activité pour continuer",
  },
  4: {
    schema: z.object({ objectif: z.string().min(1) }),
    getData: (a) => ({ objectif: a.objectif }),
    message: "Choisis un objectif pour continuer",
  },
  5: {
    schema: z.object({ blocage: z.string().min(1) }),
    getData: (a) => ({ blocage: a.blocage }),
    message: "Choisis ton blocage principal pour continuer",
  },
  6: {
    schema: z.object({ temps: z.string().min(1) }),
    getData: (a) => ({ temps: a.temps }),
    message: "Indique le temps que tu peux y consacrer",
  },
};

/* ────────────────────────────────────────────── animation */

const variants = {
  enter: { opacity: 0, y: 24 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -24 },
};

/* ────────────────────────────────────────────── main */

export default function Onboarding() {
  const {
    step, setStep, answers, brandingAnswers,
    set, setBranding, next, prev, progress, saving,
    uploadedFiles, uploading, auditResults, diagnosticData, setDiagnosticData,
    isDemoMode, demoData,
    handleFileUpload, removeFile, handleFinish, handleSkipDemo,
    handleDiagnosticComplete, getPlaceholder, getTimeRemaining,
  } = useOnboarding();

  const { toast } = useToast();
  const [pendingAutoNext, setPendingAutoNext] = useState(false);

  const validatedNext = useCallback(() => {
    const validator = stepValidators[step];
    if (validator) {
      const data = validator.getData(answers, brandingAnswers);
      const result = validator.schema.safeParse(data);
      if (!result.success) {
        toast({ title: "Un instant ✋", description: validator.message, variant: "destructive" });
        return;
      }
    }
    next();
  }, [step, answers, brandingAnswers, next, toast]);

  // Auto-next after state has settled for steps 2, 4, 5, 6
  useEffect(() => {
    if (!pendingAutoNext) return;
    const field = step === 2 ? answers.activity_type
      : step === 4 ? answers.objectif
      : step === 5 ? answers.blocage
      : step === 6 ? answers.temps
      : null;
    if (field) {
      if (step === 2 && field === "autre") {
        setPendingAutoNext(false);
        return;
      }
      const timer = setTimeout(() => {
        validatedNext();
        setPendingAutoNext(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [pendingAutoNext, answers.activity_type, answers.objectif, answers.blocage, answers.temps, step, validatedNext]);

  const isCurrentStep = step <= TOTAL_STEPS;
  // Deduce canaux for DiagnosticLoading
  const hasInstagram = !!answers.instagram;
  const hasWebsite = !!answers.website;

  return (
    <div className="min-h-screen bg-[hsl(var(--rose-pale))] flex flex-col">
      {/* Demo skip banner */}
      {isDemoMode && (
        <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2.5 bg-secondary border-b border-border">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Film className="h-4 w-4 text-primary" />
            <span>🎬 Mode démo · {demoData?.profile.first_name}, {demoData?.profile.activity}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleSkipDemo} className="h-8 text-xs gap-1.5 border-primary/30 hover:bg-primary/5">
            <SkipForward className="h-3.5 w-3.5" />
            Skip → Voir l'outil rempli
          </Button>
        </div>
      )}

      {/* Progress bar */}
      {step <= TOTAL_STEPS - 1 && step < 10 && (
        <div className="fixed top-0 left-0 right-0 z-40 h-1 bg-border/30">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Back button */}
      {step > 0 && step < 10 && (
        <button
          onClick={prev}
          className="fixed top-4 left-4 z-40 text-muted-foreground hover:text-foreground text-sm flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
      )}

      {/* Content */}
      {step <= 10 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="max-w-lg w-full flex-1 flex items-center">
            <div className="w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                {/* Step 0: Welcome */}
                {step === 0 && <WelcomeStep onNext={next} />}

                {/* Step 1: Prénom + Activité combined */}
                {step === 1 && (
                  <PrenomActiviteScreen
                    prenom={answers.prenom}
                    activite={answers.activite}
                    onPrenomChange={v => set("prenom", v)}
                    onActiviteChange={v => set("activite", v)}
                    onNext={validatedNext}
                  />
                )}

                {/* Step 2: Activity type */}
                {step === 2 && (
                  <ActivityStep
                    value={answers.activity_type}
                    detailValue={answers.activity_detail}
                    onChange={v => { set("activity_type", v); if (v !== "autre") { set("activity_detail", ""); setPendingAutoNext(true); } }}
                    onDetailChange={v => set("activity_detail", v)}
                    onNext={validatedNext}
                  />
                )}

                {/* Step 3: Links + Documents */}
                {step === 3 && (
                  <LinksScreen
                    answers={answers}
                    set={set}
                    files={isDemoMode ? [{ id: "demo-file", name: "Brief_Lea_Portraits.pdf", url: "" }] : uploadedFiles}
                    uploading={uploading}
                    onUpload={isDemoMode ? () => {} : handleFileUpload}
                    onRemove={isDemoMode ? () => {} : removeFile}
                    onNext={next}
                    isDemoMode={isDemoMode}
                  />
                )}

                {/* Step 4: Objectif */}
                {step === 4 && <ObjectifScreen value={answers.objectif} onChange={v => { set("objectif", v); setPendingAutoNext(true); }} />}

                {/* Step 5: Blocage */}
                {step === 5 && <BlocageScreen value={answers.blocage} onChange={v => { set("blocage", v); setPendingAutoNext(true); }} />}

                {/* Step 6: Temps */}
                {step === 6 && <TempsScreen value={answers.temps} onChange={v => { set("temps", v); setPendingAutoNext(true); }} />}

                {/* Steps 7-9: Affinage (placeholder — see prompt 3.2) */}
                {(step === 7 || step === 8 || step === 9) && (
                  <AffinageScreen step={step} onNext={() => { if (step === 9) handleFinish(); next(); }} />
                )}

                {/* Step 10: Diagnostic Loading */}
                {step === 10 && (
                  <DiagnosticLoading
                    hasInstagram={hasInstagram}
                    hasWebsite={hasWebsite}
                    hasDocuments={isDemoMode ? true : uploadedFiles.length > 0}
                    isDemoMode={isDemoMode}
                    answers={answers}
                    brandingAnswers={brandingAnswers}
                    uploadedFileIds={uploadedFiles.map(f => f.id)}
                    onReady={(data) => {
                      setDiagnosticData(data);
                      setStep(11);
                    }}
                  />
                )}
              </motion.div>
            </AnimatePresence>
            </div>
          </div>

          {/* Time remaining indicator */}
          {step > 0 && step < 7 && (
            <p className="text-center text-xs text-muted-foreground/60 pb-4 mt-2">
              {getTimeRemaining(step)}
            </p>
          )}
        </div>
      ) : diagnosticData ? (
        <DiagnosticView
          data={diagnosticData}
          prenom={answers.prenom}
          onComplete={handleDiagnosticComplete}
          hasInstagram={hasInstagram}
          hasWebsite={hasWebsite}
        />
      ) : null}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   NEW SCREEN COMPONENTS
   ════════════════════════════════════════════════════════ */

function PrenomActiviteScreen({ prenom, activite, onPrenomChange, onActiviteChange, onNext }: {
  prenom: string;
  activite: string;
  onPrenomChange: (v: string) => void;
  onActiviteChange: (v: string) => void;
  onNext: () => void;
}) {
  const canNext = prenom.trim().length >= 2 && activite.trim().length >= 2;

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Dis-moi qui tu es
        </h1>
        <p className="text-sm text-muted-foreground italic">
          en deux mots, comme tu le dirais à quelqu'un dans un café
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ton prénom</label>
          <input
            type="text"
            value={prenom}
            onChange={e => onPrenomChange(e.target.value)}
            placeholder="Léa"
            autoFocus
            aria-label="Ton prénom"
            className="w-full text-xl p-4 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tu fais quoi ?</label>
          <VoiceInput
            value={activite}
            onChange={onActiviteChange}
            placeholder="Photographe portrait pour entrepreneures"
            onEnter={canNext ? onNext : undefined}
          />
        </div>
      </div>

      <div className="text-center">
        <Button onClick={onNext} disabled={!canNext} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function LinksScreen({ answers, set, files, uploading, onUpload, onRemove, onNext, isDemoMode }: {
  answers: Answers;
  set: <K extends keyof Answers>(k: K, v: Answers[K]) => void;
  files: UploadedFile[];
  uploading: boolean;
  onUpload: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  onNext: () => void;
  isDemoMode?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasAnyLink = !!(answers.instagram || answers.website || answers.linkedin);
  const hasAnything = hasAnyLink || files.length > 0;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Montre-moi ce que tu fais déjà
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Plus tu me donnes d'infos, plus mon diagnostic sera précis.
        </p>
      </div>

      <div className="space-y-4">
        {/* Instagram */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">📱 Ton @ Instagram</label>
          <input
            type="text"
            value={answers.instagram}
            onChange={e => set("instagram", e.target.value)}
            placeholder="@tonpseudo"
            aria-label="Ton @ Instagram"
            className="w-full text-base p-3 border-2 border-border rounded-xl focus:border-primary outline-none bg-card transition-colors text-foreground placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Website */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">🌐 Ton site web</label>
          <input
            type="text"
            value={answers.website}
            onChange={e => set("website", e.target.value)}
            placeholder="https://tonsite.fr"
            aria-label="URL de ton site web"
            className="w-full text-base p-3 border-2 border-border rounded-xl focus:border-primary outline-none bg-card transition-colors text-foreground placeholder:text-muted-foreground/50"
          />
        </div>

        {/* LinkedIn */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">💼 Ton LinkedIn</label>
          <input
            type="text"
            value={answers.linkedin}
            onChange={e => set("linkedin", e.target.value)}
            placeholder="https://linkedin.com/in/..."
            aria-label="URL de ton profil LinkedIn"
            className="w-full text-base p-3 border-2 border-border rounded-xl focus:border-primary outline-none bg-card transition-colors text-foreground placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Document upload */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">📄 Tes documents</label>
          <p className="text-xs text-muted-foreground/70 mb-2 italic">Un brief, un PDF, un moodboard... tout ce qui m'aide à te connaître.</p>

          {!isDemoMode && (
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); onUpload(e.dataTransfer.files); }}
              className="border-2 border-dashed border-border rounded-xl p-5 text-center cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition-colors"
            >
              <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-xs font-medium text-foreground">📎 Glisse tes fichiers ici</p>
              <p className="text-xs text-muted-foreground/70 mt-1">PDF, Word, PNG, JPG · Max 5 fichiers</p>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.webp"
                onChange={e => onUpload(e.target.files)}
                className="hidden"
              />
            </div>
          )}

          {uploading && (
            <p className="text-sm text-muted-foreground text-center animate-pulse mt-2">Upload en cours...</p>
          )}

          {files.length > 0 && (
            <div className="space-y-2 mt-2">
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-3 bg-card rounded-xl border border-border px-4 py-2.5">
                  <span className="text-sm">📄</span>
                  <span className="text-sm text-foreground flex-1 truncate">{f.name}</span>
                  <button onClick={() => onRemove(f.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button onClick={onNext} className="rounded-full px-8">
          {hasAnything ? "Suivant →" : "Passer →"}
        </Button>
        {!hasAnything && (
          <p className="text-xs text-muted-foreground/60 italic">Sans liens, mon diagnostic sera moins précis</p>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   EXISTING SCREEN COMPONENTS (kept as-is)
   ════════════════════════════════════════════════════════ */

function VoiceInput({ value, onChange, placeholder, onEnter, autoFocus = true, multiline = false, showVoiceTip = false }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onEnter?: () => void;
  autoFocus?: boolean;
  multiline?: boolean;
  showVoiceTip?: boolean;
}) {
  const { isListening, toggle } = useSpeechRecognition(
    (transcript) => onChange(value ? value + " " + transcript : transcript),
  );

  if (multiline) {
    return (
      <div className="relative w-full space-y-3">
        {showVoiceTip && !value.trim() && (
          <div className="flex items-start gap-2.5 bg-secondary/80 border border-primary/15 rounded-xl px-4 py-3 animate-fade-in">
            <span className="text-lg shrink-0 mt-0.5">🎤</span>
            <p className="text-xs text-foreground/80 leading-relaxed">
              <span className="font-semibold text-foreground">Astuce :</span> tu vois le petit micro en bas à droite ? Clique dessus et parle.
            </p>
          </div>
        )}
        <div className="relative">
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            autoFocus={autoFocus}
            rows={4}
            className="w-full text-base p-4 pr-12 border-2 border-border rounded-xl focus:border-primary outline-none bg-card transition-colors text-foreground placeholder:text-muted-foreground/50 resize-none"
          />
          <button
            type="button"
            onClick={toggle}
            className={`absolute right-3 bottom-3 p-2 rounded-full transition-all ${
              isListening
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "bg-muted text-muted-foreground hover:bg-secondary"
            }`}
          >
            🎤
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && onEnter) onEnter(); }}
        placeholder={placeholder}
        aria-label={placeholder}
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

function BlocageScreen({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">C'est quoi ton plus gros blocage en com' aujourd'hui ?</h1>
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
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Et si tout marchait bien dans 6 mois, ça ressemblerait à quoi ?</h1>
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
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Tu peux consacrer combien de temps à ta com' par semaine ?</h1>
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

/* ════════════════════════════════════════════════════════
   AFFINAGE PLACEHOLDER (will be implemented in prompt 3.2)
   ════════════════════════════════════════════════════════ */

function AffinageScreen({ step, onNext }: { step: number; onNext: () => void }) {
  const questions = [
    { title: "Si tu devais changer UNE chose dans ta com' demain, ce serait quoi ?", subtitle: "La première chose qui te vient, sans réfléchir." },
    { title: "Tu vends plutôt un produit ou un service ?", subtitle: "Ça m'aide à adapter mes conseils." },
    { title: "Qu'est-ce qui te rend unique par rapport aux autres dans ton domaine ?", subtitle: "Le truc que tes clientes disent de toi, pas toi." },
  ];
  const q = questions[step - 7];

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">{q.title}</h1>
        <p className="text-sm text-muted-foreground italic">{q.subtitle}</p>
      </div>
      <div className="text-center">
        <Button onClick={onNext} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────── shared */

function ChoiceCard({ emoji, label, selected, onClick }: {
  emoji: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left rounded-xl border-2 px-5 py-4 transition-all duration-200 ${
        selected ? "border-primary bg-secondary shadow-sm" : "border-border bg-card hover:border-primary/40 hover:bg-secondary/30"
      }`}>
      <span className="flex items-center gap-3">
        <span className="text-xl">{emoji}</span>
        <span className="text-sm font-medium text-foreground flex-1">{label}</span>
        {selected && <span className="text-primary font-bold">✓</span>}
      </span>
    </button>
  );
}
