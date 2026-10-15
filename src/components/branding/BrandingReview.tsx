import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Sparkles, ArrowLeft, Lock, Instagram, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Confetti from "@/components/Confetti";
import BrandingCoachingFlow from "@/components/branding/BrandingCoachingFlow";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SAVE_FNS, QUERY_KEYS } from "@/lib/branding-review-save";
import { useReviewCarousel } from "@/components/branding/review/use-review-carousel";
import { posthog } from "@/lib/posthog-lazy";
import { BrandPhotosPicker } from "@/components/photos/BrandPhotosPicker";
import { BrandLogoSuggestion } from "@/components/branding/BrandLogoSuggestion";
import { COACHING_SECTION_MAP, SECTIONS, type AnalysisResult, type OfferItem, type SectionKey } from "@/components/branding/review/types";
import { getConfidence, ConfidenceBadge, SourceTag } from "@/components/branding/review/ReviewBits";
import { RENDERERS, sectionHasData } from "@/components/branding/review/SectionViews";
import { OffersSection } from "@/components/branding/review/OffersSection";
import { CharterSection } from "@/components/branding/review/CharterSection";

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
  /** Callback for "describe project" fallback */
  onDescribeProject?: (text: string) => void;
  /** If true, all sources failed */
  allSourcesFailed?: boolean;
  /**
   * Parcours d'inscription : valider sa fiche EST l'étape en cours (pas de
   * « finir plus tard », pas de raccourci vers la création). Hors onboarding
   * — retour sur /branding plus tard — la porte de sortie reste ouverte.
   */
  mandatory?: boolean;
}

