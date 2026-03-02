import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw, RotateCcw, CalendarDays, Save, Palette, Download, Loader2 } from "lucide-react";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useState } from "react";

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

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onCopy} className="gap-1.5">
          <Copy className="h-3.5 w-3.5" /> Copier
        </Button>
        <Button variant="outline" size="sm" onClick={onRegenerate} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Regénérer
        </Button>
        {onSave && (
          <Button variant="outline" size="sm" onClick={onSave} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> Sauvegarder
          </Button>
        )}
        {onCalendar && (
          <Button variant="outline" size="sm" onClick={onCalendar} className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> Planifier
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5 ml-auto">
          <RotateCcw className="h-3.5 w-3.5" /> Nouveau contenu
        </Button>
      </div>

      {/* Visual actions (carousel only) */}
      {(onGenerateVisuals || onExportPptx) && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
          {onGenerateVisuals && (
            <Button
              variant="outline"
              size="sm"
              onClick={onGenerateVisuals}
              disabled={visualLoading}
              className="gap-1.5"
            >
              {visualLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Palette className="h-3.5 w-3.5" />
              )}
              {visualLoading ? "Génération..." : "Générer les visuels"}
            </Button>
          )}
          {onExportPptx && (
            <Button variant="outline" size="sm" onClick={onExportPptx} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export PPTX
            </Button>
          )}
        </div>
      )}

      {/* Visual preview */}
      {visualSlides && visualSlides.length > 0 && (
        <div className="space-y-3 pt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Aperçu des visuels ({visualSlides.length} slides)
          </p>
          <div className="grid grid-cols-2 gap-3">
            {visualSlides.map((vs) => (
              <div key={vs.slide_number} className="space-y-1">
                <p className="text-[10px] font-mono text-muted-foreground text-center">
                  Slide {vs.slide_number}
                </p>
                <div className="relative overflow-hidden rounded-lg border border-border" style={{ aspectRatio: "4/5" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1350px", transform: "scale(0.35)", transformOrigin: "top left" }}>
                    <iframe
                      srcDoc={vs.html}
                      title={`Slide ${vs.slide_number}`}
                      sandbox="allow-same-origin"
                      style={{ width: "1080px", height: "1350px", border: "none", pointerEvents: "none" }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
