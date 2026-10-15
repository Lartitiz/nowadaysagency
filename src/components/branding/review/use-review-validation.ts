// État et actions de la relecture : cartes validées, « à revoir », écritures
// déjà faites (`written` : jamais deux fois la même section, même si
// `onProgress` échoue), anti double-clic (`savingRef`), confettis, « Garder tel
// quel », « C'est bon », « Je valide tout » et fin du coaching. Sorti de
// BrandingReview.tsx à l'identique (fiche 14 de docs/robustesse/gros-fichiers.md,
// lot 4) ; seule la fin du coaching reçoit la section en paramètre au lieu de la
// lire dans `coachingSection`.
import { useState, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { posthog } from "@/lib/posthog-lazy";
import { SAVE_FNS, QUERY_KEYS } from "@/lib/branding-review-save";
import { SECTIONS, type AnalysisResult, type OfferItem, type SectionKey } from "./types";

interface ReviewValidationArgs {
  analysis: AnalysisResult;
  onProgress?: (sections: string[]) => Promise<void>;
  preFilledSections?: Set<string>;
  editedOffers: OfferItem[];
  editedCharter: AnalysisResult["charter"];
  goNext: () => void;
  setIndex: (index: number) => void;
  total: number;
  setCoachingSection: (section: SectionKey | null) => void;
}

export function useReviewValidation({ analysis, onProgress, preFilledSections, editedOffers, editedCharter, goNext, setIndex, total, setCoachingSection }: ReviewValidationArgs) {
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
  const [refinedSections, setRefinedSections] = useState<Set<SectionKey>>(new Set());
  const [toReview, setToReview] = useState<Set<SectionKey>>(new Set());
  const [validatingAll, setValidatingAll] = useState(false);

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

  // Fin de « On affine ensemble » : BrandingCoachingFlow a déjà écrit la section.
  const completeCoaching = async (section: SectionKey) => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      written.current.add(section);
      await markValidated(section);
    setRefinedSections((prev) => new Set(prev).add(section));
    for (const qk of QUERY_KEYS[section]) queryClient.invalidateQueries({ queryKey: [qk] });
    clearToReview(section);
    setCoachingSection(null);
    toast.success("Section affinée et sauvegardée ✓");
    logEvent("section_validated");
    if (validated.size === 6) { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 4000); }
    goNext();
    } catch { toast.error("La section est enregistrée, mais sa relecture n’a pas pu être confirmée. Réessaie."); }
    finally { savingRef.current = false; }
  };

  return {
    validated, savingSection, showConfetti, refinedSections, toReview, validatingAll,
    // Au moins une section réécrite (validée ou affinée) : relu à chaque rendu,
    // donc à jour dès que `validated` change.
    wroteSomething: written.current.size > 0,
    handleKeepAsIs, handleToReview, handleValidate, handleValidateAll, completeCoaching,
  };
}
