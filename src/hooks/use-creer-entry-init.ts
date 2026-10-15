// Arrivée sur /creer depuis ailleurs (calendrier, boîte à idées, coach, actu,
// « Créer à partir de ce brief », 1er contenu) : lecture du navigate state et des
// paramètres d'URL, saut d'étapes, puis retrait des paramètres à usage unique.
// Sorti à l'identique de CreerUnifie.tsx (lot J, docs/robustesse/gros-fichiers.md, fiche 1).
// Appelé par la page à l'endroit exact où vivait l'effet. `handleFormatNext`
// (useFormatNext) n'existe que plus bas dans la page : elle passe un relais
// `(...args) => handleFormatNext(...args)`, lu seulement quand l'effet tourne.
// ⚠️ Renommer une clé du state casse le lien calendrier → /creer en silence :
// src/test/calendar-creer-contract.test.ts lit ce fichier et la page.
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { normalizeObjective } from "@/lib/content-structures";
import { stripFontImportLeakFromSlides } from "@/lib/strip-font-import-leak";
import { consumeFreshStart } from "@/lib/creation-navigation";
import { multiSubjectChoicePending } from "../../supabase/functions/_shared/multi-subject";
import { FORMAT_MAP, SUPPORTED_FORMATS, ONE_SHOT_PARAMS } from "@/features/creer/creer-step";

