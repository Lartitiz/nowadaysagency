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
  BLOCKERS, OBJECTIVES, TIME_OPTIONS, CHANNELS, DESIRED_CHANNELS, TOTAL_STEPS,
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
    schema: z.object({ activity_type: z.string().min(1), product_or_service: z.string().min(1) }),
    getData: (a) => ({ activity_type: a.activity_type, product_or_service: a.product_or_service }),
    message: "Choisis un type d'activité et ce que tu vends pour continuer",
  },
  5: {
    schema: z.object({ objectif: z.string().min(1) }),
    getData: (a) => ({ objectif: a.objectif }),
    message: "Choisis un objectif pour continuer",
  },
  6: {
    schema: z.object({ blocage: z.string().min(1) }),
    getData: (a) => ({ blocage: a.blocage }),
    message: "Choisis ton blocage principal pour continuer",
  },
  7: {
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
  const [hasSeenVoiceTip, setHasSeenVoiceTip] = useState(false);

  useEffect(() => {
    if (step > 7 && !hasSeenVoiceTip) setHasSeenVoiceTip(true);
  }, [step, hasSeenVoiceTip]);

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

   // Auto-next after state has settled for steps 5, 6, 7
  useEffect(() => {
    if (!pendingAutoNext) return;
    const field = step === 5 ? answers.objectif
      : step === 6 ? answers.blocage
      : step === 7 ? answers.temps
      : null;
    if (field) {
      const timer = setTimeout(() => {
        validatedNext();
        setPendingAutoNext(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [pendingAutoNext, answers.objectif, answers.blocage, answers.temps, step, validatedNext]);

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
                {step >= 8 && step <= 9 && !hasSeenVoiceTip && (
                  <p className="text-xs text-muted-foreground text-center mb-2 animate-in fade-in">
                    💡 Tu vois l'icône 🎤 ? Clique dessus pour dicter ta réponse.
                  </p>
                )}

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

                {/* Step 2: Activity type + product/service */}
                {step === 2 && (
                  <ActivityStep
                    value={answers.activity_type}
                    detailValue={answers.activity_detail}
                    onChange={v => { set("activity_type", v); if (v !== "autre") { set("activity_detail", ""); } }}
                    onDetailChange={v => set("activity_detail", v)}
                    productOrService={answers.product_or_service}
                    onProductChange={v => set("product_or_service", v)}
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

                {/* Step 4: Canaux combined */}
                {step === 4 && (
                  <CanauxCombinedScreen
                    answers={answers}
                    set={set}
                    onNext={next}
                  />
                )}

                {/* Step 5: Objectif */}
                {step === 5 && <ObjectifScreen value={answers.objectif} onChange={v => { set("objectif", v); setPendingAutoNext(true); }} />}

                {/* Step 6: Blocage */}
                {step === 6 && <BlocageScreen value={answers.blocage} onChange={v => { set("blocage", v); setPendingAutoNext(true); }} />}

                {/* Step 7: Temps */}
                {step === 7 && <TempsScreen value={answers.temps} onChange={v => { set("temps", v); setPendingAutoNext(true); }} />}

                {/* Step 8: Change priority */}
                {step === 8 && (
                  <ChangeScreen
                    value={answers.change_priority}
                    onChange={v => set("change_priority", v)}
                    onNext={validatedNext}
                  />
                )}

                {/* Step 9: Uniqueness */}
                {step === 9 && (
                  <UniquenessScreen
                    value={answers.uniqueness}
                    onChange={v => set("uniqueness", v)}
                    onNext={async () => { await handleFinish(); next(); }}
                  />
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

function normalizeInstagramHandle(input: string): string {
  let v = input.trim();
  // Strip full URLs
  v = v.replace(/^https?:\/\/(www\.)?instagram\.com\//, "");
  // Strip leading @
  v = v.replace(/^@/, "");
  // Remove trailing slash
  v = v.replace(/\/$/, "");
  // Take only first path segment
  v = v.split("/")[0].split("?")[0];
  return v;
}

function isValidUrl(input: string): boolean {
  return /^https?:\/\/.+\..+/.test(input.trim());
}

function addHttpsIfNeeded(input: string): string {
  const v = input.trim();
  if (!v) return v;
  if (/^https?:\/\//.test(v)) return v;
  if (v.includes(".")) return "https://" + v;
  return v;
}

function InputIndicator({ status }: { status: "valid" | "warn" | "none" }) {
  if (status === "none") return null;
  return (
    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">
      {status === "valid" ? "✅" : "⚠️"}
    </span>
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

  const igStatus: "valid" | "warn" | "none" = !answers.instagram ? "none"
    : /^[a-zA-Z0-9_.]+$/.test(answers.instagram) ? "valid" : "warn";

  const webStatus: "valid" | "warn" | "none" = !answers.website ? "none"
    : isValidUrl(answers.website) ? "valid" : "warn";

  const liStatus: "valid" | "warn" | "none" = !answers.linkedin ? "none"
    : answers.linkedin.includes("linkedin.com") ? "valid" : "warn";

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
          <div className="relative">
            <input
              type="text"
              value={answers.instagram}
              onChange={e => set("instagram", normalizeInstagramHandle(e.target.value))}
              placeholder="@tonpseudo"
              aria-label="Ton @ Instagram"
              className="w-full text-base p-3 pr-10 border-2 border-border rounded-xl focus:border-primary outline-none bg-card transition-colors text-foreground placeholder:text-muted-foreground/50"
            />
            <InputIndicator status={igStatus} />
          </div>
        </div>

        {/* Website */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">🌐 Ton site web</label>
          <div className="relative">
            <input
              type="text"
              value={answers.website}
              onChange={e => set("website", e.target.value)}
              onBlur={() => { if (answers.website) set("website", addHttpsIfNeeded(answers.website)); }}
              placeholder="https://tonsite.fr"
              aria-label="URL de ton site web"
              className="w-full text-base p-3 pr-10 border-2 border-border rounded-xl focus:border-primary outline-none bg-card transition-colors text-foreground placeholder:text-muted-foreground/50"
            />
            <InputIndicator status={webStatus} />
          </div>
        </div>

        {/* LinkedIn */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">💼 URL de ton profil LinkedIn (optionnel)</label>
          <div className="relative">
            <input
              type="text"
              value={answers.linkedin}
              onChange={e => set("linkedin", e.target.value)}
              onBlur={() => { if (answers.linkedin) set("linkedin", addHttpsIfNeeded(answers.linkedin)); }}
              placeholder="https://linkedin.com/in/..."
              aria-label="URL de ton profil LinkedIn"
              className="w-full text-sm p-2.5 pr-10 border-2 border-border rounded-xl focus:border-primary outline-none bg-card transition-colors text-foreground placeholder:text-muted-foreground/50"
            />
            <InputIndicator status={liStatus} />
          </div>
        </div>

        {/* LinkedIn Summary */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">💼 Ton résumé LinkedIn</label>
          <p className="text-xs text-muted-foreground/70 mb-2 italic">Copie-colle le texte de la section "Infos" de ton profil LinkedIn. Le scraping automatique ne fonctionne pas avec LinkedIn, alors c'est plus fiable comme ça.</p>
          <textarea
            value={answers.linkedin_summary}
            onChange={e => set("linkedin_summary", e.target.value)}
            placeholder="Ex : J'accompagne les entrepreneures à développer leur marque personnelle…"
            aria-label="Résumé LinkedIn"
            rows={4}
            className="w-full text-base p-3 border-2 border-border rounded-xl focus:border-primary outline-none bg-card transition-colors text-foreground placeholder:text-muted-foreground/50 resize-none"
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
   CANAUX COMBINED SCREEN (Step 4)
   ════════════════════════════════════════════════════════ */

function CanauxCombinedScreen({ answers, set, onNext }: {
  answers: Answers;
  set: <K extends keyof Answers>(k: K, v: Answers[K]) => void;
  onNext: () => void;
}) {
  // Pre-select channels based on links
  useEffect(() => {
    const preSelected = [
      ...(answers.instagram ? ["instagram"] : []),
      ...(answers.website ? ["website"] : []),
      ...(answers.linkedin ? ["linkedin"] : []),
    ];
    if (preSelected.length > 0 && answers.canaux.length === 0) {
      set("canaux", preSelected);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCanal = (key: string) => {
    if (key === "none") {
      set("canaux", answers.canaux.includes("none") ? [] : ["none"]);
      return;
    }
    const without = answers.canaux.filter(s => s !== "none");
    set("canaux", without.includes(key) ? without.filter(s => s !== key) : [...without, key]);
  };

  const toggleDesired = (key: string) => {
    const curr = answers.desired_channels;
    set("desired_channels", curr.includes(key) ? curr.filter(s => s !== key) : [...curr, key]);
  };

  const filteredDesired = DESIRED_CHANNELS.filter(c => !answers.canaux.includes(c.key));

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Tes canaux de communication
        </h1>
        <p className="text-sm text-muted-foreground italic">
          dis-moi où tu en es et où tu veux aller
        </p>
      </div>

      {/* Section 1: Current channels */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Tu communiques déjà sur...</h2>
        <div className="space-y-2">
          {CHANNELS.map(o => (
            <ChoiceCard key={o.key} emoji={o.emoji} label={o.label} selected={answers.canaux.includes(o.key)} onClick={() => toggleCanal(o.key)} />
          ))}
        </div>
      </div>

      {/* Divider */}
      {filteredDesired.length > 0 && (
        <>
          <div className="border-t border-border/50" />

          {/* Section 2: Desired channels */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Et tu aimerais te lancer sur...</h2>
            <p className="text-xs text-muted-foreground italic mb-1">même si c'est juste une envie</p>
            <div className="space-y-2">
              {filteredDesired.map(o => (
                <ChoiceCard key={o.key} emoji={o.emoji} label={o.label} selected={answers.desired_channels.includes(o.key)} onClick={() => toggleDesired(o.key)} />
              ))}
            </div>
          </div>
        </>
      )}

      <div className="text-center">
        <Button onClick={onNext} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MULTI-SELECT SCREEN (kept for reuse)
   ════════════════════════════════════════════════════════ */

function MultiSelectScreen({ title, subtitle, options, selected, onChange, onNext, preSelected }: {
  title: string;
  subtitle: string;
  options: { key: string; emoji: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  onNext: () => void;
  preSelected?: string[];
}) {
  // Pre-select channels on first render based on links
  useEffect(() => {
    if (preSelected && preSelected.length > 0 && selected.length === 0) {
      const toAdd = preSelected.filter(p => !selected.includes(p));
      if (toAdd.length > 0) onChange([...selected, ...toAdd]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: string) => {
    if (key === "none") {
      onChange(selected.includes("none") ? [] : ["none"]);
      return;
    }
    const without = selected.filter(s => s !== "none");
    onChange(without.includes(key) ? without.filter(s => s !== key) : [...without, key]);
  };

  const hasSelection = selected.length > 0 && !selected.includes("none");

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground italic">{subtitle}</p>
      </div>
      <div className="space-y-3">
        {options.map(o => (
          <ChoiceCard key={o.key} emoji={o.emoji} label={o.label} selected={selected.includes(o.key)} onClick={() => toggle(o.key)} />
        ))}
      </div>
      <div className="text-center">
        <Button onClick={onNext} className="rounded-full px-8">
          {hasSelection ? "Suivant →" : "Passer →"}
        </Button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   AFFINAGE SCREENS (Steps 8-9)
   ════════════════════════════════════════════════════════ */

function ChangeScreen({ value, onChange, onNext }: { value: string; onChange: (v: string) => void; onNext: () => void }) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Si tu pouvais changer UNE chose dans ta com' demain, ce serait quoi ?
        </h1>
        <p className="text-sm text-muted-foreground italic">pas de mauvaise réponse, dis ce qui te vient</p>
      </div>
      <VoiceInput
        value={value}
        onChange={onChange}
        placeholder="Ex : avoir un feed Instagram cohérent, trouver ma ligne éditoriale..."
        multiline
      />
      <div className="text-center">
        <Button onClick={onNext} disabled={!value.trim()} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}


function UniquenessScreen({ value, onChange, onNext }: { value: string; onChange: (v: string) => void; onNext: () => void }) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          C'est quoi LE truc qui te rend différente des autres dans ton domaine ?
        </h1>
        <p className="text-sm text-muted-foreground italic">même si tu penses que c'est pas grand-chose</p>
      </div>
      <VoiceInput
        value={value}
        onChange={onChange}
        placeholder="Ex : mon approche est très humaine, je mets les gens à l'aise..."
        multiline
      />
      <div className="text-center">
        <Button onClick={onNext} disabled={!value.trim()} className="rounded-full px-8">Voir mon diagnostic →</Button>
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
