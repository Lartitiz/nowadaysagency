import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Confetti from "@/components/Confetti";
import BrandingCoachingFlow from "@/components/branding/BrandingCoachingFlow";
import { useReviewCarousel } from "@/components/branding/review/use-review-carousel";
import { useReviewValidation } from "@/components/branding/review/use-review-validation";
import { SECTIONS, COACHING_SECTION_MAP, type AnalysisResult, type OfferItem, type SectionKey } from "@/components/branding/review/types";
import { getConfidence } from "@/components/branding/review/ReviewBits";
import { sectionHasData } from "@/components/branding/review/SectionViews";
import { withAnswer } from "@/components/branding/review/catch-up";
import { ReviewHeader } from "@/components/branding/review/ReviewHeader";
import { ReviewCard } from "@/components/branding/review/ReviewCard";
import { ReviewEndCard } from "@/components/branding/review/ReviewEndCard";
import { ReviewStickyBar } from "@/components/branding/review/ReviewStickyBar";
import { ReviewQuickRefine } from "@/components/branding/review/ReviewQuickRefine";

// Réexportations : BrandingPage, demo-autofill-data, BrandLearnedSection et les
// tests importent ces noms depuis ce fichier (fiche 14, lot 1).
export type { AnalysisResult } from "@/components/branding/review/types";
export { CharterSection, normalizeHex } from "@/components/branding/review/CharterSection";

interface Props {
  analysis: AnalysisResult;
  sourcesFailed?: string[];
  onDone: (complete?: boolean) => void;
  onProgress?: (sections: string[]) => Promise<void>;
  /** Sections already filled by the user (won't be overwritten) */
  preFilledSections?: Set<string>;
  /** Noms des offres déjà enregistrées dans l'espace (détection de doublon) */
  existingOfferNames?: string[];
  /**
   * Parcours d'inscription : valider sa fiche EST l'étape en cours (pas de
   * « finir plus tard », pas de raccourci vers la création). Hors onboarding
   * — retour sur /branding plus tard — la porte de sortie reste ouverte.
   */
  mandatory?: boolean;
}

