import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Maximize2, ArrowUp, ArrowDown, Trash2, X } from "lucide-react";
import { formatSlideRole } from "@/lib/slide-roles";
import {
  replaceSlideText,
  removeSlideCta,
  hasSlideCta,
  getSlideCtaText,
} from "@/lib/carousel-html-edit";

/** En dessous, un carrousel n'a plus de sens : on bloque la suppression. */
const MIN_SLIDES = 3;

interface SlideData {
  slide_number: number;
  role?: string;
  title?: string;
  body?: string;
  visual_suggestion?: string;
  visual_schema?: Record<string, any> | null;
}

interface CaptionData {
  hook?: string;
  body?: string;
  cta?: string;
  hashtags?: string | string[];
}

interface Props {
  result: any;
  visualSlides?: { slide_number: number; html: string }[];
  onSlidesUpdate?: (slides: SlideData[], caption: CaptionData) => void;
  /** Remonte les visuels patchés quand une édition de texte est répercutée dans le HTML. */
  onVisualSlidesUpdate?: (slides: { slide_number: number; html: string }[]) => void;
}

/** Inline editable text block */
function InlineEditable({
  value,
  onChange,
  className = "",
  placeholder = "Ajouter du texte…",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  // Sync external value only when not editing
  useEffect(() => {
    if (!focused && ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value;
    }
  }, [value, focused]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className={`outline-none rounded-md transition-all cursor-text ${
        focused
          ? "ring-1 ring-primary/40 bg-primary/5 px-2 py-1 -mx-2 -my-1"
          : "hover:bg-muted/50 px-2 py-1 -mx-2 -my-1"
      } ${className}`}
      style={{ whiteSpace: "pre-wrap", minHeight: "1.5em" }}
      data-placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const text = ref.current?.innerText?.trim() || "";
        if (text !== value) onChange(text);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function VisualSlidesGrid({ slides }: { slides: { slide_number: number; html: string }[] }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(0);
  const [zoomed, setZoomed] = useState<{ slide_number: number; html: string } | null>(null);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const firstChild = el.children[0] as HTMLElement | undefined;
      if (firstChild) {
        setColWidth(firstChild.getBoundingClientRect().width);
      } else {
        const gap = 12;
        setColWidth((el.getBoundingClientRect().width - gap) / 2);
      }
    };
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [slides.length]);

  const scale = colWidth > 0 ? colWidth / 1080 : 0;

  return (
    <div className="space-y-3 pt-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Aperçu des visuels ({slides.length} slides)
      </p>
      <div ref={gridRef} className="grid grid-cols-2 gap-3">
        {slides.map((vs) => (
          <div key={vs.slide_number} className="space-y-1">
            <p className="text-2xs font-mono text-muted-foreground text-center">
              Slide {vs.slide_number}
            </p>
            <button
              type="button"
              onClick={() => setZoomed(vs)}
              title="Agrandir la slide"
              aria-label={`Agrandir la slide ${vs.slide_number}`}
              className="group relative overflow-hidden rounded-lg border border-border w-full cursor-zoom-in p-0"
              style={{ aspectRatio: "1080 / 1350" }}
            >
              {scale > 0 && (
                <iframe
                  srcDoc={vs.html}
                  title={`Slide ${vs.slide_number}`}
                  sandbox="allow-same-origin allow-scripts"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "1080px",
                    height: "1350px",
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                    border: "none",
                    pointerEvents: "none",
                  }}
                />
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 transition-colors group-hover:bg-foreground/40">
                <Maximize2 className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
            </button>
          </div>
        ))}
      </div>
      <SlideLightbox
        html={zoomed?.html || ""}
        title={zoomed ? `Slide ${zoomed.slide_number}` : ""}
        open={zoomed != null}
        onOpenChange={(o) => !o && setZoomed(null)}
      />
    </div>
  );
}

/** Le HTML 1080×1350 mis à l'échelle pour remplir son conteneur (mesuré au ResizeObserver). */
function ScaledSlideFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = width > 0 ? width / 1080 : 0;

  return (
    <div ref={ref} className="absolute inset-0">
      {scale > 0 && (
        <iframe
          srcDoc={html}
          title={title}
          sandbox="allow-same-origin"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "1080px",
            height: "1350px",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            border: "none",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

/** Modale plein écran affichant une slide en grand (au clic sur son aperçu). */
export function SlideLightbox({
  html,
  title,
  open,
  onOpenChange,
}: {
  html: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-auto border-none bg-transparent p-0 shadow-none">
        <div
          className="relative overflow-hidden rounded-2xl border border-border bg-white shadow-strong"
          style={{ height: "min(85vh, 90vw * 1350 / 1080)", aspectRatio: "1080 / 1350" }}
        >
          <ScaledSlideFrame html={html} title={title} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Aperçu cliquable d'une slide : clic → agrandissement en modale. */
export function SlideFramePreview({ html, title, width = 180 }: { html: string; title: string; width?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Agrandir la slide"
        aria-label="Agrandir la slide"
        className="group relative overflow-hidden rounded-lg border border-border shrink-0 cursor-zoom-in p-0"
        style={{ width, aspectRatio: "1080 / 1350" }}
      >
        <ScaledSlideFrame html={html} title={title} />
        <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 transition-colors group-hover:bg-foreground/40">
          <Maximize2 className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
      </button>
      <SlideLightbox html={html} title={title} open={open} onOpenChange={setOpen} />
    </>
  );
}

export default function CarouselResult({ result, visualSlides, onSlidesUpdate, onVisualSlidesUpdate }: Props) {
  const rawSlides: SlideData[] = result?.slides || result?.carousel?.slides || [];
  const rawCaption: CaptionData = result?.caption || result?.carousel?.caption || {};
  const qualityCheck = result?.quality_check || result?.carousel?.quality_check;
  const publishingTip = result?.publishing_tip || result?.carousel?.publishing_tip;
  const chosenAngle = result?.chosen_angle || result?.carousel?.chosen_angle;

  // Local editable copies
  const [slides, setSlides] = useState<SlideData[]>(rawSlides);
  const [caption, setCaption] = useState<CaptionData>(rawCaption);

  const prevSlidesSignature = useRef(JSON.stringify(rawSlides.map(s => s.slide_number)));

  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  const captionRef = useRef(caption);
  captionRef.current = caption;

  // Sync only when slides are structurally different (new generation)
  useEffect(() => {
    const newSignature = JSON.stringify(rawSlides.map(s => s.slide_number));
    if (newSignature !== prevSlidesSignature.current) {
      setSlides(rawSlides);
      setCaption(rawCaption);
      prevSlidesSignature.current = newSignature;
    }
  }, [result]);

  // Édition live : le changement de texte est répercuté chirurgicalement dans
  // le HTML du visuel (ancre data-slide-text, repli par correspondance de
  // texte pour les visuels générés avant le contrat). Échec de localisation =
  // visuel inchangé, jamais bloquant.
  const visualSlidesRef = useRef(visualSlides);
  visualSlidesRef.current = visualSlides;

  const updateSlide = useCallback((index: number, field: "title" | "body", value: string) => {
    setSlides(prev => {
      const oldText = (prev[index]?.[field] as string) || "";
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      onSlidesUpdate?.(updated, captionRef.current);

      const visuals = visualSlidesRef.current;
      if (visuals?.length && onVisualSlidesUpdate) {
        const slideNumber = updated[index].slide_number || index + 1;
        const vi = visuals.findIndex((v) => v.slide_number === slideNumber);
        if (vi >= 0) {
          const patched = replaceSlideText(visuals[vi].html, field, oldText, value);
          if (patched) {
            const next = [...visuals];
            next[vi] = { ...next[vi], html: patched };
            onVisualSlidesUpdate(next);
          }
        }
      }
      return updated;
    });
  }, [onSlidesUpdate, onVisualSlidesUpdate]);

  const updateCaption = useCallback((field: "hook" | "body" | "cta", value: string) => {
    setCaption(prev => {
      const updated = { ...prev, [field]: value };
      onSlidesUpdate?.(slidesRef.current, updated);
      return updated;
    });
  }, [onSlidesUpdate]);

  // Réordonne/filtre les visuels rendus pour rester appariés aux slides après
  // une suppression ou un déplacement : `orderedOrigNums` = les slide_number
  // d'AVANT l'opération, dans le nouvel ordre ; on renumérote 1..n comme les slides.
  const remapVisuals = useCallback((orderedOrigNums: number[]) => {
    const visuals = visualSlidesRef.current;
    if (!visuals?.length || !onVisualSlidesUpdate) return;
    const vmap = new Map(visuals.map((v) => [v.slide_number, v]));
    const next = orderedOrigNums
      .map((num, i) => {
        const v = vmap.get(num);
        return v ? { ...v, slide_number: i + 1 } : null;
      })
      .filter(Boolean) as { slide_number: number; html: string }[];
    onVisualSlidesUpdate(next);
  }, [onVisualSlidesUpdate]);

  const deleteSlide = useCallback((index: number) => {
    setSlides(prev => {
      if (prev.length <= MIN_SLIDES) return prev;
      const survivors = prev.filter((_, i) => i !== index);
      const origNums = survivors.map((s, i) => s.slide_number ?? i + 1);
      const next = survivors.map((s, i) => ({ ...s, slide_number: i + 1 }));
      onSlidesUpdate?.(next, captionRef.current);
      remapVisuals(origNums);
      return next;
    });
  }, [onSlidesUpdate, remapVisuals]);

  const moveSlide = useCallback((index: number, direction: -1 | 1) => {
    setSlides(prev => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const reordered = [...prev];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      const origNums = reordered.map((s, i) => s.slide_number ?? i + 1);
      const next = reordered.map((s, i) => ({ ...s, slide_number: i + 1 }));
      onSlidesUpdate?.(next, captionRef.current);
      remapVisuals(origNums);
      return next;
    });
  }, [onSlidesUpdate, remapVisuals]);

  // Édition / retrait du bouton d'appel à l'action (CTA) : n'existe que dans le
  // HTML du visuel (data-slide-cta), pas dans les slides structurées.
  const patchCtaVisual = useCallback((slideNumber: number, html: string) => {
    const visuals = visualSlidesRef.current;
    if (!visuals?.length || !onVisualSlidesUpdate) return;
    const vi = visuals.findIndex((v) => v.slide_number === slideNumber);
    if (vi < 0) return;
    const next = [...visuals];
    next[vi] = { ...next[vi], html };
    onVisualSlidesUpdate(next);
  }, [onVisualSlidesUpdate]);

  const updateCta = useCallback((slideNumber: number, currentHtml: string, value: string) => {
    const oldText = getSlideCtaText(currentHtml) || "";
    if (value === oldText) return;
    const patched = replaceSlideText(currentHtml, "cta", oldText, value);
    if (patched) patchCtaVisual(slideNumber, patched);
  }, [patchCtaVisual]);

  const removeCta = useCallback((slideNumber: number, currentHtml: string) => {
    const patched = removeSlideCta(currentHtml);
    if (patched) patchCtaVisual(slideNumber, patched);
  }, [patchCtaVisual]);

  // Confirmation de suppression : index de la slide à supprimer (null = fermé).
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);

  // Aperçu par slide (vis-à-vis) : visuel apparié par slide_number
  const visualBySlide = useMemo(
    () => new Map((visualSlides || []).map((v) => [v.slide_number, v])),
    [visualSlides],
  );
  const hasSidePreviews = slides.some((s, i) => visualBySlide.has(s.slide_number || i + 1));

  const fullText = [
    caption?.hook,
    caption?.body,
    caption?.cta,
    ...slides.map((s) => [s.title, s.body].filter(Boolean).join("\n")),
  ]
    .filter(Boolean)
    .join("\n\n");

  const [checkedText, setCheckedText] = useState(fullText);

  useEffect(() => {
    setCheckedText(fullText);
  }, [fullText]);

  const score = qualityCheck?.score ?? qualityCheck?.overall_score;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Chosen angle */}
      {chosenAngle && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Angle éditorial</p>
          <p className="text-sm font-bold text-foreground">{chosenAngle.title || chosenAngle.label}</p>
          {chosenAngle.description && (
            <p className="text-xs text-muted-foreground">{chosenAngle.description}</p>
          )}
        </div>
      )}

      {/* Editable hint */}
      <p className="text-2xs text-muted-foreground italic text-center">
        ✏️ Clique sur un texte pour le modifier directement
      </p>

      {/* Slides — texte éditable à gauche, aperçu du visuel à droite (comme les stories) */}
      <div className="space-y-2">
        {slides.map((slide, i) => {
          const slideNumber = slide.slide_number || i + 1;
          const visual = visualBySlide.get(slideNumber);
          const ctaText = visual && hasSlideCta(visual.html) ? getSlideCtaText(visual.html) : null;
          const canDelete = slides.length > MIN_SLIDES;
          return (
            <Card key={i} className="border-border">
              <CardContent className="p-3">
                <div className="flex gap-3 items-start">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="font-mono text-2xs">
                        Slide {slideNumber}
                      </Badge>
                      {slide.role && (
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-2xs font-mono">
                          {formatSlideRole(slide.role)}
                        </Badge>
                      )}
                      <div className="ml-auto flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={() => moveSlide(i, -1)}
                          disabled={i === 0}
                          aria-label="Monter la slide"
                          title="Monter la slide"
                        >
                          <ArrowUp size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={() => moveSlide(i, 1)}
                          disabled={i === slides.length - 1}
                          aria-label="Descendre la slide"
                          title="Descendre la slide"
                        >
                          <ArrowDown size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive disabled:opacity-40"
                          onClick={() => setDeleteIdx(i)}
                          disabled={!canDelete}
                          aria-label="Supprimer la slide"
                          title={canDelete ? "Supprimer la slide" : `Minimum ${MIN_SLIDES} slides`}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                    {slide.title != null && (
                      <InlineEditable
                        value={slide.title || ""}
                        onChange={(v) => updateSlide(i, "title", v)}
                        className="text-sm font-bold text-foreground"
                        placeholder="Titre de la slide…"
                      />
                    )}
                    {slide.body != null && (
                      <InlineEditable
                        value={slide.body || ""}
                        onChange={(v) => updateSlide(i, "body", v)}
                        className="text-sm text-foreground leading-relaxed"
                        placeholder="Contenu de la slide…"
                      />
                    )}
                    {ctaText != null && (
                      <div className="flex items-center gap-1.5 rounded-md bg-muted/40 border border-border px-2 py-1">
                        <span className="text-2xs font-mono uppercase tracking-wide text-muted-foreground shrink-0">
                          Bouton
                        </span>
                        <InlineEditable
                          value={ctaText}
                          onChange={(v) => updateCta(slideNumber, visual!.html, v)}
                          className="flex-1 text-sm text-primary font-medium"
                          placeholder="Texte du bouton…"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeCta(slideNumber, visual!.html)}
                          aria-label="Retirer le bouton d'appel à l'action"
                          title="Retirer le bouton"
                        >
                          <X size={13} />
                        </Button>
                      </div>
                    )}
                    {slide.visual_schema && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-2xs">
                          📊 Schéma : {(slide.visual_schema as any).type}
                        </Badge>
                      </div>
                    )}
                    {slide.visual_suggestion && !slide.visual_schema && (
                      <p className="text-xs italic text-muted-foreground">🎨 {slide.visual_suggestion}</p>
                    )}
                  </div>
                  {visual && (
                    <SlideFramePreview
                      html={visual.html}
                      title={`Aperçu slide ${slide.slide_number || i + 1}`}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Caption */}
      {(caption.hook || caption.body || caption.cta) && (
        <Card className="border-border">
          <CardContent className="p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Caption</p>
            {caption.hook != null && (
              <InlineEditable
                value={caption.hook || ""}
                onChange={(v) => updateCaption("hook", v)}
                className="text-sm font-bold text-foreground"
                placeholder="Accroche…"
              />
            )}
            {caption.body != null && (
              <InlineEditable
                value={caption.body || ""}
                onChange={(v) => updateCaption("body", v)}
                className="text-sm text-foreground leading-relaxed"
                placeholder="Corps de la caption…"
              />
            )}
            {caption.cta != null && (
              <InlineEditable
                value={caption.cta || ""}
                onChange={(v) => updateCaption("cta", v)}
                className="text-sm text-primary font-medium"
                placeholder="Call to action…"
              />
            )}
            {caption.hashtags && (
              <p className="text-xs text-muted-foreground">{Array.isArray(caption.hashtags) ? caption.hashtags.map((t: string) => (t.startsWith("#") ? t : `#${t}`)).join(" ") : caption.hashtags}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quality check */}
      {score != null && (
        <div className="flex items-center gap-2">
          <Badge className={score >= 80 ? "bg-success-bg text-success border-success/30" : "bg-warning-bg text-warning border-warning/30"}>
            Score : {score}/100
          </Badge>
          {qualityCheck?.comment && <span className="text-xs text-muted-foreground">{qualityCheck.comment}</span>}
        </div>
      )}

      {/* Publishing tip */}
      {publishingTip && (
        <div className="rounded-lg bg-muted/50 border border-border p-2.5">
          <p className="text-xs text-muted-foreground">💡 {publishingTip}</p>
        </div>
      )}

      {/* Red flags */}
      <RedFlagsChecker content={checkedText} onFix={setCheckedText} />

      <AiGeneratedMention />

      {/* Grille de secours : uniquement si aucun visuel n'a pu être apparié
          aux slides (numéros incohérents) — sinon le vis-à-vis suffit. */}
      {visualSlides && visualSlides.length > 0 && !hasSidePreviews && (
        <VisualSlidesGrid slides={visualSlides} />
      )}

      <AlertDialog open={deleteIdx !== null} onOpenChange={(o) => !o && setDeleteIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette slide ?</AlertDialogTitle>
            <AlertDialogDescription>
              La slide et son visuel seront retirés du carrousel. Les autres slides sont renumérotées automatiquement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteIdx !== null) deleteSlide(deleteIdx);
                setDeleteIdx(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
