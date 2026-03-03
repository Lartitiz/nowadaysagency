import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw, RotateCcw, CalendarDays, Palette, Download, Loader2 } from "lucide-react";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useState, useRef, useEffect } from "react";

interface Props {
  result: any;
  onCopy: () => void;
  onRegenerate: () => void;
  onReset: () => void;
  onSave?: () => void;
  onCalendar?: () => void;
  onGenerateVisuals?: () => void;
  visualLoading?: boolean;
  visualSlides?: { slide_number: number; html: string }[];
  onExportPptx?: () => void;
}

function VisualSlidesGrid({ slides }: { slides: { slide_number: number; html: string }[] }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.28);

  useEffect(() => {
    const calculate = () => {
      if (!gridRef.current) return;
      const gridWidth = gridRef.current.offsetWidth;
      const gap = 12; // gap-3 = 12px
      const columnWidth = (gridWidth - gap) / 2;
      setScale(columnWidth / 1080);
    };
    calculate();
    window.addEventListener("resize", calculate);
    return () => window.removeEventListener("resize", calculate);
  }, []);

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
              className="relative overflow-hidden rounded-lg border border-border"
              style={{ height: `${Math.round(1350 * scale)}px` }}
            >
              <iframe
                srcDoc={vs.html}
                title={`Slide ${vs.slide_number}`}
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CarouselResult({
  result, onCopy, onRegenerate, onReset, onSave, onCalendar,
  onGenerateVisuals, visualLoading, visualSlides, onExportPptx,
}: Props) {
  const slides = result?.slides || result?.carousel?.slides || [];
  const caption = result?.caption || result?.carousel?.caption || {};
  const qualityCheck = result?.quality_check || result?.carousel?.quality_check;
  const publishingTip = result?.publishing_tip || result?.carousel?.publishing_tip;
  const chosenAngle = result?.chosen_angle || result?.carousel?.chosen_angle;

  // Build full text for RedFlagsChecker
  const fullText = [
    caption?.hook,
    caption?.body,
    caption?.cta,
    ...slides.map((s: any) => [s.title, s.body].filter(Boolean).join("\n")),
  ]
    .filter(Boolean)
    .join("\n\n");

  const [checkedText, setCheckedText] = useState(fullText);

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

      {/* Slides */}
      <div className="space-y-2">
        {slides.map((slide: any, i: number) => (
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
              {slide.title && <p className="text-sm font-bold text-foreground">{slide.title}</p>}
              {slide.body && <p className="text-sm text-foreground leading-relaxed">{slide.body}</p>}
              {slide.visual_suggestion && (
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
            {caption.hook && <p className="text-sm font-bold text-foreground">{caption.hook}</p>}
            {caption.body && <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{caption.body}</p>}
            {caption.cta && <p className="text-sm text-primary font-medium">{caption.cta}</p>}
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

      {/* === ACTIONS : 2 chemins === */}
      {visualSlides && visualSlides.length > 0 ? (
        /* ÉTAT : Visuels générés → CTA principal = Ajouter au calendrier */
        <div className="space-y-3 pt-2">
          {onCalendar && (
            <Button onClick={onCalendar} className="w-full gap-2 h-11 text-sm font-semibold">
              <CalendarDays className="h-4 w-4" /> Ajouter au calendrier
            </Button>
          )}
          <div className="flex items-center justify-center gap-3">
            {onExportPptx && (
              <Button variant="ghost" size="sm" onClick={onExportPptx} className="gap-1.5 text-xs text-muted-foreground">
                <Download className="h-3.5 w-3.5" /> Export PPTX
              </Button>
            )}
            {onGenerateVisuals && (
              <Button variant="ghost" size="sm" onClick={onGenerateVisuals} className="gap-1.5 text-xs text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5" /> Regénérer visuels
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onCopy} className="gap-1.5 text-xs text-muted-foreground">
              <Copy className="h-3.5 w-3.5" /> Copier
            </Button>
          </div>
        </div>
      ) : (
        /* ÉTAT : Pas encore de visuels → 2 CTAs côte à côte */
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            {onGenerateVisuals && (
              <Button
                onClick={onGenerateVisuals}
                disabled={visualLoading}
                className="h-11 gap-2 text-sm font-semibold"
              >
                {visualLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Palette className="h-4 w-4" />
                )}
                {visualLoading ? "Création..." : "Créer les visuels"}
              </Button>
            )}
            {onCalendar && (
              <Button
                variant="outline"
                onClick={onCalendar}
                className="h-11 gap-2 text-sm font-semibold"
              >
                <CalendarDays className="h-4 w-4" /> Ajouter au calendrier
              </Button>
            )}
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button variant="ghost" size="sm" onClick={onCopy} className="gap-1.5 text-xs text-muted-foreground">
              <Copy className="h-3.5 w-3.5" /> Copier
            </Button>
            <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5 text-xs text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" /> Nouveau contenu
            </Button>
          </div>
        </div>
      )}

      {/* Visual preview */}
      {visualSlides && visualSlides.length > 0 && (
        <VisualSlidesGrid slides={visualSlides} />
      )}
    </div>
  );
}