// ─── Main Component ──────────────────────────────────────────
export default function BrandingReview({ analysis, sourcesUsed = [], sourcesFailed = [], onDone, onProgress, preFilledSections, existingOfferNames, onReanalyzeWithBio, onDescribeProject, allSourcesFailed = false, mandatory = false }: Props) {
  const [productPhotosReady, setProductPhotosReady] = useState(false);
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();

  const [validated, setValidated] = useState<Set<SectionKey>>(() => new Set(
    SECTIONS.filter(s => analysis.reviewed_sections?.includes(s.key)).map(s => s.key),
  ));
  const validatedRef = useRef(validated);
  const written = useRef(new Set<SectionKey>());
  const savingRef = useRef(false);
  const markValidated = useCallback(async (key: SectionKey) => {
    const next = new Set(validatedRef.current).add(key);
    await onProgress?.([...next]);
    validatedRef.current = next;
    setValidated(next);
  }, [onProgress]);
  const [savingSection, setSavingSection] = useState<SectionKey | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [coachingSection, setCoachingSection] = useState<SectionKey | null>(null);
  const [refinedSections, setRefinedSections] = useState<Set<SectionKey>>(new Set());

  const { total, index, setIndex, finished, goTo, goNext, goPrev, handleTouchStart, handleTouchEnd } = useReviewCarousel(coachingSection);
  const [toReview, setToReview] = useState<Set<SectionKey>>(new Set());
  const [validatingAll, setValidatingAll] = useState(false);
  const waitingForPhotos = mandatory && finished && !productPhotosReady;
  const canComplete = !mandatory || (finished && productPhotosReady);
  const completeReview = () => {
    if (mandatory && !finished) {
      goTo(total); // Monte la carte photos avant d'autoriser le premier contenu.
      return;
    }
    if (canComplete) onDone(true);
  };

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
  
  // Instagram bio fallback
  const instagramFailed = sourcesFailed.includes("instagram") || (analysis.sources_failed || []).includes("instagram");
  const [igBio, setIgBio] = useState("");
  const [showIgBioInput, setShowIgBioInput] = useState(false);
  
  // Project description fallback
  const [projectText, setProjectText] = useState("");
  const [showProjectInput, setShowProjectInput] = useState(false);

  const validatedCount = validated.size;
  const allDone = validatedCount === 7;

  // Log section_validated events — PostHog, PAS ai_usage : ai_usage est la table
  // de FACTURATION (checkQuota compte toutes ses lignes du mois dans le quota),
  // y écrire de la télémétrie brûlait des crédits gratuits à chaque validation.
  const logEvent = useCallback(async (eventType: string, meta?: Record<string, any>) => {
    if (!user?.id) return;
    try {
      posthog.capture(eventType, {
        source: "branding_autofill",
        workspace_id: workspaceId !== user.id ? workspaceId : null,
        ...meta,
      });
    } catch { /* silent */ }
  }, [user?.id, workspaceId]);

  const clearToReview = useCallback((key: SectionKey) => {
    setToReview((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // « Garder tel quel » : on valide sans rien réécrire (l'existant prime).
  const handleKeepAsIs = useCallback(async (key: SectionKey) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSavingSection(key);
    try { await markValidated(key); clearToReview(key); goNext(); }
    catch { toast.error("Impossible d’enregistrer ta relecture. Réessaie."); }
    finally { savingRef.current = false; setSavingSection(null); }
  }, [markValidated, clearToReview, goNext]);

  // « À revoir » : on ne jette rien — la section est mise de côté et rappelée
  // sur la carte de fin, avec le lien pour y revenir.
  const handleToReview = useCallback((key: SectionKey) => {
    setToReview((prev) => new Set(prev).add(key));
    goNext();
  }, [goNext]);

  const handleValidate = useCallback(async (key: SectionKey) => {
    if (!user?.id || savingRef.current) return;
    savingRef.current = true;
    setSavingSection(key);
    try {
      const dataToSave = key === "offers" ? { ...analysis.offers, offers: editedOffers }
        : key === "charter" ? editedCharter
        : analysis[key];
      // `allow_overwrite` est posé par diagnostic-enrichment quand la reprise
      // d'onboarding a été confirmée à l'écran : dans ce cas seulement, ce que
      // la personne valide ici écrase ce qui était en place.
      if (!written.current.has(key)) {
        await SAVE_FNS[key](dataToSave, user.id, workspaceId, analysis.allow_overwrite === true);
        written.current.add(key);
      }
      for (const qk of QUERY_KEYS[key]) queryClient.invalidateQueries({ queryKey: [qk] });
      await markValidated(key);
      clearToReview(key);
      toast.success("Section sauvegardée ✓");
      logEvent("section_validated");
      if (validated.size === 6) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);
      }
      goNext();
    } catch (e) {
      console.error("Save error:", e);
      toast.error(e instanceof Error ? e.message : "Erreur lors de la sauvegarde");
    } finally {
      savingRef.current = false;
      setSavingSection(null);
    }
  }, [user?.id, workspaceId, analysis, editedOffers, editedCharter, validated.size, queryClient, preFilledSections, logEvent, clearToReview, goNext, markValidated]);

  /* « Je valide tout » : le raccourci pour qui fait confiance à l'analyse.
     On enregistre section par section (les save* écrivent dans 7 tables
     différentes) et on NE dit jamais « tout est validé » si l'une d'elles a
     échoué — on ramène alors la carte fautive à l'écran. Une section vide est
     marquée validée sans écriture : les save* sortent tôt sur données nulles. */
  const handleValidateAll = useCallback(async () => {
    if (!user?.id || savingRef.current) return;
    savingRef.current = true;
    setValidatingAll(true);
    const failed: SectionKey[] = [];
    const reasons: string[] = [];
    try {
      for (const sec of SECTIONS) {
        if (validated.has(sec.key)) continue;
        const dataToSave = sec.key === "offers" ? { ...analysis.offers, offers: editedOffers }
          : sec.key === "charter" ? editedCharter
          : analysis[sec.key];
        try {
          if (!written.current.has(sec.key)) {
            await SAVE_FNS[sec.key](dataToSave, user.id, workspaceId, analysis.allow_overwrite === true);
            written.current.add(sec.key);
          }
          for (const qk of QUERY_KEYS[sec.key]) queryClient.invalidateQueries({ queryKey: [qk] });
          await markValidated(sec.key);
          clearToReview(sec.key);
        } catch (e) {
          console.error("[valider tout]", sec.key, e);
          failed.push(sec.key);
          if (e instanceof Error) reasons.push(e.message);
        }
      }
      logEvent("branding_validate_all", { failed: failed.length });
      if (failed.length > 0) {
        const labels = failed.map((k) => SECTIONS.find((s) => s.key === k)?.title || k).join(", ");
        toast.error(`Je n'ai pas réussi à enregistrer : ${labels}. Reprends ${failed.length > 1 ? "ces cartes" : "cette carte"} une par une. ${reasons[0] || ""}`);
        setIndex(SECTIONS.findIndex((s) => s.key === failed[0]));
      } else {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);
        toast.success("Toute ta fiche est validée ✓");
        setIndex(total);
      }
    } finally {
      savingRef.current = false;
      setValidatingAll(false);
    }
  }, [user?.id, validatingAll, validated, analysis, editedOffers, editedCharter, workspaceId, queryClient, clearToReview, logEvent, total, markValidated]);

  const overallConf = analysis.overall_confidence || "medium";
  const confMessages: Record<string, { emoji: string; text: string }> = {
    high: { emoji: "🎯", text: "Confiance élevée : j'ai trouvé beaucoup d'infos !" },
    medium: { emoji: "👍", text: "Bonne base, mais quelques sections auront besoin de ton aide" },
    low: { emoji: "🌱", text: "Premier jet : j'ai fait avec ce que j'avais. On affine ensemble ?" },
  };
  const confMsg = confMessages[overallConf] || confMessages.medium;

  const allSources = [...new Set([...sourcesUsed, ...sourcesFailed])];
  if (allSources.length === 0 && analysis.sources_used) {
    allSources.push(...(analysis.sources_used || []));
    if (analysis.sources_failed) allSources.push(...analysis.sources_failed);
  }

  const sourceLabels = (analysis.sources_used || sourcesUsed || []).map(s => {
    const m: Record<string, string> = { website: "ton site", instagram: "ton Instagram", linkedin: "ton LinkedIn", documents: "tes documents" };
    return m[s] || s;
  });
  const subtitleSources = sourceLabels.length > 0 ? sourceLabels.join(", ") : "tes liens";

  const hasPreFilled = preFilledSections && preFilledSections.size > 0;

  return (
    <div className="pb-40 md:pb-24">
      {showConfetti && <Confetti />}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
          <h1 className="font-display text-3xl sm:text-4xl text-foreground" style={{ fontWeight: 400 }}>
            Voici ce que j'ai compris de ton projet
          </h1>
          {/* Même raccourci qu'en bas de page, remonté ici : une utilisatrice
              qui ne scrolle pas jusqu'à la barre sticky doit quand même le voir. */}
          {!allDone && (
            <button
              onClick={handleValidateAll}
              disabled={validatingAll || !!savingSection}
              className="inline-flex items-center justify-center gap-1.5 bg-primary text-white rounded-pill px-4 py-2 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 shrink-0 self-start"
            >
              {validatingAll ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle2 className="h-4 w-4" />}
              Je valide tout
            </button>
          )}
        </div>
        <p className="font-mono-ui text-sm text-muted-foreground mb-4 leading-relaxed">
          {sourceLabels.length > 0 ? `J’ai analysé ${subtitleSources}.` : 'Voici les informations à relire.'} Une carte par morceau de ta marque : tu valides, ou tu mets de côté pour y revenir.
        </p>

        {hasPreFilled && (
          <p className="font-mono-ui text-sm text-success bg-success-bg border border-success/30 rounded-[12px] px-3 py-2 mb-3">
            ✅ Tes informations existantes sont conservées. Les suggestions attendent ta validation.
          </p>
        )}

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-sm mb-3">
          <span>{confMsg.emoji}</span>
          <span className="text-foreground">{confMsg.text}</span>
        </div>

        {allSources.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {allSources.map((s) => (
              <SourceTag key={s} name={s} ok={sourcesUsed.includes(s) || (analysis.sources_used || []).includes(s)} />
            ))}
          </div>
        )}

        {/* Instagram bio fallback */}
        {instagramFailed && (
          <div className="mt-4 bg-warning-bg border border-warning/30 rounded-[16px] p-4">
            <div className="flex items-start gap-2 mb-2">
              <Instagram className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <p className="text-sm text-warning">
                Je n'ai pas réussi à accéder à ton Instagram (c'est fréquent, Instagram bloque les analyses automatiques). Tu peux m'aider en copiant-collant ta bio ici.
              </p>
            </div>
            {!showIgBioInput ? (
              <button onClick={() => setShowIgBioInput(true)} className="text-sm font-semibold text-primary-text hover:underline">
                Coller ma bio Instagram →
              </button>
            ) : (
              <div className="space-y-2 mt-2">
                <Textarea
                  value={igBio}
                  onChange={(e) => setIgBio(e.target.value)}
                  placeholder="Colle ta bio Instagram ici..."
                  className="text-sm min-h-[80px]"
                />
                <Button
                  size="sm"
                  disabled={!igBio.trim()}
                  onClick={() => onReanalyzeWithBio?.(igBio.trim())}
                  className="bg-primary hover:bg-bordeaux text-white text-sm"
                >
                  Réanalyser avec ma bio
                </Button>
              </div>
            )}
          </div>
        )}
      </motion.div>

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
              onComplete={async () => {
                if (savingRef.current) return;
                savingRef.current = true;
                try {
                  written.current.add(coachingSection);
                  await markValidated(coachingSection);
                setRefinedSections((prev) => new Set(prev).add(coachingSection));
                for (const qk of QUERY_KEYS[coachingSection]) queryClient.invalidateQueries({ queryKey: [qk] });
                clearToReview(coachingSection);
                setCoachingSection(null);
                toast.success("Section affinée et sauvegardée ✓");
                logEvent("section_validated");
                if (validated.size === 6) { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 4000); }
                goNext();
                } catch { toast.error("La section est enregistrée, mais sa relecture n’a pas pu être confirmée. Réessaie."); }
                finally { savingRef.current = false; }
              }}
              onBack={() => setCoachingSection(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Carrousel : une carte par section */}
      {!coachingSection && !finished && (() => {
        const sec = SECTIONS[index];
        const conf = getConfidence(analysis[sec.key]);
        const isPreFilled = preFilledSections?.has(sec.key) ?? false;
        const isValidated = validated.has(sec.key);
        const isMarked = toReview.has(sec.key);
        const hasData = sectionHasData(sec.key, analysis);
        const isLow = conf === "low" && !hasData;
        const isSaving = savingSection === sec.key;
        const isRefined = refinedSections.has(sec.key);
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
                {!isValidated && !isPreFilled && <ConfidenceBadge level={conf} />}
              </div>

              <div className="px-5 sm:px-6 py-5 sm:py-6">
                {isPreFilled && !isRefined ? (
                  <>
                    <p className="text-sm text-muted-foreground mb-3 bg-info-bg border border-info/20 rounded-[12px] px-3 py-2">
                      Tu avais déjà commencé cette section. Voici ce que l'analyse a trouvé en plus — je <strong>complète seulement les champs vides</strong>, sans toucher à ce que tu as écrit.
                    </p>
                    <div className="mb-5">{sectionBody}</div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button onClick={() => handleValidate(sec.key)} disabled={isSaving} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-5 py-2 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50">
                        {isSaving ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle2 className="h-4 w-4" />}
                        Compléter les champs vides ✓
                      </button>
                      <button onClick={() => handleKeepAsIs(sec.key)} disabled={isSaving} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-success text-success rounded-[12px] px-5 py-2 text-sm font-semibold hover:bg-success-bg transition-all disabled:opacity-50">
                        <CheckCircle2 className="h-4 w-4" /> Garder tel quel
                      </button>
                      <button onClick={() => setCoachingSection(sec.key)} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-primary text-primary rounded-[12px] px-5 py-2 text-sm font-semibold hover:bg-rose-pale transition-all">
                        <Sparkles className="h-4 w-4" /> On affine ensemble →
                      </button>
                    </div>
                  </>
                ) : isLow ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground mb-4">Je n'ai pas assez d'éléments pour cette section. On la remplit ensemble ?</p>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center">
                      <button onClick={() => setCoachingSection(sec.key)} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-6 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg">
                        <Sparkles className="h-4 w-4" /> On la remplit ensemble →
                      </button>
                      <button onClick={() => handleToReview(sec.key)} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-border text-muted-foreground rounded-[12px] px-5 py-2 text-sm font-semibold hover:border-warning hover:text-warning transition-all">
                        Plus tard
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-5">{sectionBody}</div>
                    {isValidated ? (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                        <p className="text-sm text-success font-medium flex-1">✅ Cette carte est enregistrée.</p>
                        <button onClick={() => setCoachingSection(sec.key)} className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary-text hover:underline">
                          <Sparkles className="h-4 w-4" /> L'affiner quand même
                        </button>
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
                          <button onClick={() => setCoachingSection(sec.key)} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-primary text-primary rounded-[12px] px-5 py-2 text-sm font-semibold hover:bg-rose-pale transition-all">
                            <Sparkles className="h-4 w-4" /> On affine ensemble →
                          </button>
                        </div>
                        {conf === "low" && (
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
      })()}

      {/* Carte de fin : ce qui est enregistré, et ce qui attend encore une réponse */}
      {!coachingSection && finished && (() => {
        const pending = SECTIONS.filter((s) => !validated.has(s.key));
        const done = pending.length === 0;
        return (
          <div className="bg-card rounded-[20px] shadow-card border border-border p-6 sm:p-8 text-center animate-in fade-in duration-300">
            <div className="text-3xl mb-2">{done ? "🎉" : "📝"}</div>
            <h2 className="font-display text-2xl text-foreground mb-2" style={{ fontWeight: 400 }}>
              {done ? "Ta relecture est terminée" : "Il reste des cartes sans réponse"}
            </h2>
            <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto leading-relaxed">
              {done
                ? "Tes choix sont enregistrés. Les informations manquantes restent à compléter quand tu en as besoin depuis Mon identité."
                : `${pending.length} carte${pending.length > 1 ? "s attendent" : " attend"} encore ta réponse. Reprends-${pending.length > 1 ? "les" : "la"} une par une, ou valide tout d'un coup si l'analyse te convient.`}
            </p>

            {!done && (
              <div className="flex flex-wrap justify-center gap-2 mb-5">
                {pending.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => goTo(SECTIONS.findIndex((x) => x.key === s.key))}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:border-primary transition-colors"
                  >
                    <span>{s.emoji}</span> {s.title}
                    {toReview.has(s.key) && <span className="text-2xs text-warning font-medium">à revoir</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Fin de relecture pendant l'onboarding : la marque est posée, on
                propose ses photos (site / Instagram connecté) avant le 1er contenu. */}
            {done && mandatory && <BrandPhotosPicker placement="brand_review" className="mb-5" onReadyChange={setProductPhotosReady} />}

            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              {done ? (
                <button onClick={completeReview} disabled={!canComplete} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-6 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:cursor-wait">
                  {mandatory && !productPhotosReady ? "Un instant…" : mandatory ? "Créer mon premier contenu →" : "Voir mon identité complète →"}
                </button>
              ) : (
                <>
                  <button onClick={handleValidateAll} disabled={validatingAll || !!savingSection} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-6 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50">
                    {validatingAll ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle2 className="h-4 w-4" />}
                    Valider tout le reste
                  </button>
                  <button onClick={() => goTo(SECTIONS.findIndex((s) => !validated.has(s.key)))} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-primary text-primary rounded-[12px] px-5 py-2.5 text-sm font-semibold hover:bg-rose-pale transition-all">
                    Reprendre les cartes
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Sticky bottom bar — décalée au-dessus de la barre d'onglets mobile (bottom-14 = 3.5rem) */}
      <div className="fixed bottom-14 md:bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-sm border-t border-border px-4 py-3">
        <div className="mx-auto max-w-[900px] flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="text-sm font-semibold text-foreground">
                {allDone ? "Fiche validée ! 🎉" : `${validatedCount}/${total} validées`}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                {allDone ? (
                  <button onClick={completeReview} disabled={waitingForPhotos} className="text-sm font-semibold text-primary-text hover:underline whitespace-nowrap disabled:opacity-50 disabled:cursor-wait">
                    {mandatory ? finished ? waitingForPhotos ? "Un instant…" : "Créer mon premier contenu →" : "Voir la suite →" : "Voir mon identité complète →"}
                  </button>
                ) : (
                  <>
                    {/* Le raccourci demandé : tout valider d'un coup, sans parcourir les 7 cartes. */}
                    <button
                      onClick={handleValidateAll}
                      disabled={validatingAll || !!savingSection}
                      className="inline-flex items-center gap-1.5 bg-primary text-white rounded-pill px-4 py-1.5 text-xs font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 whitespace-nowrap"
                    >
                      {validatingAll ? <Spinner className="h-3.5 w-3.5 text-white" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Je valide tout
                    </button>
                    {/* Hors onboarding, la porte de sortie reste : sans elle, la
                        review remplacerait /branding à chaque visite. Dans
                        l'onboarding (mandatory), valider sa fiche EST l'étape. */}
                    {!mandatory && (
                      <button
                        onClick={() => onDone(false)}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 whitespace-nowrap"
                        title="Les cartes validées sont gardées ; tu pourras finir le reste depuis Mon identité."
                      >
                        Finir plus tard
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="h-[6px] rounded-full bg-rose-pale overflow-hidden">
              {/* `initial` explicite : sans lui, framer-motion part de la largeur
                  mesurée (= 100 %) et la barre s'affiche PLEINE une fraction de
                  seconde alors que rien n'est validé. */}
              <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, #ffa7c6, #fb3d80)" }} initial={{ width: 0 }} animate={{ width: `${(validatedCount / total) * 100}%` }} transition={{ type: "spring", stiffness: 60, damping: 20 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