// ─── Main Component ──────────────────────────────────────────
export default function BrandingReview({ analysis: analysisIn, sourcesFailed = [], onDone, onProgress, preFilledSections, existingOfferNames, mandatory = false }: Props) {
  const [productPhotosReady, setProductPhotosReady] = useState(false);
  // Réponses de rattrapage des cartes vides : ajoutées à l'analyse affichée et
  // enregistrée, comme si l'analyse les avait trouvées.
  const [answers, setAnswers] = useState<Partial<AnalysisResult>>({});
  const analysis = useMemo(() => ({ ...analysisIn, ...answers }), [analysisIn, answers]);
  const [coachingSection, setCoachingSection] = useState<SectionKey | null>(null);
  // Onboarding : « On affine ensemble » = une seule passe (ReviewQuickRefine),
  // sauf sur une partie déjà remplie avant (la conversation y complète sans écraser).
  const [quickSection, setQuickSection] = useState<SectionKey | null>(null);

  const { total, index, setIndex, finished, goTo, goNext, goPrev, handleTouchStart, handleTouchEnd } = useReviewCarousel(coachingSection || quickSection);

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

  // Carte vide = rien trouvé par l'analyse (ni dans les offres / la charte
  // retouchées) et rien de déjà écrit par la personne.
  const cardIsEmpty = useCallback((key: SectionKey) => {
    if (preFilledSections?.has(key)) return false;
    const view = { ...analysis, offers: { ...analysis.offers, offers: editedOffers }, charter: editedCharter };
    return !sectionHasData(key, view);
  }, [analysis, editedOffers, editedCharter, preFilledSections]);

  const { validated, savingSection, showConfetti, refinedSections, toReview, validatingAll, wroteSomething, handleKeepAsIs, handleToReview, handleValidate, handleValidateAll, completeCoaching } = useReviewValidation({
    analysis, onProgress, preFilledSections, editedOffers, editedCharter, goNext, setIndex, total, setCoachingSection, isEmptyCard: cardIsEmpty,
  });
  // Carte remplie à l'écran (réponse de rattrapage ou carte réécrite) : affichée
  // et enregistrée avec les mêmes fonctions d'écriture que « C'est bon ».
  const saveCard = async (key: SectionKey, data: NonNullable<AnalysisResult[SectionKey]>) => {
    setAnswers((prev) => ({ ...prev, [key]: data }));
    if (key === "offers") setEditedOffers((data as NonNullable<AnalysisResult["offers"]>).offers || []);
    if (key === "charter") setEditedCharter(data as AnalysisResult["charter"]);
    await handleValidate(key, data);
  };
  const handleAnswer = (key: SectionKey, answer: string) => { void saveCard(key, withAnswer(key, analysis[key], answer)); };
  const quickRefine = mandatory;
  const openRefine = (key: SectionKey | null) => {
    // Passe unique : en onboarding, et pour une section sans conversation (proposition de valeur).
    if (key && !preFilledSections?.has(key) && (quickRefine || !COACHING_SECTION_MAP[key])) setQuickSection(key);
    else setCoachingSection(key);
  };
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
  // Les cartes restées vides ne bloquent pas la fin : elles se rempliront dans Mon identité.
  const emptyLeft = SECTIONS.filter((s) => !validated.has(s.key) && cardIsEmpty(s.key)).length;
  // Le haut ne compte que ce que l'analyse a trouvé : une carte écrite par la
  // personne (réponse de rattrapage, carte réécrite) n'est pas « remplie par
  // moi » (vu le 25/10/2026 : « J'ai rempli les 7 cartes » après son histoire).
  const filledCount = useMemo(() => SECTIONS.filter((s) => sectionHasData(s.key, analysisIn)).length, [analysisIn]);
  const allDone = validatedCount + emptyLeft === SECTIONS.length;

  return (
    <div className="pb-40 md:pb-24">
      {showConfetti && <Confetti />}

      {/* Header */}
      <ReviewHeader
        analysis={analysis}
        sourcesFailed={sourcesFailed}
        filledCount={filledCount}
        emptyLeft={emptyLeft}
      />

      {/* Coaching overlay */}
      <AnimatePresence>
        {coachingSection && COACHING_SECTION_MAP[coachingSection] && (
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

      {quickSection && (
        <ReviewQuickRefine
          key={quickSection}
          sectionKey={quickSection}
          analysis={analysis}
          saving={savingSection === quickSection}
          onSave={async (data) => { await saveCard(quickSection, data); setQuickSection(null); }}
          onCancel={() => setQuickSection(null)}
        />
      )}

      {/* Carrousel : une carte par section */}
      {!coachingSection && !quickSection && !finished && (
        <ReviewCard
          analysis={analysis}
          index={index}
          total={total}
          preFilledSections={preFilledSections}
          validated={validated}
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
          isEmpty={cardIsEmpty(SECTIONS[Math.min(index, SECTIONS.length - 1)].key)}
          onAnswer={handleAnswer}
          handleKeepAsIs={handleKeepAsIs}
          handleToReview={handleToReview}
          setCoachingSection={openRefine}
          quickRefine={quickRefine}
        />
      )}

      {/* Carte de fin : ce qui est enregistré, et ce qui attend encore une réponse */}
      {!coachingSection && !quickSection && finished && (
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
          isEmptyCard={cardIsEmpty}
          recheckHint={analysis.allow_overwrite === true && wroteSomething}
        />
      )}

      {/* Sticky bottom bar — décalée au-dessus de la barre d'onglets mobile (bottom-14 = 3.5rem) */}
      <ReviewStickyBar
        allDone={allDone}
        validatedCount={validatedCount}
        emptyLeft={emptyLeft}
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
