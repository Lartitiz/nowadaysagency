// « Refaire cette slide » (chantier AA, 18/10/2026 ; maquette de plan-editeur-design.md) :
// bouton de la ligne d'outils et fenêtre de l'app. Un seul champ libre (choix C6),
// des exemples qui tournent tant qu'il est vide, 1 crédit annoncé sur le bouton,
// puis « Ta version » / « Nouvelle version » côte à côte (choix C8 : une fenêtre
// ponctuelle, pas de panneau de conversation).
import { useEffect, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SlideThumb } from "@/components/creer/CarouselEditorParts/PanelBits";
import type { CarouselDocument, EditorSlide } from "@/lib/carousel-editor";
import { isPhotoOnlySlide, PHOTO_ONLY_REASON, SLIDE_REDO_EXAMPLES, type SlideRedoApi } from "@/components/creer/CarouselEditorParts/slide-redo";
import { useSlideRedo } from "@/components/creer/CarouselEditorParts/use-slide-redo";

export function SlideRedo({ api, raw, slide, getDocument, onKeep }: {
  api: SlideRedoApi;
  raw: any;
  slide: EditorSlide;
  getDocument: () => CarouselDocument;
  onKeep: (next: EditorSlide) => void;
}) {
  const redo = useSlideRedo({ api, raw, getDocument, onKeep });
  const { state } = redo;
  const [example, setExample] = useState(0);
  useEffect(() => {
    if (!redo.open || redo.instruction) return;
    const timer = setInterval(() => setExample((i) => (i + 1) % SLIDE_REDO_EXAMPLES.length), 2500);
    return () => clearInterval(timer);
  }, [redo.open, redo.instruction]);
  const doc = getDocument();
  const index = doc.slides.findIndex((s) => s.id === redo.slideId);
  const target = index >= 0 ? doc.slides[index] : slide;
  const locked = !!slide.locked;
  const photoOnly = isPhotoOnlySlide(slide);
  const pending = state.status === "loading" || state.status === "result";
  const blocked = (locked || photoOnly) && !pending;
  const reason = locked ? "Déverrouille la slide pour la refaire" : PHOTO_ONLY_REASON;
  const label = state.status === "result" ? "Voir la nouvelle version" : state.status === "loading" ? "Slide en cours…" : "Refaire cette slide";
  return (
    <>
      <span title={blocked ? reason : undefined}>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-primary/40 px-2 text-primary lg:px-3"
          disabled={blocked}
          aria-label={blocked ? (locked ? "Refaire cette slide (déverrouille la slide pour la refaire)" : `Refaire cette slide (${PHOTO_ONLY_REASON})`) : label}
          onClick={() => redo.start(slide)}
          data-testid="slide-redo-button"
        >
          {state.status === "loading" ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
          <span className="hidden lg:inline">{label}</span>
        </Button>
      </span>
      <Dialog open={redo.open} onOpenChange={redo.setOpen}>
        <DialogContent className="max-w-lg" data-testid="slide-redo-dialog">
          {state.status === "result" ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display font-normal text-primary">Voici la nouvelle version</DialogTitle>
                <DialogDescription>Consigne : « {state.instruction} »</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <figure className="min-w-0">
                  <figcaption className="mb-1 text-xs font-semibold text-muted-foreground">Ta version</figcaption>
                  <SlideThumb html={target.html} width={200} />
                </figure>
                <figure className="min-w-0">
                  <figcaption className="mb-1 text-xs font-semibold text-muted-foreground">Nouvelle version</figcaption>
                  <SlideThumb html={state.next.html} width={200} />
                </figure>
              </div>
              {state.notices.map((n) => <p key={n} className="text-xs text-muted-foreground">{n}</p>)}
              <DialogFooter className="gap-2 sm:justify-start">
                <Button onClick={redo.keep}>Garder la nouvelle</Button>
                <Button variant="outline" onClick={redo.discard}>Garder la mienne</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-display font-normal text-primary">Refaire la slide {index + 1}</DialogTitle>
                <DialogDescription>Les autres slides restent telles quelles.</DialogDescription>
              </DialogHeader>
              {state.status === "loading" ? (
                <div className="flex items-center gap-3">
                  <SlideThumb html={target.html} width={120} />
                  <div role="status" className="space-y-1 text-sm">
                    <p className="font-medium">Claude refait ta slide…</p>
                    <p className="text-xs text-muted-foreground">Tu peux fermer cette fenêtre : la nouvelle version s’affichera ici dès qu’elle est prête.</p>
                  </div>
                </div>
              ) : (
                <>
                  <textarea
                    value={redo.instruction}
                    onChange={(e) => redo.setInstruction(e.target.value)}
                    maxLength={500}
                    rows={3}
                    autoFocus
                    aria-label="Dis à Claude ce que tu veux changer sur cette slide"
                    placeholder={`Dis à Claude ce que tu veux changer… ex. « ${SLIDE_REDO_EXAMPLES[example]} »`}
                    className="w-full rounded-xl border border-primary bg-background p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) redo.submit(); }}
                  />
                  {state.status === "error" && <p role="alert" className="text-sm text-error">{state.message}</p>}
                </>
              )}
              <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-start sm:space-x-0">
                {state.status === "loading" ? (
                  <Button variant="outline" onClick={() => redo.setOpen(false)}>Fermer</Button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={redo.submit} disabled={redo.instruction.trim().length < 2 || !!target.locked}>Refaire cette slide · 1 crédit</Button>
                    <Button variant="outline" onClick={() => redo.setOpen(false)}>Annuler</Button>
                  </div>
                )}
                {api.remainingLabel && <p className="text-xs text-muted-foreground">{api.remainingLabel}</p>}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
