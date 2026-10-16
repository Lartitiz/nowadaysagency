import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import RedFlagsChecker, { fixRedFlags } from "@/components/RedFlagsChecker";
import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { formatSlideRole } from "@/lib/slide-roles";

/** En dessous, un carrousel n'a plus de sens : on bloque la suppression. */
const MIN_SLIDES = 2;

interface SlideData {
  slide_number: number;
  role?: string;
  title?: string;
  body?: string;
  visual_suggestion?: string;
  visual_schema?: Record<string, any> | null;
  /** Libellé du bouton d'appel à l'action de la slide (même champ que l'éditeur visuel et les carrousels photo / mixte). */
  cta_label?: string | null;
}

interface CaptionData {
  hook?: string;
  body?: string;
  cta?: string;
  hashtags?: string | string[];
}

interface Props {
  result: any;
  onSlidesUpdate?: (slides: SlideData[], caption: CaptionData) => void;
  onStaleChange?: (stale: boolean) => void;
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

// Les types de schéma sont des clés techniques (« before_after ») : jamais
// affichées telles quelles à l'utilisatrice.
const SCHEMA_LABELS: Record<string, string> = {
  checklist: "liste à cocher", before_after: "avant / après", comparison: "comparaison",
  stats: "chiffres clés", timeline: "frise", equation: "équation", matrix_2x2: "matrice 2 × 2",
  pyramid: "pyramide", flowchart: "étapes", scale: "échelle",
};
const schemaLabel = (type: unknown) =>
  SCHEMA_LABELS[String(type)] ?? String(type ?? "").replace(/_/g, " ");

// Écran du carrousel texte AVANT la mise en forme visuelle : dès que des
// visuels existent, /creer ouvre l'éditeur visuel à la place (CreerStepResult).
// La partie qui répercutait les retouches dans les visuels (aperçus, bouton
// d'appel à l'action, alerte « périmé ») ne servait donc jamais : retirée le
// 16/10/2026, comme celle du carrousel photo.
export default function CarouselResult({ result, onSlidesUpdate, onStaleChange }: Props) {
  const rawSlides: SlideData[] = result?.slides || result?.carousel?.slides || [];
  const rawCaption: CaptionData = result?.caption || result?.carousel?.caption || {};
  const qualityCheck = result?.quality_check || result?.carousel?.quality_check;
  const publishingTip = result?.publishing_tip || result?.carousel?.publishing_tip;
  const chosenAngle = result?.chosen_angle || result?.carousel?.chosen_angle;

  // Local editable copies
  const [slides, setSlides] = useState<SlideData[]>(rawSlides);
  const [caption, setCaption] = useState<CaptionData>(rawCaption);

  const prevSlidesSignature = useRef(JSON.stringify([rawSlides, rawCaption]));
  // Aucun visuel ici : rien ne peut être périmé.
  useEffect(() => { onStaleChange?.(false); }, [onStaleChange]);

  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  const captionRef = useRef(caption);
  captionRef.current = caption;

  // Sync only when slides are structurally different (new generation)
  useEffect(() => {
    const newSignature = JSON.stringify([rawSlides, rawCaption]);
    if (newSignature !== prevSlidesSignature.current) {
      setSlides(rawSlides);
      setCaption(rawCaption);
      prevSlidesSignature.current = newSignature;
    }
  }, [result]);

  const updateSlide = useCallback((index: number, field: "title" | "body", value: string) => {
    setSlides(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      onSlidesUpdate?.(updated, captionRef.current);
      return updated;
    });
  }, [onSlidesUpdate]);

  const updateCaption = useCallback((field: "hook" | "body" | "cta", value: string) => {
    setCaption(prev => {
      const updated = { ...prev, [field]: value };
      onSlidesUpdate?.(slidesRef.current, updated);
      return updated;
    });
  }, [onSlidesUpdate]);

  // Hashtags éditables : la saisie libre (« #a #b » ou « a, b ») est normalisée
  // en tableau (sans « # », dédoublonné). Avant, les hashtags s'affichaient en
  // texte mort, non modifiables — seul écart d'édition avec le carrousel photo.
  const updateHashtags = useCallback((value: string) => {
    const tags = Array.from(
      new Set(
        value
          .split(/[\s,]+/)
          .map((t) => t.trim().replace(/^#+/, ""))
          .filter(Boolean),
      ),
    );
    setCaption(prev => {
      const updated = { ...prev, hashtags: tags };
      onSlidesUpdate?.(slidesRef.current, updated);
      return updated;
    });
  }, [onSlidesUpdate]);

  const deleteSlide = useCallback((index: number) => {
    setSlides(prev => {
      if (prev.length <= MIN_SLIDES) return prev;
      const next = prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, slide_number: i + 1 }));
      onSlidesUpdate?.(next, captionRef.current);
      return next;
    });
  }, [onSlidesUpdate]);

  const moveSlide = useCallback((index: number, direction: -1 | 1) => {
    setSlides(prev => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const reordered = [...prev];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      const next = reordered.map((s, i) => ({ ...s, slide_number: i + 1 }));
      onSlidesUpdate?.(next, captionRef.current);
      return next;
    });
  }, [onSlidesUpdate]);

  // Confirmation de suppression : index de la slide à supprimer (null = fermé).
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);

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

      {/* Slides — texte éditable */}
      <div className="space-y-2">
        {slides.map((slide, i) => {
          const slideNumber = slide.slide_number || i + 1;
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
                    {slide.visual_schema && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-2xs">
                          📊 Schéma : {schemaLabel((slide.visual_schema as any).type)}
                        </Badge>
                      </div>
                    )}
                    {slide.visual_suggestion && !slide.visual_schema && (
                      <p className="text-xs italic text-muted-foreground">🎨 {slide.visual_suggestion}</p>
                    )}
                  </div>
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
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Légende</p>
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
                placeholder="Corps de la légende…"
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
            <InlineEditable
              value={
                Array.isArray(caption.hashtags)
                  ? caption.hashtags.map((t: string) => (t.startsWith("#") ? t : `#${t}`)).join(" ")
                  : (caption.hashtags || "")
              }
              onChange={updateHashtags}
              className="text-xs text-muted-foreground"
              placeholder="Hashtags (ex. #artisanat #savonnerie)…"
            />
          </CardContent>
        </Card>
      )}

      {/* Quality check */}
      {score != null && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={score >= 80 ? "bg-success-bg text-success border-success/30" : "bg-warning-bg text-warning border-warning/30"}>
            Contrôle rédactionnel : {score}/100
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
      <RedFlagsChecker content={checkedText} onFix={() => {
        const nextSlides = slides.map(s => ({ ...s, title: s.title == null ? s.title : fixRedFlags(s.title), body: s.body == null ? s.body : fixRedFlags(s.body) }));
        const nextCaption = { ...caption, hook: fixRedFlags(caption.hook || ""), body: fixRedFlags(caption.body || ""), cta: fixRedFlags(caption.cta || "") };
        setSlides(nextSlides);setCaption(nextCaption);onSlidesUpdate?.(nextSlides,nextCaption);
      }} />

      <AiGeneratedMention />

      <AlertDialog open={deleteIdx !== null} onOpenChange={(o) => !o && setDeleteIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette slide ?</AlertDialogTitle>
            <AlertDialogDescription>
              La slide sera retirée du carrousel. Les autres slides sont renumérotées automatiquement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder la slide</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteIdx !== null) deleteSlide(deleteIdx);
                setDeleteIdx(null);
              }}
            >
              Supprimer la slide
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
