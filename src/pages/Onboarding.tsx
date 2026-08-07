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
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
    schema: z.object({ product_or_service: z.string().min(1), activity_detail: z.string().trim().min(5) }),
    getData: (a) => ({ product_or_service: a.product_or_service, activity_detail: a.activity_detail || "" }),
    message: "Choisis produits/services et décris ton activité en quelques mots",
  },
  4: {
    schema: z.object({ canaux: z.array(z.string()).min(1) }),
    getData: (a) => ({ canaux: a.canaux }),
    message: "Sélectionne au moins un canal (ou 'Rien pour l'instant')",
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

  // Steps 9 & 10 (rédactions libres) sont FACULTATIFS — on ne bloque pas une
  // inscription pressée sur « ce que tu changerais » / « ce qui te rend
  // différente ». Les valeurs vides sont gérées en aval (diagnostic + branding).
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
    uploadedFiles, uploading, diagnosticData, setDiagnosticData,
    isDemoMode, demoData,
    handleFileUpload, removeFile, handleFinish, handleSkipDemo,
    handleDiagnosticComplete, getPlaceholder, getTimeRemaining, triggerPreScrape,
    brandedSpaceName, setOverwriteConfirmed, overwriteConfirmed,
  } = useOnboarding();

  const [pendingAutoNext, setPendingAutoNext] = useState(false);
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);

  // Dernière étape avant le diagnostic. Si l'espace porte déjà une identité de
  // marque, on demande AVANT de lancer : c'est le seul moment où l'on sait
  // encore distinguer « je refais mon onboarding exprès » de « je me suis
  // trompée d'espace ». Sans ce oui/non, l'edge se contentait de tout ignorer.
  const launchDiagnostic = useCallback(() => {
    next();
    void handleFinish();
  }, [next, handleFinish]);

  const handleUniquenessNext = useCallback(() => {
    if (brandedSpaceName !== null) {
      setConfirmOverwriteOpen(true);
      return;
    }
    launchDiagnostic();
  }, [brandedSpaceName, launchDiagnostic]);

  const validatedNext = useCallback(() => {
    const validator = stepValidators[step];
    if (validator) {
      const data = validator.getData(answers, brandingAnswers);
      const result = validator.schema.safeParse(data);
      if (!result.success) {
        toast.error("Un instant ✋", { description: validator.message });
        return;
      }
    }
    next();
  }, [step, answers, brandingAnswers, next]);

  // Arrivée sur l'onboarding = le marqueur d'inscription fraîche a rempli son
  // rôle (routage LandingPage/AuthContext). Le consommer ici pour qu'une
  // connexion ultérieure dans le même onglet ne soit pas déroutée.
  useEffect(() => {
    try { sessionStorage.removeItem("lac_fresh_signup"); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!pendingAutoNext) return;
    if (step !== 5 && step !== 6 && step !== 7) return;
    const field = step === 5 ? answers.objectif
      : step === 6 ? answers.blocage
      : step === 7 ? answers.temps
      : null;
    if (field) {
      const timer = setTimeout(() => { validatedNext(); setPendingAutoNext(false); }, 400);
      return () => clearTimeout(timer);
    }
  }, [pendingAutoNext, answers.objectif, answers.blocage, answers.temps, step, validatedNext]);


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

      {step <= 9 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="max-w-lg w-full flex-1 flex items-center">
            <div className="w-full">
              <AnimatePresence mode="wait">
                <motion.div key={step} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3, ease: "easeOut" }}>

                  {step === 0 && <WelcomeStep onNext={next} />}
                  {step === 1 && <OnboardingPhase1Profile prenom={answers.prenom} activite={answers.activite} onPrenomChange={v => set("prenom", v)} onActiviteChange={v => set("activite", v)} onNext={validatedNext} />}
                  {step === 2 && <ProductServiceScreen value={answers.product_or_service} onChange={v => { set("product_or_service", v); set("activity_type", v); }} detailValue={answers.activity_detail} onDetailChange={v => set("activity_detail", v)} activite={answers.activite} onNext={validatedNext} />}
                  {step === 3 && <OnboardingPhase2Import answers={answers} set={set} files={isDemoMode ? [{ id: "demo-file", name: "profil_instagram_lea.png", url: "" }] : uploadedFiles} uploading={uploading} onUpload={isDemoMode ? () => {} : handleFileUpload} onRemove={isDemoMode ? () => {} : removeFile} onNext={next} onLeave={triggerPreScrape} isDemoMode={isDemoMode} />}
                  {step === 4 && <CanauxCombinedScreen answers={answers} set={set} onNext={validatedNext} />}
                  {step === 5 && <ObjectifScreen value={answers.objectif} onChange={v => { set("objectif", v); setPendingAutoNext(true); }} />}
                  {step === 6 && <BlocageScreen value={answers.blocage} onChange={v => { set("blocage", v); setPendingAutoNext(true); }} />}
                  {step === 7 && <TempsScreen value={answers.temps} onChange={v => { set("temps", v); setPendingAutoNext(true); }} />}
                  {step === 8 && <ChangeScreen value={answers.change_priority} onChange={v => set("change_priority", v)} onNext={validatedNext} />}
                  {/* Étape 9 : on affiche le loader du diagnostic TOUT DE SUITE (next() d'abord),
                      puis la sauvegarde profil (handleFinish) part en arrière-plan. Le loader
                      lui-même (DiagnosticLoading, step 10) est rendu HORS de l'AnimatePresence
                      ci-dessous : sinon l'animation de sortie de l'étape 9 suspendait son
                      montage → écran « blanc » pendant le calcul deep-diagnostic (run QA T5). */}
                  {step === 9 && <UniquenessScreen value={answers.uniqueness} onChange={v => set("uniqueness", v)} onNext={handleUniquenessNext} />}

                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {step > 0 && step < 8 && (
            <p className="text-center text-xs text-muted-foreground/60 pb-4 mt-2">{getTimeRemaining(step)}</p>
          )}
        </div>
      ) : step === 10 ? (
        // Le diagnostic (étape de chargement) est rendu HORS de l'AnimatePresence :
        // monté immédiatement et de façon déterministe quand step passe à 10, il n'est
        // plus suspendu par l'animation de sortie de l'étape précédente (cause du blanc).
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="max-w-lg w-full">
            <DiagnosticLoading hasInstagram={hasInstagram} hasWebsite={hasWebsite} hasDocuments={isDemoMode ? true : uploadedFiles.length > 0} isDemoMode={isDemoMode} answers={answers} brandingAnswers={brandingAnswers} uploadedFileIds={uploadedFiles.map(f => f.id)} activityType={answers.activity_type} allowOverwrite={overwriteConfirmed} onReady={(data) => { setDiagnosticData(data); setStep(11); }} />

          </div>
        </div>
      ) : diagnosticData ? (
        <DiagnosticView data={diagnosticData} prenom={answers.prenom} onComplete={() => handleDiagnosticComplete()} onCreateFirst={() => handleDiagnosticComplete(true)} hasInstagram={hasInstagram} hasWebsite={hasWebsite} sourcesUsed={diagnosticData.sources_used} sourcesFailed={diagnosticData.sources_failed} />
      ) : null}

      <AlertDialog open={confirmOverwriteOpen} onOpenChange={setConfirmOverwriteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              L'espace {brandedSpaceName ? `« ${brandedSpaceName} »` : "actif"} a déjà une marque enregistrée
            </AlertDialogTitle>
            <AlertDialogDescription>
              Un positionnement, une mission et un ton y sont déjà écrits. Ce nouveau
              diagnostic peut les remplacer, ou les laisser tels quels et se contenter
              de te donner son analyse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="rounded-full"
              onClick={() => { setOverwriteConfirmed(false); launchDiagnostic(); }}
            >
              Garder ma marque actuelle
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full"
              onClick={() => { setOverwriteConfirmed(true); launchDiagnostic(); }}
            >
              Oui, remplacer par le nouveau
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
