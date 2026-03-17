import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useState, useRef, useEffect, useCallback } from "react";

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
            <p className="text-[10px] font-mono text-muted-foreground text-center">
              Slide {vs.slide_number}
            </p>
            <div
              className="relative overflow-hidden rounded-lg border border-border w-full"
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CarouselResult({ result, visualSlides, onSlidesUpdate }: Props) {
  const rawSlides: SlideData[] = result?.slides || result?.carousel?.slides || [];
  const rawCaption: CaptionData = result?.caption || result?.carousel?.caption || {};
  const qualityCheck = result?.quality_check || result?.carousel?.quality_check;
  const publishingTip = result?.publishing_tip || result?.carousel?.publishing_tip;
  const chosenAngle = result?.chosen_angle || result?.carousel?.chosen_angle;

  // Local editable copies
  const [slides, setSlides] = useState<SlideData[]>(rawSlides);
  const [caption, setCaption] = useState<CaptionData>(rawCaption);

  const prevSlidesSignature = useRef(JSON.stringify(rawSlides.map(s => s.slide_number)));

  // Sync only when slides are structurally different (new generation)
  useEffect(() => {
    const newSignature = JSON.stringify(rawSlides.map(s => s.slide_number));
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
      onSlidesUpdate?.(updated, caption);
      return updated;
    });
  }, [caption, onSlidesUpdate]);

  const updateCaption = useCallback((field: "hook" | "body" | "cta", value: string) => {
    setCaption(prev => {
      const updated = { ...prev, [field]: value };
      onSlidesUpdate?.(slides, updated);
      return updated;
    });
  }, [slides, onSlidesUpdate]);

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
      <p className="text-[11px] text-muted-foreground italic text-center">
        ✏️ Clique sur un texte pour le modifier directement
      </p>

      {/* Slides */}
      <div className="space-y-2">
        {slides.map((slide, i) => (
          <Card key={i} className="border-border">
            <CardContent className="p-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="font-mono text-[10px]">
                  Slide {slide.slide_number || i + 1}
                </Badge>
                {slide.role && (
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-mono">
                    {slide.role}
                  </Badge>
                )}
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
                  <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[10px]">
                    📊 Schéma : {(slide.visual_schema as any).type}
                  </Badge>
                </div>
              )}
              {slide.visual_suggestion && !slide.visual_schema && (
                <p className="text-xs italic text-muted-foreground">🎨 {slide.visual_suggestion}</p>
              )}
            </CardContent>
          </Card>
        ))}
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
              <p className="text-xs text-muted-foreground">{Array.isArray(caption.hashtags) ? caption.hashtags.join(" ") : caption.hashtags}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quality check */}
      {score != null && (
        <div className="flex items-center gap-2">
          <Badge className={score >= 80 ? "bg-green-100 text-green-700 border-green-300" : "bg-amber-100 text-amber-700 border-amber-300"}>
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

      {/* Visual preview */}
      {visualSlides && visualSlides.length > 0 && (
        <VisualSlidesGrid slides={visualSlides} />
      )}
    </div>
  );
}
