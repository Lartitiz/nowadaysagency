import { useEffect, useRef } from "react";
import { useKeepContentConfirm } from "@/components/creer/KeepContentDialog";
import { contentAlreadyKept, saveContentCopyToIdeas, type KeepContentReason } from "@/features/creer/keep-content";
import { nextIdeaLink } from "@/hooks/use-subject-baseline";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { ideaStartPlan } from "@/features/creer/idea-pick";
import type { IdeaToCreate } from "@/lib/idea-create-link";

export { default as KeepContentDialog } from "@/components/creer/KeepContentDialog";

type SlideLength = "auto" | "short" | "classic" | "long";

/**
 * Chantier J (18/10/2026) : branchement de « Tu as déjà un contenu » dans
 * /creer (KeepContentDialog.tsx). La page appelle :
 *   - `guardSubject(sujet, idée, suite)` avant « De quoi veux-tu parler ? » ;
 *   - `ask("format", suite)` avant « Suivant » de l'écran Format ;
 *   - `ask("linkedin_carousel", suite)` avant « Créer le carrousel ».
 * « Annuler » ramène au contenu, avec le format sous lequel il a été écrit.
 * Pendant une génération (`busy`), fermer l'onglet demande confirmation.
 */
export function useCreerKeepContent(p: {
  disabled: boolean;
  busy: boolean;
  step: string;
  result: any;
  editContent: string;
  visualSlides: { slide_number: number; html: string }[];
  ideaText: string;
  previousSubject: string;
  editingIdeaId: string | null;
  savedSignature?: string | null;
  currentSignature: string;
  userId?: string;
  workspaceId: string;
  selectedFormat: string | null;
  isLinkedInCarousel: boolean;
  carouselSubMode: string | null;
  slideLength: SlideLength;
  objective: string | null;
  setEditingIdeaId: (id: string | null) => void;
  forgetSavedVersion: () => void;
  setSelectedFormat: (f: string | null) => void;
  setIsLinkedInCarousel: (v: boolean) => void;
  setCarouselSubMode: (m: any) => void;
  setSlideLength: (l: SlideLength) => void;
  setStep: (s: any) => void;
}) {
  useUnsavedChanges(p.busy);
  // Format sous lequel le contenu affiché a été écrit (l'écran Format le change en direct).
  const written = useRef<{ selectedFormat: string | null; isLinkedInCarousel: boolean; carouselSubMode: string | null; slideLength: SlideLength } | null>(null);
  useEffect(() => {
    if (p.step === "result" && p.result) written.current = { selectedFormat: p.selectedFormat, isLinkedInCarousel: p.isLinkedInCarousel, carouselSubMode: p.carouselSubMode, slideLength: p.slideLength };
  }, [p.step, p.result, p.selectedFormat, p.isLinkedInCarousel, p.carouselSubMode, p.slideLength]);

  const alreadyKept = () => contentAlreadyKept({ raw: p.result?.raw, editingIdeaId: p.editingIdeaId, savedSignature: p.savedSignature, currentSignature: p.currentSignature });

  const keep = useKeepContentConfirm({
    hasContent: () => !p.disabled && !!p.result?.raw,
    alreadyKept,
    saveCopy: () => saveContentCopyToIdeas({
      userId: p.userId, workspaceId: p.workspaceId, subject: p.ideaText,
      format: written.current?.selectedFormat ?? p.selectedFormat, isLinkedInCarousel: written.current?.isLinkedInCarousel ?? p.isLinkedInCarousel,
      objective: p.objective, raw: p.result?.raw, visualSlides: p.visualSlides, draftText: p.editContent,
    }),
    // Déjà rangé : la suite ne doit plus réécrire dans cette fiche.
    detach: () => { p.setEditingIdeaId(null); p.forgetSavedVersion(); },
    onCancel: (reason: KeepContentReason) => {
      const w = written.current;
      if (reason === "format" && w) {
        p.setSelectedFormat(w.selectedFormat);
        p.setIsLinkedInCarousel(w.isLinkedInCarousel);
        p.setCarouselSubMode(w.carouselSubMode);
        p.setSlideLength(w.slideLength);
      }
      p.setStep("result");
    },
  });

  /** Nouveau sujet ou autre idée après un contenu écrit : même règle que `nextIdeaLink`. */
  const guardSubject = (subject: string, ideaId: string | undefined, run: () => void) => {
    const { freshContent } = nextIdeaLink({
      pickedIdeaId: ideaId, editingIdeaId: p.editingIdeaId, subject, previousSubject: p.previousSubject,
      hasContent: !!p.result || !!p.editContent || p.visualSlides.length > 0,
    });
    // Une fiche déjà à jour reste intacte dans Mes idées : rien à demander.
    if (!freshContent || alreadyKept()) run();
    else keep.ask("subject", run);
  };

  /** Idée choisie sur l'écran « De quoi veux-tu parler ? » (chantier S). */
  const guardIdeaPick = (idea: IdeaToCreate, pick: (idea: IdeaToCreate) => void) =>
    guardSubject(ideaStartPlan(idea).subject, idea.id, () => pick(idea));

  return { ask: keep.ask, guardSubject, guardIdeaPick, dialog: keep.dialog };
}
