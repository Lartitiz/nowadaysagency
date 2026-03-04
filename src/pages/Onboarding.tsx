import { useState, useCallback, useEffect } from "react";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Film, SkipForward } from "lucide-react";
import DiagnosticLoading from "@/components/onboarding/DiagnosticLoading";
import DiagnosticView from "@/components/onboarding/DiagnosticView";
import { TOTAL_STEPS } from "@/lib/onboarding-constants";
import { useOnboarding } from "@/hooks/use-onboarding";
import type { Answers, BrandingAnswers } from "@/hooks/use-onboarding";
import { useToast } from "@/hooks/use-toast";

import OnboardingProgress from "@/components/onboarding/OnboardingProgress";
import WelcomeStep from "@/components/onboarding/steps/WelcomeStep";
import ActivityStep from "@/components/onboarding/steps/ActivityStep";
import ProductServiceScreen from "@/components/onboarding/steps/ProductServiceScreen";
import OnboardingPhase1Profile from "@/components/onboarding/OnboardingPhase1Profile";
import OnboardingPhase2Import from "@/components/onboarding/OnboardingPhase2Import";
import {
  CanauxCombinedScreen, ObjectifScreen, BlocageScreen, TempsScreen,
  ChangeScreen, UniquenessScreen,
} from "@/components/onboarding/OnboardingPhase3Branding";

/* ─── Step validation schemas ─── */
const stepValidators: Record<number, { schema: z.ZodType<any>; getData: (a: Answers, b: BrandingAnswers) => any; message: string }> = {
  1: {
    schema: z.object({ prenom: z.string().trim().min(2), activite: z.string().trim().min(2) }),
    getData: (a) => ({ prenom: a.prenom, activite: a.activite }),
    message: "Ton prénom et ton activité doivent faire au moins 2 caractères",
  },
  2: {
    schema: z.object({ activity_type: z.string().min(1), activity_detail: z.string() }).refine(data => data.activity_type !== "autre" || data.activity_detail.trim().length >= 5, { message: "Décris ton activité en au moins 5 caractères" }),
    getData: (a) => ({ activity_type: a.activity_type, activity_detail: a.activity_detail || "" }),
    message: "Choisis un type d'activité pour continuer",
  },
  6: {
    schema: z.object({ objectif: z.string().min(1) }),
    getData: (a) => ({ objectif: a.objectif }),
    message: "Choisis un objectif pour continuer",
  },
  7: {
    schema: z.object({ blocage: z.string().min(1) }),
    getData: (a) => ({ blocage: a.blocage }),
    message: "Choisis ton blocage principal pour continuer",
  },
  8: {
    schema: z.object({ temps: z.string().min(1) }),
    getData: (a) => ({ temps: a.temps }),
    message: "Indique le temps que tu peux y consacrer",
  },
};

const variants = {
  enter: { opacity: 0, y: 24 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -24 },
};

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
    if (step > 8 && !hasSeenVoiceTip) setHasSeenVoiceTip(true);
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

  useEffect(() => {
    if (!pendingAutoNext) return;
    const field = step === 3 ? answers.product_or_service
      : step === 6 ? answers.objectif
      : step === 7 ? answers.blocage
      : step === 8 ? answers.temps
      : null;
    if (field) {
      const timer = setTimeout(() => { validatedNext(); setPendingAutoNext(false); }, 400);
      return () => clearTimeout(timer);
    }
  }, [pendingAutoNext, answers.product_or_service, answers.objectif, answers.blocage, answers.temps, step, validatedNext]);

  const hasInstagram = uploadedFiles.some(f =>
    ['png', 'jpg', 'jpeg', 'webp'].includes(f.name.split('.').pop()?.toLowerCase() || '')
  );
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

      <OnboardingProgress step={step} totalSteps={TOTAL_STEPS} progress={progress} onBack={prev} />

      {step <= 11 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="max-w-lg w-full flex-1 flex items-center">
            <div className="w-full">
              <AnimatePresence mode="wait">
                <motion.div key={step} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3, ease: "easeOut" }}>
                  {step >= 9 && step <= 10 && !hasSeenVoiceTip && (
                    <p className="text-xs text-muted-foreground text-center mb-2 animate-in fade-in">💡 Tu vois l'icône 🎤 ? Clique dessus pour dicter ta réponse.</p>
                  )}

                  {step === 0 && <WelcomeStep onNext={next} />}
                  {step === 1 && <OnboardingPhase1Profile prenom={answers.prenom} activite={answers.activite} onPrenomChange={v => set("prenom", v)} onActiviteChange={v => set("activite", v)} onNext={validatedNext} />}
                  {step === 2 && <ActivityStep value={answers.activity_type} detailValue={answers.activity_detail} onChange={v => { set("activity_type", v); if (v !== "autre") set("activity_detail", ""); }} onDetailChange={v => set("activity_detail", v)} onNext={validatedNext} />}
                  {step === 3 && <ProductServiceScreen value={answers.product_or_service} onChange={v => { set("product_or_service", v); setPendingAutoNext(true); }} />}
                  {step === 4 && <OnboardingPhase2Import answers={answers} set={set} files={isDemoMode ? [{ id: "demo-file", name: "profil_instagram_lea.png", url: "" }] : uploadedFiles} uploading={uploading} onUpload={isDemoMode ? () => {} : handleFileUpload} onRemove={isDemoMode ? () => {} : removeFile} onNext={next} isDemoMode={isDemoMode} />}
                  {step === 5 && <CanauxCombinedScreen answers={answers} set={set} onNext={next} />}
                  {step === 6 && <ObjectifScreen value={answers.objectif} onChange={v => { set("objectif", v); setPendingAutoNext(true); }} />}
                  {step === 7 && <BlocageScreen value={answers.blocage} onChange={v => { set("blocage", v); setPendingAutoNext(true); }} />}
                  {step === 8 && <TempsScreen value={answers.temps} onChange={v => { set("temps", v); setPendingAutoNext(true); }} />}
                  {step === 9 && <ChangeScreen value={answers.change_priority} onChange={v => set("change_priority", v)} onNext={validatedNext} />}
                  {step === 10 && <UniquenessScreen value={answers.uniqueness} onChange={v => set("uniqueness", v)} onNext={async () => { await handleFinish(); next(); }} />}
                  {step === 11 && <DiagnosticLoading hasInstagram={hasInstagram} hasWebsite={hasWebsite} hasDocuments={isDemoMode ? true : uploadedFiles.length > 0} isDemoMode={isDemoMode} answers={answers} brandingAnswers={brandingAnswers} uploadedFileIds={uploadedFiles.map(f => f.id)} activityType={answers.activity_type} onReady={(data) => { setDiagnosticData(data); setStep(12); }} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {step > 0 && step < 9 && (
            <p className="text-center text-xs text-muted-foreground/60 pb-4 mt-2">{getTimeRemaining(step)}</p>
          )}
        </div>
      ) : diagnosticData ? (
        <DiagnosticView data={diagnosticData} prenom={answers.prenom} onComplete={handleDiagnosticComplete} hasInstagram={hasInstagram} hasWebsite={hasWebsite} sourcesUsed={diagnosticData.sources_used} sourcesFailed={diagnosticData.sources_failed} />
      ) : null}
    </div>
  );
}
