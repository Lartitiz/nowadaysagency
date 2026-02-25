import { useRef, useState, useCallback } from "react";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, SkipForward, Film, Upload, X, Plus, Trash2 } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { getActivityExamples } from "@/lib/activity-examples";
import DiagnosticLoading from "@/components/onboarding/DiagnosticLoading";
import DiagnosticView from "@/components/onboarding/DiagnosticView";
import {
  ACTIVITY_SECTIONS, CHANNELS, BLOCKERS, OBJECTIVES,
  TIME_OPTIONS, TONE_OPTIONS, VALUE_CHIPS, TOTAL_STEPS,
} from "@/lib/onboarding-constants";
import { useOnboarding } from "@/hooks/use-onboarding";
import type { Answers, BrandingAnswers, UploadedFile } from "@/hooks/use-onboarding";
import { useToast } from "@/hooks/use-toast";

/* ─── Step validation schemas ─── */
const stepValidators: Record<number, { schema: z.ZodType<any>; getData: (a: Answers, b: BrandingAnswers) => any; message: string }> = {
  2: {
    schema: z.object({ prenom: z.string().trim().min(2) }),
    getData: (a) => ({ prenom: a.prenom }),
    message: "Ton prénom doit faire au moins 2 caractères",
  },
  3: {
    schema: z.object({ activite: z.string().trim().min(2) }),
    getData: (a) => ({ activite: a.activite }),
    message: "Décris ton activité en au moins 2 caractères",
  },
  4: {
    schema: z.object({ activity_type: z.string().min(1) }),
    getData: (a) => ({ activity_type: a.activity_type }),
    message: "Choisis un type d'activité pour continuer",
  },
  5: {
    schema: z.object({ canaux: z.array(z.string()).min(1) }),
    getData: (a) => ({ canaux: a.canaux }),
    message: "Choisis au moins un canal pour continuer",
  },
  6: {
    schema: z.object({ blocage: z.string().min(1) }),
    getData: (a) => ({ blocage: a.blocage }),
    message: "Choisis ton blocage principal pour continuer",
  },
  7: {
    schema: z.object({ objectif: z.string().min(1) }),
    getData: (a) => ({ objectif: a.objectif }),
    message: "Choisis un objectif pour continuer",
  },
  8: {
    schema: z.object({ temps: z.string().min(1) }),
    getData: (a) => ({ temps: a.temps }),
    message: "Indique le temps que tu peux y consacrer",
  },
  11: {
    schema: z.object({ positioning: z.string().trim().min(2) }),
    getData: (_, b) => ({ positioning: b.positioning }),
    message: "Décris ton positionnement en quelques mots",
  },
  12: {
    schema: z.object({ mission: z.string().trim().min(2) }),
    getData: (_, b) => ({ mission: b.mission }),
    message: "Décris ta mission en quelques mots",
  },
  13: {
    schema: z.object({ target_description: z.string().trim().min(2) }),
    getData: (_, b) => ({ target_description: b.target_description }),
    message: "Décris ta cliente idéale en quelques mots",
  },
  14: {
    schema: z.object({ tone_keywords: z.array(z.string()).min(2) }),
    getData: (_, b) => ({ tone_keywords: b.tone_keywords }),
    message: "Choisis au moins 2 mots pour décrire ton ton",
  },
  15: {
    schema: z.object({ offers: z.array(z.object({ name: z.string().trim().min(1) })).min(1).refine(arr => arr.some(o => o.name.length > 0)) }),
    getData: (_, b) => ({ offers: b.offers }),
    message: "Nomme au moins une offre pour continuer",
  },
  16: {
    schema: z.object({ values: z.array(z.string()).refine(arr => arr.filter(v => v.trim()).length >= 2) }),
    getData: (_, b) => ({ values: b.values }),
    message: "Indique au moins 2 valeurs pour continuer",
  },
};
import WelcomeStep from "@/components/onboarding/steps/WelcomeStep";
import PromiseStep from "@/components/onboarding/steps/PromiseStep";
import BrandingTransitionStep from "@/components/onboarding/steps/BrandingTransitionStep";
import ActivityStep from "@/components/onboarding/steps/ActivityStep";
import ChannelsStep from "@/components/onboarding/steps/ChannelsStep";

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

  const isCurrentStep = step < TOTAL_STEPS;

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

      {/* Progress bar — visible from step 0 */}
      {step <= 17 && (
        <div className="fixed top-0 left-0 right-0 z-40 h-1 bg-border/30">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Back button */}
      {step > 0 && step <= 17 && (
        <button
          onClick={prev}
          className="fixed top-4 left-4 z-40 text-muted-foreground hover:text-foreground text-sm flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
      )}

      {/* Content */}
      {step <= 18 ? (
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
                {/* PHASE 1: ACCUEIL */}
                {step === 0 && <WelcomeStep onNext={next} />}
                {step === 1 && <PromiseStep onNext={next} />}

                {/* PHASE 2: QUI ES-TU */}
                {step === 2 && <PrenomScreen value={answers.prenom} onChange={v => set("prenom", v)} onNext={validatedNext} />}
                {step === 3 && <ActiviteScreen prenom={answers.prenom} value={answers.activite} onChange={v => set("activite", v)} onNext={validatedNext} />}
                {step === 4 && <ActivityStep value={answers.activity_type} detailValue={answers.activity_detail} onChange={v => { set("activity_type", v); if (v !== "autre") { set("activity_detail", ""); setTimeout(validatedNext, 600); } }} onDetailChange={v => set("activity_detail", v)} onNext={validatedNext} />}
                {step === 5 && <ChannelsStep value={answers.canaux} onChange={v => set("canaux", v)} onNext={validatedNext} />}
                {step === 6 && <BlocageScreen value={answers.blocage} onChange={v => { set("blocage", v); setTimeout(validatedNext, 500); }} />}
                {step === 7 && <ObjectifScreen value={answers.objectif} onChange={v => { set("objectif", v); setTimeout(validatedNext, 500); }} />}
                {step === 8 && <TempsScreen value={answers.temps} onChange={v => { set("temps", v); setTimeout(validatedNext, 500); }} />}
                {step === 9 && <InstagramScreen answers={answers} set={set} onNext={next} onSkip={next} />}

                {/* PHASE 3: BRANDING CONVERSATIONNEL */}
                {step === 10 && <BrandingTransitionStep onNext={next} />}
                {step === 11 && (
                  <PositioningScreen
                    value={brandingAnswers.positioning}
                    onChange={v => setBranding("positioning", v)}
                    placeholder={getPlaceholder("positioning")}
                    hasAiSuggestion={!!auditResults.documents?.positioning && !brandingAnswers.positioning}
                    onNext={validatedNext}
                  />
                )}
                {step === 12 && (
                  <MissionScreen
                    value={brandingAnswers.mission}
                    onChange={v => setBranding("mission", v)}
                    placeholder={getPlaceholder("mission")}
                    onNext={validatedNext}
                  />
                )}
                {step === 13 && (
                  <TargetScreen
                    value={brandingAnswers.target_description}
                    onChange={v => setBranding("target_description", v)}
                    placeholder={getPlaceholder("target")}
                    onNext={validatedNext}
                  />
                )}
                {step === 14 && (
                  <ToneScreen
                    value={brandingAnswers.tone_keywords}
                    onChange={v => setBranding("tone_keywords", v)}
                    onNext={validatedNext}
                  />
                )}
                {step === 15 && (
                  <OffersScreen
                    value={brandingAnswers.offers}
                    onChange={v => setBranding("offers", v)}
                    onNext={validatedNext}
                  />
                )}
                {step === 16 && (
                  <ValuesScreen
                    value={brandingAnswers.values}
                    onChange={v => setBranding("values", v)}
                    onNext={() => { validatedNext(); handleFinish(); }}
                  />
                )}

                {/* PHASE 4: IMPORT (après branding) */}
                {step === 17 && (
                  <ImportScreen
                    files={isDemoMode ? [{ id: "demo-file", name: "Brief_Lea_Portraits.pdf", url: "" }] : uploadedFiles}
                    uploading={uploading}
                    onUpload={isDemoMode ? () => {} : handleFileUpload}
                    onRemove={isDemoMode ? () => {} : removeFile}
                    onNext={next}
                    onSkip={next}
                    isDemoMode={isDemoMode}
                  />
                )}

                {/* PHASE 5: DIAGNOSTIC */}
                {step === 18 && (
                  <DiagnosticLoading
                    hasInstagram={answers.canaux.includes("instagram") && !!answers.instagram}
                    hasWebsite={answers.canaux.includes("website") && !!answers.website}
                    hasDocuments={isDemoMode ? true : uploadedFiles.length > 0}
                    isDemoMode={isDemoMode}
                    answers={answers}
                    brandingAnswers={brandingAnswers}
                    onReady={(data) => {
                      setDiagnosticData(data);
                      setStep(19);
                    }}
                  />
                )}
              </motion.div>
            </AnimatePresence>
            </div>
          </div>

          {/* Time remaining indicator */}
          {step > 0 && step <= 17 && (
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
          hasInstagram={answers.canaux.includes("instagram") && !!answers.instagram}
          hasWebsite={answers.canaux.includes("website") && !!answers.website}
        />
      ) : null}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   SCREEN COMPONENTS - PHASE 1
   ════════════════════════════════════════════════════════ */

/* WelcomeScreen extracted to steps/WelcomeStep.tsx */
function VoiceInput({ value, onChange, placeholder, onEnter, autoFocus = true, multiline = false }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onEnter?: () => void;
  autoFocus?: boolean;
  multiline?: boolean;
}) {
  const { isListening, toggle } = useSpeechRecognition(
    (transcript) => onChange(value ? value + " " + transcript : transcript),
  );

  if (multiline) {
    return (
      <div className="relative w-full">
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
        <p className="text-sm text-muted-foreground italic">en une phrase, comme tu le dirais à quelqu'un dans un café</p>
      </div>
      <VoiceInput value={value} onChange={onChange} placeholder="Photographe portrait pour entrepreneures" onEnter={canNext ? onNext : undefined} />
      <div className="text-center">
        <Button onClick={onNext} disabled={!canNext} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

/* TypeScreen extracted to steps/ActivityStep.tsx */
/* CanauxScreen extracted to steps/ChannelsStep.tsx */

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

function InstagramScreen({ answers, set, onNext, onSkip }: {
  answers: Answers;
  set: <K extends keyof Answers>(k: K, v: Answers[K]) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Ton @ Instagram ?</h1>
        <p className="text-sm text-muted-foreground italic">pour analyser ton profil et te donner des conseils personnalisés</p>
      </div>
      <div className="space-y-6">
        <input type="text" value={answers.instagram} onChange={e => set("instagram", e.target.value)}
          placeholder="@" autoFocus aria-label="Ton @ Instagram"
          className="w-full text-xl p-4 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50" />
        <div>
          <p className="text-sm text-muted-foreground mb-2">Et ton site web ? <span className="italic">(optionnel)</span></p>
          <input type="text" value={answers.website} onChange={e => set("website", e.target.value)}
            placeholder="https://" aria-label="URL de ton site web"
            className="w-full text-xl p-4 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50" />
        </div>
      </div>
      <div className="flex justify-center gap-4">
        <Button variant="ghost" onClick={onSkip} className="rounded-full text-muted-foreground">Passer →</Button>
        <Button onClick={onNext} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   SCREEN COMPONENTS - PHASE 2: IMPORT
   ════════════════════════════════════════════════════════ */

function ImportScreen({ files, uploading, onUpload, onRemove, onNext, onSkip, isDemoMode }: {
  files: UploadedFile[];
  uploading: boolean;
  onUpload: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  onNext: () => void;
  onSkip: () => void;
  isDemoMode?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-8">
      <div className="text-center space-y-3">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Tu as des documents qui décrivent ta marque ?
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Un brief, un PDF, un moodboard... tout ce qui m'aide à mieux te connaître.
        </p>
        <p className="text-xs text-muted-foreground/70 italic">
          (c'est optionnel, mais ça me permet de pré-remplir ton espace)
        </p>
      </div>

      {!isDemoMode && (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); onUpload(e.dataTransfer.files); }}
          className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition-colors"
        >
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">📎 Glisse tes fichiers ici</p>
          <p className="text-xs text-muted-foreground mt-1">ou clique pour importer</p>
          <p className="text-xs text-muted-foreground/70 mt-2">PDF, Word, PNG, JPG · Max 5 fichiers</p>
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
        <p className="text-sm text-muted-foreground text-center animate-pulse">Upload en cours...</p>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fichiers importés :</p>
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

      <div className="flex justify-center gap-4">
        <Button variant="ghost" onClick={onSkip} className="rounded-full text-muted-foreground">Passer →</Button>
        {files.length > 0 && (
          <Button onClick={onNext} className="rounded-full px-8">Suivant →</Button>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   SCREEN COMPONENTS - PHASE 3: BRANDING
   ════════════════════════════════════════════════════════ */

function PositioningScreen({ value, onChange, placeholder, hasAiSuggestion, onNext }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hasAiSuggestion: boolean;
  onNext: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Comment tu présenterais ce que tu fais à quelqu'un dans un café ?
        </h1>
        <p className="text-sm text-muted-foreground italic">en 2-3 phrases, comme tu le dirais à l'oral</p>
      </div>
      {hasAiSuggestion && value && (
        <p className="text-xs text-primary flex items-center gap-1.5 justify-center">
          ✨ Suggestion basée sur tes documents
        </p>
      )}
      <VoiceInput value={value} onChange={onChange} placeholder={placeholder} multiline />
      <div className="text-center">
        <Button onClick={onNext} disabled={!value.trim()} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function MissionScreen({ value, onChange, placeholder, onNext }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onNext: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          C'est quoi ta mission profonde ?
        </h1>
        <p className="text-sm text-muted-foreground italic">Le truc qui te fait te lever le matin, au-delà de gagner ta vie.</p>
      </div>
      <VoiceInput value={value} onChange={onChange} placeholder={placeholder} multiline />
      <div className="text-center">
        <Button onClick={onNext} disabled={!value.trim()} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function TargetScreen({ value, onChange, placeholder, onNext }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onNext: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Décris ta cliente idéale en quelques mots.
        </h1>
        <p className="text-sm text-muted-foreground italic">Qui est-elle ? Qu'est-ce qui la bloque ? Qu'est-ce qu'elle veut ?</p>
      </div>
      <VoiceInput value={value} onChange={onChange} placeholder={placeholder} multiline />
      <div className="text-center">
        <Button onClick={onNext} disabled={!value.trim()} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function ToneScreen({ value, onChange, onNext }: {
  value: string[];
  onChange: (v: string[]) => void;
  onNext: () => void;
}) {
  const toggle = (key: string) => {
    if (value.includes(key)) {
      onChange(value.filter(v => v !== key));
    } else if (value.length < 3) {
      onChange([...value, key]);
    }
  };
  const atMax = value.length >= 3;

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Si ta marque était une personne, elle parlerait comment ?
        </h1>
        <p className="text-sm text-muted-foreground italic">choisis 2-3 mots</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {TONE_OPTIONS.map(t => {
          const selected = value.includes(t.key);
          const disabled = atMax && !selected;
          return (
            <button key={t.key} onClick={() => toggle(t.key)} disabled={disabled}
              className={`px-4 py-3.5 rounded-xl border-2 text-sm font-medium transition-all ${
                selected
                  ? "border-primary bg-secondary text-primary"
                  : disabled
                    ? "border-border bg-muted/50 text-muted-foreground/50 cursor-not-allowed"
                    : "border-border bg-card text-foreground hover:border-primary/40"
              }`}>
              {t.emoji} {t.label}
            </button>
          );
        })}
      </div>
      <div className="text-center">
        <Button onClick={onNext} disabled={value.length < 2} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function OffersScreen({ value, onChange, onNext }: {
  value: { name: string; price: string; description: string }[];
  onChange: (v: { name: string; price: string; description: string }[]) => void;
  onNext: () => void;
}) {
  const updateOffer = (idx: number, field: string, val: string) => {
    const updated = [...value];
    updated[idx] = { ...updated[idx], [field]: val };
    onChange(updated);
  };
  const addOffer = () => {
    if (value.length < 3) onChange([...value, { name: "", price: "", description: "" }]);
  };
  const removeOffer = (idx: number) => {
    if (value.length > 1) onChange(value.filter((_, i) => i !== idx));
  };

  const canNext = value.some(o => o.name.trim());

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          C'est quoi ton offre principale ?
        </h1>
        <p className="text-sm text-muted-foreground italic">celle qui te fait vivre ou que tu veux pousser en priorité</p>
      </div>

      <div className="space-y-6">
        {value.map((offer, idx) => (
          <div key={idx} className="space-y-3 bg-card rounded-xl border border-border p-4">
            {value.length > 1 && (
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-muted-foreground">Offre {idx + 1}</span>
                <button onClick={() => removeOffer(idx)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nom de l'offre</label>
              <Input value={offer.name} onChange={e => updateOffer(idx, "name", e.target.value)} placeholder="Ex: Séance Confiance" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Prix</label>
              <Input value={offer.price} onChange={e => updateOffer(idx, "price", e.target.value)} placeholder="Ex: 350€" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">En une phrase, elle sert à quoi ?</label>
              <VoiceInput value={offer.description} onChange={v => updateOffer(idx, "description", v)} placeholder="Ex: Séance portrait 2h avec coaching posture inclus" autoFocus={false} />
            </div>
          </div>
        ))}
      </div>

      {value.length < 3 && (
        <button onClick={addOffer} className="text-sm text-primary font-medium flex items-center gap-1.5 mx-auto hover:underline">
          <Plus className="h-4 w-4" /> Ajouter une autre offre
        </button>
      )}

      <div className="text-center">
        <Button onClick={onNext} disabled={!canNext} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

function ValuesScreen({ value, onChange, onNext }: {
  value: string[];
  onChange: (v: string[]) => void;
  onNext: () => void;
}) {
  const updateValue = (idx: number, val: string) => {
    const updated = [...value];
    if (idx < updated.length) {
      updated[idx] = val;
    } else {
      updated.push(val);
    }
    onChange(updated);
  };

  const addChip = (chip: string) => {
    if (value.includes(chip)) return;
    if (value.length < 3) {
      onChange([...value, chip]);
    } else {
      // Replace last empty one
      const emptyIdx = value.findIndex(v => !v.trim());
      if (emptyIdx >= 0) {
        const updated = [...value];
        updated[emptyIdx] = chip;
        onChange(updated);
      }
    }
  };

  // Ensure 3 slots
  const slots = [value[0] || "", value[1] || "", value[2] || ""];
  const canNext = slots.filter(s => s.trim()).length >= 2;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          3 valeurs qui portent ton projet ?
        </h1>
      </div>

      <div className="space-y-3">
        {slots.map((val, idx) => (
          <Input
            key={idx}
            value={val}
            onChange={e => updateValue(idx, e.target.value)}
            placeholder={`${idx + 1}.`}
            aria-label={`Valeur ${idx + 1}`}
          />
        ))}
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2">Ou choisis parmi :</p>
        <div className="flex flex-wrap gap-2">
          {VALUE_CHIPS.map(chip => {
            const isSelected = value.includes(chip);
            return (
              <button key={chip} onClick={() => addChip(chip)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  isSelected
                    ? "border-primary bg-secondary text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/40"
                }`}>
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-center">
        <Button onClick={onNext} disabled={!canNext} className="rounded-full px-8">Terminer →</Button>
      </div>
    </div>
  );
}

/* BuildingScreen removed — replaced by DiagnosticLoading + DiagnosticView */

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
