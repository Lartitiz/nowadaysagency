// « Modifier le texte » d'un carrousel (chantier X, choix C2 de Laetitia, 18/10/2026).
// Le texte de toutes les slides en liste, comme pour un post. Chaque correction est
// posée dans le visuel par le même chemin que le champ « Texte » du panneau
// (patchElement) : le design et les retouches restent, et tout part en une seule
// étape d'Annuler.
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { captionFromText, captionText, getEditorElements, patchElement, type CarouselDocument, type EditorSlide } from "@/lib/carousel-editor";
import { useCarouselTextListRequest } from "@/lib/carousel-editor-shown";
import { formatSlideRole } from "@/lib/slide-roles";

const FIELD_LABELS: Record<string, string> = { title: "Titre", body: "Texte", overlay: "Texte sur la photo", cta: "Bouton" };
const CAPTION_KEY = "caption";

/** Textes modifiables d'une slide, dans l'ordre de lecture. */
export function slideTexts(slide: EditorSlide) {
  return getEditorElements(slide.html).filter((e) => e.kind === "text" && e.text.trim());
}

/** Applique les textes corrigés au document (null : rien n'a changé). */
export function applyTextList(document: CarouselDocument, drafts: Record<string, string>): CarouselDocument | null {
  let changed = false;
  const slides = document.slides.map((slide) => {
    let next = slide;
    for (const el of slideTexts(slide)) {
      const text = drafts[`${slide.id}:${el.id}`];
      if (text === undefined || text === el.text) continue;
      next = patchElement(next, el.id, { text });
    }
    if (next !== slide) changed = true;
    return next;
  });
  const caption = drafts[CAPTION_KEY];
  const captionChanged = caption !== undefined && caption !== captionText(document.caption);
  if (!changed && !captionChanged) return null;
  return { ...document, slides, caption: captionChanged ? captionFromText(caption) : document.caption };
}

export function TextListDialog({ document, commit, getDocument }: {
  document: CarouselDocument;
  commit: (next: CarouselDocument) => void;
  /** Document affiché maintenant (pour que « Annuler » du message ne défasse rien d'autre). */
  getDocument: () => CarouselDocument;
}) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useCarouselTextListRequest(useCallback(() => { setDrafts({}); setOpen(true); }, []));
  const value = (key: string, fallback: string) => drafts[key] ?? fallback;
  const set = (key: string, text: string) => setDrafts((d) => ({ ...d, [key]: text }));
  const save = () => {
    const next = applyTextList(document, drafts);
    setOpen(false);
    if (!next) return;
    commit(next);
    toast.success("Texte mis à jour dans tes slides", {
      description: "Le design et tes retouches n’ont pas bougé.",
      action: { label: "Annuler", onClick: () => { if (getDocument() === next) commit(document); } },
    });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col gap-3 p-4 sm:p-6" data-testid="carousel-text-list">
        <DialogHeader>
          <DialogTitle>Modifier le texte</DialogTitle>
          <DialogDescription>Tout le texte de ton carrousel. Chaque correction va dans sa slide, sans toucher au design.</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
          {document.slides.map((slide, i) => {
            const texts = slideTexts(slide);
            return (
              <section key={slide.id} aria-label={`Slide ${i + 1}`} className="space-y-1.5 rounded-lg border p-3">
                <p className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  Slide {i + 1}
                  {slide.data.role && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-2xs font-medium text-primary">{formatSlideRole(slide.data.role)}</span>}
                  {slide.locked && <span className="text-2xs font-normal text-muted-foreground">🔒 Verrouillée : déverrouille-la pour changer son texte.</span>}
                </p>
                {texts.length === 0 && <p className="text-2xs text-muted-foreground">Pas de texte sur cette slide.</p>}
                {texts.map((el) => (
                  <label key={el.id} className="block space-y-0.5">
                    <span className="text-2xs text-muted-foreground">{FIELD_LABELS[el.field || ""] || "Autre texte"}</span>
                    <Textarea
                      aria-label={`Slide ${i + 1} : ${(FIELD_LABELS[el.field || ""] || "autre texte").toLowerCase()}`}
                      className="min-h-0 text-sm"
                      rows={Math.min(5, Math.max(1, Math.ceil(el.text.length / 60)))}
                      disabled={slide.locked}
                      value={value(`${slide.id}:${el.id}`, el.text)}
                      onChange={(e) => set(`${slide.id}:${el.id}`, e.target.value)}
                    />
                  </label>
                ))}
              </section>
            );
          })}
          <label className="block space-y-1 rounded-lg border p-3">
            <span className="text-xs font-semibold">Légende de la publication</span>
            <Textarea
              aria-label="Légende de la publication"
              className="text-sm"
              rows={4}
              value={value(CAPTION_KEY, captionText(document.caption))}
              onChange={(e) => set(CAPTION_KEY, e.target.value)}
            />
          </label>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => setOpen(false)}>Fermer sans changer</Button>
          <Button onClick={save}>Enregistrer le texte</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
