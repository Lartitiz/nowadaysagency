// « Refaire cette slide » (chantier AA, 18/10/2026 ; maquette de plan-editeur-design.md) :
// bouton de la ligne d'outils et fenêtre de l'app. Un seul champ libre (choix C6),
// des exemples qui tournent tant qu'il est vide, 1 crédit annoncé sur le bouton,
// puis « Ta version » / « Nouvelle version » côte à côte (choix C8 : une fenêtre
// ponctuelle, pas de panneau de conversation).
// Éditeur facile (20/11/2026, maquette validée par Laetitia) : en mode simple, la
// demande est écrite dans le panneau, sous les textes de la slide (`inline`) : des
// idées à toucher, le champ, le bouton avec son crédit, puis les deux versions au
// même endroit. Plus de fenêtre, plus de baguette sans nom sur téléphone. Le mode
// « Plus d'outils » garde le bouton et la fenêtre. C'est le même état dans les deux
// cas (une demande en cours survit au changement de mode).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SlideThumb } from "@/components/creer/CarouselEditorParts/PanelBits";
import type { CarouselDocument, EditorSlide } from "@/lib/carousel-editor";
import { isPhotoOnlySlide, PHOTO_ONLY_REASON, SLIDE_REDO_EXAMPLES, type SlideRedoApi } from "@/components/creer/CarouselEditorParts/slide-redo";
import { useSlideRedo } from "@/components/creer/CarouselEditorParts/use-slide-redo";

/** Emplacement du panneau simple où s'écrit la demande à l'IA. */
export const SLIDE_ASK_SLOT = "slide-ask-slot";
/** Idées à toucher : elles remplissent le champ, la cliente peut compléter. */
export const SLIDE_ASK_IDEAS = ["Plus court", "Plus percutant", "Ajoute un exemple", "Une autre disposition"];

export function SlideRedo({ api, raw, slide, getDocument, onKeep, inline = false }: {
  api: SlideRedoApi;
  raw: any;
  slide: EditorSlide;
  getDocument: () => CarouselDocument;
  onKeep: (next: EditorSlide) => void;
  /** La demande s'écrit dans le panneau (`SLIDE_ASK_SLOT`), sans fenêtre. Panneau à onglets (26/11/2026) : c'est le cas partout ; sur ordinateur le bloc est collé en bas du panneau, en version courte (idées sur une ligne, champ d'une ligne). */
  inline?: boolean;
}) {
  const redo = useSlideRedo({ api, raw, getDocument, onKeep });
  const { state } = redo;
  const [example, setExample] = useState(0);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [hint, setHint] = useState(false);
  useEffect(() => {
    setSlot(inline ? window.document.getElementById(SLIDE_ASK_SLOT) : null);
    if (!inline) redo.setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inline]);
  // Dans le panneau, la demande suit la slide ouverte (sauf demande en cours ou version à choisir).
  const settled = state.status === "idle" || state.status === "error";
  useEffect(() => {
    if (inline && settled && redo.slideId !== slide.id) redo.start(slide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inline, slide.id, settled]);
  useEffect(() => {
    if (inline || !redo.open || redo.instruction) return;
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
  if (inline) {
    if (!slot) return null;
    const ask = () => {
      if (redo.instruction.trim().length < 2) return setHint(true);
      redo.submit();
    };
    return createPortal(
      <section aria-label="Demander un changement à l'IA" data-testid="slide-ask" className="space-y-2 rounded-xl border-[1.5px] border-primary bg-card p-3 md:rounded-none md:border-0 md:bg-transparent md:p-0">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-primary">
          <Sparkles size={15} aria-hidden="true" />
          {state.status === "result" ? `Slide ${index + 1} : voici la nouvelle version` : "Demander un changement à l'IA"}
        </h3>
        {state.status === "result" ? (
          <>
            <p className="text-xs text-muted-foreground">Ta demande : « {state.instruction} »</p>
            <div className="grid grid-cols-2 gap-2">
              <figure className="min-w-0">
                <figcaption className="mb-1 text-2xs font-semibold text-muted-foreground">Ta version</figcaption>
                <SlideThumb html={target.html} width={128} />
              </figure>
              <figure className="min-w-0">
                <figcaption className="mb-1 text-2xs font-semibold text-primary">Nouvelle version</figcaption>
                <SlideThumb html={state.next.html} width={128} />
              </figure>
            </div>
            {state.notices.map((n) => <p key={n} className="text-xs text-muted-foreground">{n}</p>)}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={redo.keep}>Garder la nouvelle</Button>
              <Button size="sm" variant="outline" onClick={redo.discard}>Garder la mienne</Button>
            </div>
          </>
        ) : state.status === "loading" ? (
          <div role="status" className="flex items-center gap-2 text-sm">
            <Loader2 size={16} className="shrink-0 animate-spin text-primary" />
            <p>L'Assistant Com' refait la slide {index + 1}… <span className="block text-xs text-muted-foreground">Tu peux continuer sur les autres slides : la nouvelle version s'affichera ici.</span></p>
          </div>
        ) : blocked ? (
          <p className="text-xs text-muted-foreground">{reason}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 md:flex-nowrap md:overflow-x-auto md:pb-0.5 md:[scrollbar-width:none]" role="group" aria-label="Idées de changement">
              {SLIDE_ASK_IDEAS.map((idea) => (
                <button key={idea} type="button" aria-pressed={redo.instruction === idea} onClick={() => { redo.setInstruction(idea); setHint(false); }}
                  className="shrink-0 rounded-full border bg-muted px-2.5 py-1 text-xs aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:font-medium aria-pressed:text-primary">
                  {idea}
                </button>
              ))}
            </div>
            <textarea
              value={redo.instruction}
              onChange={(e) => { redo.setInstruction(e.target.value); setHint(false); }}
              maxLength={500}
              rows={2}
              aria-label="Dis ce que tu veux changer sur cette slide"
              placeholder="Ou écris ta demande : « ajoute l'exemple du café »"
              className="w-full rounded-xl border bg-background p-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary md:h-10 md:resize-none md:py-2"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(); }}
            />
            {hint && <p role="alert" className="text-xs text-error">Choisis une idée ou écris ta demande.</p>}
            {state.status === "error" && <p role="alert" className="text-sm text-error">{state.message}</p>}
            <Button className="w-full gap-1.5" onClick={ask} data-testid="slide-ask-submit">
              <Wand2 size={15} /> Refaire cette slide · 1 crédit
            </Button>
            <p className="text-center text-2xs text-muted-foreground md:hidden">Les autres slides ne bougent pas.{api.remainingLabel ? ` ${api.remainingLabel}` : ""}</p>
          </>
        )}
      </section>,
      slot,
    );
  }
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
                    <p className="font-medium">L'Assistant Com' refait ta slide…</p>
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
                    aria-label="Dis ce que tu veux changer sur cette slide"
                    placeholder={`Dis ce que tu veux changer… ex. « ${SLIDE_REDO_EXAMPLES[example]} »`}
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
