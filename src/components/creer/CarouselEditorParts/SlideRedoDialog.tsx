// « Refaire cette slide » (chantier AA, 18/10/2026 ; maquette de plan-editeur-design.md) :
// bouton de la ligne d'outils et fenêtre de l'app. Un seul champ libre (choix C6),
// des exemples qui tournent tant qu'il est vide, 1 crédit annoncé sur le bouton,
// puis « Ta version » / « Nouvelle version » côte à côte (choix C8 : une fenêtre
// ponctuelle, pas de panneau de conversation).
// Éditeur facile (20/11/2026, maquette validée par Laetitia) : en mode simple, la
// demande est écrite dans le panneau, sous les textes de la slide (`inline`) : des
// idées à toucher, le champ, le bouton avec son crédit, puis les deux versions au
// même endroit. Plus de fenêtre, plus de baguette sans nom sur téléphone. Le mode
// « Plus d'outils » gardait le bouton et la fenêtre.
// Panneau à onglets (26/11/2026) : un seul panneau, donc la demande est toujours dans le
// panneau ; le bouton de la ligne d'outils et sa fenêtre sont retirés.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { SlideThumb } from "@/components/creer/CarouselEditorParts/PanelBits";
import type { CarouselDocument, EditorSlide } from "@/lib/carousel-editor";
import { isPhotoOnlySlide, PHOTO_ONLY_REASON, type SlideRedoApi } from "@/components/creer/CarouselEditorParts/slide-redo";
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
  /** La demande s'écrit dans le panneau (`SLIDE_ASK_SLOT`), sans fenêtre. Panneau à onglets (26/11/2026) : c'est le cas partout ; sur ordinateur le bloc est collé en bas du panneau, en version courte (champ d'une ligne ; les idées et la place pour écrire apparaissent quand on clique dedans). */
  inline?: boolean;
}) {
  const redo = useSlideRedo({ api, raw, getDocument, onKeep });
  const { state } = redo;
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [hint, setHint] = useState(false);
  // Sur ordinateur le champ tient sur une ligne : l'exemple long y était coupé au bord.
  const isMobile = useIsMobile();
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
  const doc = getDocument();
  const index = doc.slides.findIndex((s) => s.id === redo.slideId);
  const target = index >= 0 ? doc.slides[index] : slide;
  const locked = !!slide.locked;
  const photoOnly = isPhotoOnlySlide(slide);
  const pending = state.status === "loading" || state.status === "result";
  const blocked = (locked || photoOnly) && !pending;
  const reason = locked ? "Déverrouille la slide pour la refaire" : PHOTO_ONLY_REASON;
  if (inline) {
    if (!slot) return null;
    const ask = () => {
      if (redo.instruction.trim().length < 2) return setHint(true);
      redo.submit();
    };
    return createPortal(
      <section aria-label="Demander un changement à l'IA" data-testid="slide-ask" className="group space-y-2 rounded-xl border-[1.5px] border-primary bg-card p-3 md:rounded-none md:border-0 md:bg-transparent md:p-0">
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
            <div className="flex flex-wrap gap-1.5 md:hidden md:group-focus-within:flex" role="group" aria-label="Idées de changement">
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
              placeholder={isMobile ? "Ou écris ta demande : « ajoute l'exemple du café »" : "Ex. « ajoute l'exemple du café »"}
              className="w-full rounded-xl border bg-background p-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary md:h-10 md:resize-none md:overflow-hidden md:whitespace-nowrap md:py-2 md:focus:h-20 md:focus:overflow-auto md:focus:whitespace-normal"
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
  return null;
}
