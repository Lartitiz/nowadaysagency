import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Confetti from "@/components/Confetti";
import BrandingCoachingFlow from "@/components/branding/BrandingCoachingFlow";
import { useReviewCarousel } from "@/components/branding/review/use-review-carousel";
import { useReviewValidation } from "@/components/branding/review/use-review-validation";
import { COACHING_SECTION_MAP, type AnalysisResult, type OfferItem, type SectionKey } from "@/components/branding/review/types";
import { getConfidence } from "@/components/branding/review/ReviewBits";
import { ReviewHeader } from "@/components/branding/review/ReviewHeader";
import { ReviewCard } from "@/components/branding/review/ReviewCard";
import { ReviewEndCard } from "@/components/branding/review/ReviewEndCard";
import { ReviewStickyBar } from "@/components/branding/review/ReviewStickyBar";

// Réexportations : BrandingPage, demo-autofill-data, BrandLearnedSection et les
// tests importent ces noms depuis ce fichier (fiche 14, lot 1).
export type { AnalysisResult } from "@/components/branding/review/types";
export { CharterSection, normalizeHex } from "@/components/branding/review/CharterSection";

interface Props {
  analysis: AnalysisResult;
  sourcesUsed?: string[];
  sourcesFailed?: string[];
  onDone: (complete?: boolean) => void;
  onProgress?: (sections: string[]) => Promise<void>;
  /** Sections already filled by the user (won't be overwritten) */
  preFilledSections?: Set<string>;
  /** Noms des offres déjà enregistrées dans l'espace (détection de doublon) */
  existingOfferNames?: string[];
  /** Callback for Instagram bio paste + reanalysis */
  onReanalyzeWithBio?: (bio: string) => void;
  /**
   * Parcours d'inscription : valider sa fiche EST l'étape en cours (pas de
   * « finir plus tard », pas de raccourci vers la création). Hors onboarding
   * — retour sur /branding plus tard — la porte de sortie reste ouverte.
   */
  mandatory?: boolean;
}

// ─── Main Component ──────────────────────────────────────────
export default function BrandingReview({ analysis, sourcesUsed = [], sourcesFailed = [], onDone, onProgress, preFilledSections, existingOfferNames, onReanalyzeWithBio, mandatory = false }: Props) {
  const [productPhotosReady, setProductPhotosReady] = useState(false);
  const [coachingSection, setCoachingSection] = useState<SectionKey | null>(null);

  const { total, index, setIndex, finished, goTo, goNext, goPrev, handleTouchStart, handleTouchEnd } = useReviewCarousel(coachingSection);

  // Editable offers state
  const [editedOffers, setEditedOffers] = useState<OfferItem[]>(() => analysis.offers?.offers ? [...analysis.offers.offers] : []);
  const handleOfferUpdate = useCallback((index: number, offer: OfferItem) => {
    setEditedOffers(prev => prev.map((o, i) => i === index ? offer : o));
  }, []);
  const handleOfferDelete = useCallback((index: number) => {
    setEditedOffers(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Charte éditable : couleurs/typos corrigées à la main priment sur l'analyse
  // (indispensable quand la palette est « proposée » faute de CSS lisible).
  const [editedCharter, setEditedCharter] = useState<AnalysisResult["charter"]>(() => analysis.charter ? { ...analysis.charter } : undefined);
  const handleCharterUpdate = useCallback((charter: NonNullable<AnalysisResult["charter"]>) => {
    setEditedCharter(charter);
  }, []);

  const { validated, savingSection, showConfetti, refinedSections, toReview, validatingAll, wroteSomething, handleKeepAsIs, handleToReview, handleValidate, handleValidateAll, completeCoaching } = useReviewValidation({
    analysis, onProgress, preFilledSections, editedOffers, editedCharter, goNext, setIndex, total, setCoachingSection,
  });
  const waitingForPhotos = mandatory && finished && !productPhotosReady;
  const canComplete = !mandatory || (finished && productPhotosReady);
  const completeReview = () => {
    if (mandatory && !finished) {
      goTo(total); // Monte la carte photos avant d'autoriser le premier contenu.
      return;
    }
    if (canComplete) onDone(true);
  };

  const validatedCount = validated.size;
  const allDone = validatedCount === 7;

  return (
    <div className="pb-40 md:pb-24">
      {showConfetti && <Confetti />}

      {/* Header */}
      <ReviewHeader
        analysis={analysis}
        sourcesUsed={sourcesUsed}
        sourcesFailed={sourcesFailed}
        preFilledSections={preFilledSections}
        allDone={allDone}
        validatingAll={validatingAll}
        savingSection={savingSection}
        handleValidateAll={handleValidateAll}
        onReanalyzeWithBio={onReanalyzeWithBio}
      />

      {/* Coaching overlay */}
      <AnimatePresence>
        {coachingSection && (
          <motion.div key="coaching" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.3 }} className="mb-6">
            <button onClick={() => setCoachingSection(null)} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Revenir à la vue d'ensemble
            </button>
            <BrandingCoachingFlow
              section={COACHING_SECTION_MAP[coachingSection] as any}
              autofillData={analysis[coachingSection]}
              autofillConfidence={getConfidence(analysis[coachingSection])}
              onComplete={() => completeCoaching(coachingSection)}
              onBack={() => setCoachingSection(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Carrousel : une carte par section */}
      {!coachingSection && !finished && (
        <ReviewCard
          analysis={analysis}
          index={index}
          total={total}
          preFilledSections={preFilledSections}
          validated={validated}
          toReview={toReview}
          savingSection={savingSection}
          refinedSections={refinedSections}
          editedOffers={editedOffers}
          handleOfferUpdate={handleOfferUpdate}
          handleOfferDelete={handleOfferDelete}
          existingOfferNames={existingOfferNames}
          editedCharter={editedCharter}
          handleCharterUpdate={handleCharterUpdate}
          goTo={goTo}
          goPrev={goPrev}
          goNext={goNext}
          handleTouchStart={handleTouchStart}
          handleTouchEnd={handleTouchEnd}
          handleValidate={handleValidate}
          handleKeepAsIs={handleKeepAsIs}
          handleToReview={handleToReview}
          setCoachingSection={setCoachingSection}
        />
      )}

      {/* Carte de fin : ce qui est enregistré, et ce qui attend encore une réponse */}
      {!coachingSection && finished && (
        <ReviewEndCard
          validated={validated}
          toReview={toReview}
          goTo={goTo}
          mandatory={mandatory}
          setProductPhotosReady={setProductPhotosReady}
          completeReview={completeReview}
          canComplete={canComplete}
          productPhotosReady={productPhotosReady}
          handleValidateAll={handleValidateAll}
          validatingAll={validatingAll}
          savingSection={savingSection}
          recheckHint={analysis.allow_overwrite === true && wroteSomething}
        />
      )}

      {/* Sticky bottom bar — décalée au-dessus de la barre d'onglets mobile (bottom-14 = 3.5rem) */}
      <ReviewStickyBar
        allDone={allDone}
        validatedCount={validatedCount}
        total={total}
        completeReview={completeReview}
        waitingForPhotos={waitingForPhotos}
        mandatory={mandatory}
        finished={finished}
        handleValidateAll={handleValidateAll}
        validatingAll={validatingAll}
        savingSection={savingSection}
        onDone={onDone}
      />
    </div>
  );
}
