// Carte en cours de la relecture de marque : fil de progression, une section
// (déjà commencée / pas assez d'infos / normale), réponses et Précédent / Suivant.
// Sorti de BrandingReview.tsx à l'identique (fiche 14 de docs/robustesse/gros-fichiers.md, lot 5).
import type React from "react";
import { CheckCircle2, Sparkles, Lock, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { BrandLogoSuggestion } from "@/components/branding/BrandLogoSuggestion";
import { SECTIONS, COACHING_SECTION_MAP, type AnalysisResult, type OfferItem, type SectionKey } from "./types";
import { getConfidence, ConfidenceBadge } from "./ReviewBits";
import { RENDERERS, sectionHasData } from "./SectionViews";
import { OffersSection } from "./OffersSection";
import { CharterSection } from "./CharterSection";
import { ReviewCatchUp } from "./ReviewCatchUp";

interface ReviewCardProps {
  analysis: AnalysisResult;
  index: number;
  total: number;
  preFilledSections?: Set<string>;
  validated: Set<SectionKey>;
  toReview: Set<SectionKey>;
  savingSection: SectionKey | null;
  refinedSections: Set<SectionKey>;
  editedOffers: OfferItem[];
  handleOfferUpdate: (index: number, offer: OfferItem) => void;
  handleOfferDelete: (index: number) => void;
  existingOfferNames?: string[];
  editedCharter: AnalysisResult["charter"];
  handleCharterUpdate: (charter: NonNullable<AnalysisResult["charter"]>) => void;
  goTo: (index: number) => void;
  goPrev: () => void;
  goNext: () => void;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
  handleValidate: (key: SectionKey) => void;
  handleKeepAsIs: (key: SectionKey) => void;
  handleToReview: (key: SectionKey) => void;
  setCoachingSection: (key: SectionKey | null) => void;
  /** Rien trouvé par l'analyse et rien d'écrit avant : la carte pose une question. */
  isEmpty?: boolean;
  onAnswer: (key: SectionKey, answer: string) => void;
}

export function ReviewCard({ analysis, index, total, preFilledSections, validated, toReview, savingSection, refinedSections, editedOffers, handleOfferUpdate, handleOfferDelete, existingOfferNames, editedCharter, handleCharterUpdate, goTo, goPrev, goNext, handleTouchStart, handleTouchEnd, handleValidate, handleKeepAsIs, handleToReview, setCoachingSection, isEmpty = false, onAnswer }: ReviewCardProps) {
  const sec = SECTIONS[index];
  const conf = getConfidence(analysis[sec.key]);
  const isPreFilled = preFilledSections?.has(sec.key) ?? false;
  const isValidated = validated.has(sec.key);
  const isMarked = toReview.has(sec.key);
  const hasData = sectionHasData(sec.key, analysis);
  // Carte vide (rien trouvé, rien d'écrit avant) : question de rattrapage.
  const showCatchUp = isEmpty && !isValidated;
  const isSaving = savingSection === sec.key;
  const isRefined = refinedSections.has(sec.key);
  // Pas d'« On affine ensemble » sur une section sans conversation prévue.
  const canRefine = !!COACHING_SECTION_MAP[sec.key];
  const sectionBody = sec.key === "offers"
    ? <OffersSection data={{ ...analysis.offers, offers: editedOffers }} onUpdate={handleOfferUpdate} onDelete={handleOfferDelete} existingOfferNames={existingOfferNames} />
    : sec.key === "charter"
      ? (
        <>
          <CharterSection data={editedCharter} onUpdate={handleCharterUpdate} />
          {/* Logo du site proposé pour la charte (masqué si déjà un logo / rien trouvé). */}
          <BrandLogoSuggestion placement="brand_review" className="mt-4" />
        </>
      )
      : RENDERERS[sec.key](analysis);
  return (
    <div>
      {/* Fil de progression : où j'en suis, et ce que j'ai déjà répondu */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="font-mono-ui text-xs text-muted-foreground">Carte {index + 1} sur {total}</p>
        <div className="flex items-center gap-1.5">
          {SECTIONS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Aller à « ${s.title} »`}
              aria-current={i === index ? "step" : undefined}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-6 bg-primary"
                  : validated.has(s.key) ? "w-2 bg-success"
                    : toReview.has(s.key) ? "w-2 bg-warning"
                      : "w-2 bg-border"
              }`}
            />
          ))}
        </div>
      </div>

      {/* La carte. `key` force le remontage à chaque section → l'animation
          d'entrée rejoue, et aucun état de carte ne fuit d'une section à l'autre. */}
      <div
        key={sec.key}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="bg-card rounded-[20px] shadow-card border border-border overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300"
      >
        <div className="flex items-center justify-between gap-3 p-5 sm:p-6 pb-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl shrink-0">{sec.emoji}</span>
            <h2 className="font-display text-lg text-foreground" style={{ fontWeight: 400 }}>{sec.title}</h2>
            {isValidated && <CheckCircle2 className="h-5 w-5 text-success shrink-0" />}
            {isRefined && <span className="text-2xs text-success font-medium">Affiné</span>}
            {isMarked && !isValidated && (
              <span className="inline-flex items-center gap-1 text-2xs font-medium px-2 py-0.5 rounded-full bg-warning-bg text-warning shrink-0">
                À revoir
              </span>
            )}
            {isPreFilled && !isRefined && (
              <span className="inline-flex items-center gap-1 text-2xs font-medium px-2 py-0.5 rounded-full bg-info-bg text-info shrink-0">
                <Lock className="h-3 w-3" /> Déjà complété
              </span>
            )}
          </div>
          {!isValidated && !isPreFilled && <ConfidenceBadge level={isEmpty ? "low" : conf} />}
        </div>

        <div className="px-5 sm:px-6 py-5 sm:py-6">
          {isPreFilled && !isRefined ? (
            <>
              {hasData ? (
                <>
                  <p className="text-sm text-muted-foreground mb-3 bg-info-bg border border-info/20 rounded-[12px] px-3 py-2">
                    Tu avais déjà commencé cette section. Voici ce que l'analyse a trouvé en plus — je <strong>complète seulement les champs vides</strong>, sans toucher à ce que tu as écrit.
                  </p>
                  <div className="mb-5">{sectionBody}</div>
                </>
              ) : (
                // Déjà remplie, rien de neuf : avant, la carte montrait un encadré sur du vide.
                <p className="text-sm text-muted-foreground mb-5">Tu avais déjà rempli cette partie, et l'analyse n'a rien trouvé de plus. Ce que tu as écrit reste tel quel.</p>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                {hasData && <button onClick={() => handleValidate(sec.key)} disabled={isSaving} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-5 py-2 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50">
                  {isSaving ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle2 className="h-4 w-4" />}
                  Compléter les champs vides ✓
                </button>}
                <button onClick={() => handleKeepAsIs(sec.key)} disabled={isSaving} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-success text-success rounded-[12px] px-5 py-2 text-sm font-semibold hover:bg-success-bg transition-all disabled:opacity-50">
                  <CheckCircle2 className="h-4 w-4" /> Garder tel quel
                </button>
                {canRefine && (
                  <button onClick={() => setCoachingSection(sec.key)} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-primary text-primary rounded-[12px] px-5 py-2 text-sm font-semibold hover:bg-rose-pale transition-all">
                    <Sparkles className="h-4 w-4" /> On affine ensemble →
                  </button>
                )}
              </div>
            </>
          ) : showCatchUp ? (
            <ReviewCatchUp key={sec.key} sectionKey={sec.key} saving={isSaving} onSubmit={(answer) => onAnswer(sec.key, answer)} onLater={() => handleToReview(sec.key)} />
          ) : (
            <>
              <div className="mb-5">{sectionBody}</div>
              {isValidated ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                  <p className="text-sm text-success font-medium flex-1">✅ Cette carte est enregistrée.</p>
                  {canRefine && (
                    <button onClick={() => setCoachingSection(sec.key)} className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary-text hover:underline">
                      <Sparkles className="h-4 w-4" /> L'affiner quand même
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button onClick={() => handleValidate(sec.key)} disabled={isSaving} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-5 py-2 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50">
                      {isSaving ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle2 className="h-4 w-4" />}
                      C'est bon ✓
                    </button>
                    <button onClick={() => handleToReview(sec.key)} disabled={isSaving} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-warning text-warning rounded-[12px] px-5 py-2 text-sm font-semibold hover:bg-warning-bg transition-all disabled:opacity-50">
                      <Pencil className="h-4 w-4" /> À revoir
                    </button>
                    {canRefine && (
                      <button onClick={() => setCoachingSection(sec.key)} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-primary text-primary rounded-[12px] px-5 py-2 text-sm font-semibold hover:bg-rose-pale transition-all">
                        <Sparkles className="h-4 w-4" /> On affine ensemble →
                      </button>
                    )}
                  </div>
                  {conf === "low" && canRefine && (
                    <p className="text-xs text-muted-foreground mt-2">Je n'ai pas trouvé assez d'infos pour cette partie. Quelques questions vont m'aider à compléter.</p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Navigation — le swipe est un raccourci, ces boutons restent la voie sûre */}
      <div className="flex items-center justify-between gap-3 mt-3">
        <button
          onClick={goPrev}
          disabled={index === 0}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" /> Précédent
        </button>
        <p className="text-2xs text-muted-foreground hidden sm:block">Flèches ← → du clavier</p>
        <p className="text-2xs text-muted-foreground sm:hidden">Glisse pour changer de carte</p>
        <button
          onClick={goNext}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Suivant <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