export function useCreerEntryInit({
  conflictPending, brandReviewChecking, brandReviewPending, flowShownRef, ps, hasUrlParams, location, locState, searchParams, setSearchParams, paramSujet, paramObjectif, paramFormat, paramIdeaId, paramAngle, paramCanal, paramAuto, paramMode, saveFlowState, handleFormatNext, setIdeaText, setObjective, setExistingCalendarContent, setNewsjackingContext, setSelectedFormat, setCarouselSubMode, setResult, setEditingIdeaId, setEditorialAngle, setIsLinkedInCarousel, setVisualSlides, setPinterestPinHtml, setPhotoBriefOverlayHtml, setSavedId, setStep, setQuestions, setAnswers, setBriefPrefillAnswers, setIncomingBriefId,
}: Record<string, any> & {
  flowShownRef: MutableRefObject<boolean>;
  searchParams: URLSearchParams;
  handleFormatNext: (format: string, angle?: string, options?: { overrideSubject?: string }) => unknown;
}) {
  // Pre-fill from URL/state & auto-advance (only when URL params are present)
  const initDone = useRef(false);
  // L'effet dépend de location.search : notre propre nettoyage des paramètres
  // (plus bas) le re-déclenche une fois. Ce drapeau absorbe cet écho — sans
  // lui, le re-run voyait sujet/format vides et pouvait renvoyer à l'étape
  // idée alors que l'init venait de lancer le parcours.
  const justStrippedRef = useRef(false);
  useEffect(() => {
    // Conflit brouillon vs nouvelle demande : on ne touche à rien tant que
    // l'utilisatrice n'a pas tranché (voir DraftConflictDialog).
    if (conflictPending || ((brandReviewChecking || brandReviewPending) && !flowShownRef.current)) return;
    if (justStrippedRef.current) {
      justStrippedRef.current = false;
      return;
    }
    // If we restored from persistence, skip URL-based init
    if (ps && !hasUrlParams) {
      initDone.current = true;
      return;
    }
    // This entry is consumed once. Background brand refetches and remaining
    // channel params must never replay it after location.state was cleared.
    if (initDone.current) return;
    initDone.current = true;

    const subject = paramSujet || locState.sujet || locState.subject || "";
    const obj = paramObjectif || locState.objectif || locState.objective || null;

    if (subject) setIdeaText(subject);
    else if (locState.fromCalendar && typeof locState.theme === "string" && locState.theme.trim()) setIdeaText(locState.theme.trim()); // atelier du calendrier : sujet dans `theme`
    if (obj) setObjective(normalizeObjective(obj) ?? obj);
    if (locState?.existingContent) setExistingCalendarContent(locState.existingContent);

    // Newsjacking context arriving from "Créer depuis cette actu" (IdeaDetailSheet)
    // — preserves the actu block so the generated content stays a real newsjacking.
    if (locState?.context && typeof locState.context === "string" && locState.context.trim()) {
      setNewsjackingContext(locState.context.trim().slice(0, 3800));
    }

    const fmtRaw = paramFormat || locState?.format;
    const paramCarouselSubMode = searchParams.get("carouselSubMode") as "text" | "photo" | "mix" | "pure_photo" | "user_slides" | null;

    const fmtMapped = fmtRaw ? (FORMAT_MAP[fmtRaw] || fmtRaw) : null;
    const fmt = fmtMapped && SUPPORTED_FORMATS.has(fmtMapped) ? fmtMapped : null;

    if (fmt) setSelectedFormat(fmt);
    if (paramCarouselSubMode) setCarouselSubMode(paramCarouselSubMode);

    // Saved output is an editing request, never an automatic regeneration.
    if (locState.resumeIdea?.raw && locState.resumeIdea?.format) {
      const { raw, format } = locState.resumeIdea;
      setSelectedFormat(format);
      setResult({ type: format, raw });
      setEditingIdeaId(locState.ideaId || paramIdeaId || null);
      setEditorialAngle(locState.angle || paramAngle || null);
      setIsLinkedInCarousel(format === "carousel" && paramCanal === "linkedin");
      setCarouselSubMode(raw.user_slides === true ? "user_slides" : ["text", "photo", "mix", "pure_photo", "user_slides"].includes(raw.carousel_type) ? raw.carousel_type : null);
      setVisualSlides(stripFontImportLeakFromSlides(Array.isArray(raw.visual_html) ? raw.visual_html : []));
      setPinterestPinHtml(raw.pin_html || null);
      setPhotoBriefOverlayHtml(raw.overlay_html || null);
      setSavedId(null);
      setStep("result");
    }
    // « Créer à partir de ce brief » (boîte à idées) : on réutilise les questions
    // et réponses déjà saisies et on atterrit directement sur l'étape questions
    // pré-remplie, au lieu de tout recommencer.
    if (!locState.resumeIdea?.raw && locState?.fromBrief && Array.isArray(locState.questions) && locState.questions.length > 0) {
      const briefAngle = locState?.angle || paramAngle || undefined;
      const restoredAnswers = locState.answers && typeof locState.answers === "object"
        ? locState.answers as Record<string, string>
        : {};
      const restoredBriefId = typeof locState.briefId === "string" ? locState.briefId : null;
      if (briefAngle) setEditorialAngle(briefAngle);
      setQuestions(locState.questions as any);
      setAnswers(restoredAnswers);
      setBriefPrefillAnswers(restoredAnswers);
      setIncomingBriefId(restoredBriefId);
      setStep("questions");
      // Persister la reprise AVANT d'effacer son ordre d'initialisation : un
      // refresh immédiat retrouve les questions, les réponses et le même brief.
      saveFlowState({
        step: "questions",
        ideaText: subject,
        objective: obj,
        selectedFormat: fmt,
        editorialAngle: briefAngle || null,
        questions: locState.questions as any,
        answers: restoredAnswers,
        incomingBriefId: restoredBriefId,
      });
      // Les paramètres sujet/format rejoueraient handleFormatNext au refresh et
      // déclencheraient une nouvelle génération de questions.
      window.history.replaceState({}, "", location.pathname);
      return;
    }

    if (!locState.resumeIdea?.raw && fmt && subject.trim()) {
      // Build enriched subject directly from locState to avoid race condition
      // (setExistingCalendarContent is async and not yet available)
      const calendarContent = locState?.existingContent || null;
      const enrichedSubject = calendarContent
        ? subject + "\n\n[Contenu existant à approfondir]\n" + calendarContent
        : subject;
      const calendarAngle = locState?.angle || paramAngle || undefined;
      if (calendarAngle) setEditorialAngle(calendarAngle);

      // Si un angle est déjà choisi (depuis la boîte à idées ou le calendrier),
      // on saute l'étape format. Le premier carrousel texte saute aussi les
      // questions ; les autres entrées gardent leurs choix de format et photos.
      // Stories ou reel sur un texte à plusieurs sujets (calendrier, idée, lien) :
      // l'écran format demande d'abord quoi en faire (09/10/2026). Un contenu du
      // calendrier à plusieurs sujets passe dans le texte de l'idée, pour être choisi.
      const multiInContent = !!calendarContent && multiSubjectChoicePending(calendarContent) && !multiSubjectChoicePending(subject);
      if ((fmt === "story" || fmt === "reel") && (multiInContent || multiSubjectChoicePending(subject))) {
        if (multiInContent) {
          setIdeaText(`${subject.trim()}\n\n${calendarContent.trim()}`);
          setExistingCalendarContent(null);
        }
        setStep("format");
      } else if (paramAuto && fmt === "carousel" && paramCarouselSubMode === "text") {
        setStep("result");
      } else if ((fmt === "carousel" || fmt === "post") && !locState?.fromCalendar && !paramAngle && !paramAuto) {
        setStep("format");
      } else {
        // Autres raccourcis préremplis : le flux normal prépare les questions.
        handleFormatNext(fmt, calendarAngle, { overrideSubject: enrichedSubject });
      }
    } else if (!locState.resumeIdea?.raw && locState?.fromCalendar && subject) {
      // Calendar fallback path (already handled above with FORMAT_MAP)
      if (locState.angle) setEditorialAngle(locState.angle);
      setStep("format");
    } else if (!locState.resumeIdea?.raw && subject.trim()) {
      // Sujet présent mais format absent ou non-supporté (ex : coach « Surprise »
      // qui renvoie recommended_format="auto") → ouvrir l'étape format pour
      // choisir canal + format, au lieu de retomber sur l'étape « idée ».
      setStep("format");
    } else if (!locState.resumeIdea?.raw && fmt) {
      setStep("format");
    } else if (!locState.resumeIdea?.raw && !ps) {
      setStep("idea");
    }
    // Clean up location.state after reading it to prevent re-init on tab switch
    if (location.state) {
      window.history.replaceState({}, '', window.location.href);
    }

    // ── Paramètres « à usage unique » : consommés = retirés ──
    // ?sujet/?format/?auto/… sont des ORDRES de démarrage, pas un état d'URL.
    // Laissés collés, chaque remontage de la page (reload, onglet recyclé,
    // retour de veille) REJOUAIT toute cette init : questions régénérées,
    // résultat effacé par resetGenerator, retour au récap — vécu le 13/08 sur
    // le 1er contenu post-onboarding (« ça a sauté, revenu au début »). La
    // reprise après reload passe désormais par la persistance du flux
    // (use-flow-persistence), comme pour ?new=1. ?canal/?from/?mode restent :
    // ils ne déclenchent pas d'auto-avancée destructrice.
    // Exception : en ?mode=transform, ?format pré-coche le sous-mode Recycler
    // (CreerTransformTab le lit dans l'URL) — on ne touche à rien sur ce chemin.
    if (paramMode !== "transform" && ONE_SHOT_PARAMS.some((k) => searchParams.has(k))) {
      const cleaned = consumeFreshStart(searchParams);
      ONE_SHOT_PARAMS.forEach((k) => cleaned.delete(k));
      justStrippedRef.current = true;
      setSearchParams(cleaned, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, conflictPending, brandReviewChecking, brandReviewPending]);

  return { initDone, justStrippedRef };
}
