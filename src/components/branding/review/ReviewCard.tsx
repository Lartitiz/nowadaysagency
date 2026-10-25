// Carte en cours de la relecture de marque : fil de progression, une section
// (déjà commencée / vide / normale), réponses et Précédent / Suivant.
// Sorti de BrandingReview.tsx (fiche 14 de docs/robustesse/gros-fichiers.md, lot 5).
// Depuis le 24/10/2026 (chantier 4) : les mêmes 2 boutons sur une carte remplie,
// « C'est juste » et « Je corrige », sans badge de confiance ni « À revoir ».
import type React from "react";
import { CheckCircle2, Sparkles, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { BrandLogoSuggestion } from "@/components/branding/BrandLogoSuggestion";
import { SECTIONS, COACHING_SECTION_MAP, type AnalysisResult, type OfferItem, type SectionKey } from "./types";
import { RENDERERS, sectionHasData } from "./SectionViews";
import { OffersSection } from "./OffersSection";
import { CharterSection } from "./CharterSection";
import { ReviewCatchUp } from "./ReviewCatchUp";
import { FoldableSection, sectionSummary } from "./SectionSummary";
import { thinCardHint } from "./thin-card";

interface ReviewCardProps {
  analysis: AnalysisResult;
  index: number;
  total: number;
  preFilledSections?: Set<string>;
  validated: Set<SectionKey>;
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
  /** Onboarding : « On affine ensemble » en une passe, possible sur toutes les cartes. */
  quickRefine?: boolean;
}

export function ReviewCard({ analysis, index, total, preFilledSections, validated, savingSection, refinedSections, editedOffers, handleOfferUpdate, handleOfferDelete, existingOfferNames, editedCharter, handleCharterUpdate, goTo, goPrev, goNext, handleTouchStart, handleTouchEnd, handleValidate, handleKeepAsIs, handleToReview, setCoachingSection, isEmpty = false, onAnswer, quickRefine = false }: ReviewCardProps) {
  const sec = SECTIONS[index];
  const isPreFilled = preFilledSections?.has(sec.key) ?? false;
  const isValidated = validated.has(sec.key);
  const hasData = sectionHasData(sec.key, analysis);
  // Carte vide (rien trouvé, rien d'écrit avant) : question de rattrapage.
  const showCatchUp = isEmpty && !isValidated;
  const isSaving = savingSection === sec.key;
  const isRefined = refinedSections.has(sec.key);
  // « Je corrige » : la passe unique en onboarding, et partout pour une section
  // sans conversation prévue (la proposition de valeur, depuis le 24/10/2026 :
  // à l'import de Mon identité, sa carte n'avait que « C'est juste »).
  const quickPass = !isPreFilled && (quickRefine || !COACHING_SECTION_MAP[sec.key]);
  const canRefine = quickPass || !!COACHING_SECTION_MAP[sec.key];
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
  // Chantier 5 (24/10/2026) : l'essentiel en 3 à 5 lignes, le reste derrière
  // « Voir le détail ». L'enregistrement, lui, prend toujours toute la section.
  const summary = sectionSummary(sec.key, { ...analysis, offers: { ...analysis.offers, offers: editedOffers }, charter: editedCharter }, existingOfferNames);
  const cardBody = <FoldableSection key={sec.key} summary={summary.node} hasMore={summary.hasMore} full={sectionBody} />;
  // Carte qui ne fait que reprendre la réponse de départ : marquée « Hypothèse »
  // comme la cible et le ton, et « Je corrige » passe devant (25/10/2026).
  const thinHint = canRefine ? thinCardHint(sec.key, { ...analysis, offers: { ...analysis.offers, offers: editedOffers } }) : null;
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
        <div className="flex items-center justify-between gap-3 p-5 sm:p-6 pb-0 sm:pb-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl shrink-0">{sec.emoji}</span>
            <h2 className="font-display text-lg text-foreground" style={{ fontWeight: 400 }}>{sec.title}</h2>
            {isValidated && <CheckCircle2 className="h-5 w-5 text-success shrink-0" />}
            {isRefined && <span className="text-2xs text-success font-medium">Affiné</span>}
          </div>
        </div>

        <div className="px-5 sm:px-6 pt-4 pb-5 sm:pb-6">
          {isPreFilled && !isRefined ? (
            <>
              {hasData ? (
                <>
                  <p className="text-sm text-muted-foreground mb-3">
                    Déjà commencée : « C'est juste » ajoute seulement ce qui manque, sans toucher à ce que tu as écrit.
                  </p>
                  <div className="mb-5">{cardBody}</div>
                </>
              ) : (
                // Déjà remplie, rien de neuf : avant, la carte montrait un encadré sur du vide.
                <p className="text-sm text-muted-foreground mb-5">Tu avais déjà rempli cette partie, et l'analyse n'a rien trouvé de plus. Ce que tu as écrit reste tel quel.</p>
              )}
              {/* 2 boutons au plus : avec du neuf, « C'est juste » complète les
                  champs vides et « Garder tel quel » n'ajoute rien ; sans rien de
                  neuf, « Garder tel quel » et « Je corrige ». */}
              <div className="flex gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
                {hasData ? (
                  <>
                    <PrimaryButton onClick={() => handleValidate(sec.key)} disabled={isSaving} saving={isSaving}>C'est juste</PrimaryButton>
                    <SecondaryButton onClick={() => handleKeepAsIs(sec.key)} disabled={isSaving}>Garder tel quel</SecondaryButton>
                  </>
                ) : (
                  <>
                    <PrimaryButton onClick={() => handleKeepAsIs(sec.key)} disabled={isSaving} saving={isSaving}>Garder tel quel</PrimaryButton>
                    {canRefine && <SecondaryButton onClick={() => setCoachingSection(sec.key)} icon={<Pencil className="h-4 w-4" />}>Je corrige</SecondaryButton>}
                  </>
                )}
              </div>
            </>
          ) : showCatchUp ? (
            <ReviewCatchUp key={sec.key} sectionKey={sec.key} saving={isSaving} onSubmit={(answer) => onAnswer(sec.key, answer)} onLater={() => handleToReview(sec.key)} />
          ) : (
            <>
              <div className="mb-5">{cardBody}</div>
              {thinHint && !isValidated && (
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed"><span className="font-semibold text-foreground">Hypothèse :</span> {thinHint}</p>
              )}
              {isValidated ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                  <p className="text-sm text-success font-medium flex-1">✅ Cette carte est enregistrée.</p>
                  {/* En onboarding, une carte enregistrée ne se réécrit plus ici (une seule écriture) : Mon identité s'en charge. */}
                  {/* La passe unique n'écrit qu'une fois : pas de seconde passe sur une carte enregistrée. */}
                  {!!COACHING_SECTION_MAP[sec.key] && !quickRefine && (
                    <button onClick={() => setCoachingSection(sec.key)} className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary-text hover:underline">
                      <Sparkles className="h-4 w-4" /> L'affiner quand même
                    </button>
                  )}
                </div>
              ) : (
                // « À revoir » retiré : ne rien choisir et passer à la suivante revient au même.
                thinHint ? (
                  <div className="flex gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
                    <PrimaryButton onClick={() => setCoachingSection(sec.key)} icon={<Pencil className="h-4 w-4" />}>Je corrige</PrimaryButton>
                    <SecondaryButton onClick={() => handleValidate(sec.key)} disabled={isSaving} saving={isSaving} icon={<CheckCircle2 className="h-4 w-4" />}>C'est juste</SecondaryButton>
                  </div>
                ) : (
                  <div className="flex gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
                    <PrimaryButton onClick={() => handleValidate(sec.key)} disabled={isSaving} saving={isSaving}>C'est juste</PrimaryButton>
                    {canRefine && <SecondaryButton onClick={() => setCoachingSection(sec.key)} icon={<Pencil className="h-4 w-4" />}>Je corrige</SecondaryButton>}
                  </div>
                )
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

// Les 2 boutons de carte, partout les mêmes : plein (bordeaux) puis contour.
function PrimaryButton({ onClick, disabled, saving, icon, children }: { onClick: () => void; disabled?: boolean; saving?: boolean; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-3 sm:px-5 py-2 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50">
      {saving ? <Spinner className="h-4 w-4 text-white" /> : icon ?? <CheckCircle2 className="h-4 w-4" />}
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, disabled, saving, icon, children }: { onClick: () => void; disabled?: boolean; saving?: boolean; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-primary text-primary rounded-[12px] px-3 sm:px-5 py-2 text-sm font-semibold hover:bg-rose-pale transition-all disabled:opacity-50">
      {saving ? <Spinner className="h-4 w-4" /> : icon} {children}
    </button>
  );
}
