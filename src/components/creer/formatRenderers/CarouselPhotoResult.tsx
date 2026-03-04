import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import AiGeneratedMention from "@/components/AiGeneratedMention";

interface CarouselPhotoResultProps {
  result: any;
  photos?: { preview: string }[];
  onSlidesUpdate?: (slides: any[], caption: any) => void;
}

const OVERLAY_STYLE_CLASS: Record<string, string> = {
  minimal: "text-sm font-bold",
  sensoriel: "text-sm italic",
  narratif: "text-sm",
  technique: "text-sm font-mono",
};

export default function CarouselPhotoResult({ result, photos, onSlidesUpdate }: CarouselPhotoResultProps) {
  const r = result?.raw || result;
  const [slides, setSlides] = useState<any[]>(r?.slides || []);
  const [caption, setCaption] = useState<any>(r?.caption || {});
  const [hashtagInput, setHashtagInput] = useState((r?.caption?.hashtags || []).join(" "));
  const qualityCheck = r?.quality_check;

  const notify = useCallback(
    (s: any[], c: any) => {
      onSlidesUpdate?.(s, c);
    },
    [onSlidesUpdate],
  );

  const updateSlideText = (idx: number, text: string) => {
    const next = slides.map((s, i) => (i === idx ? { ...s, overlay_text: text } : s));
    setSlides(next);
    notify(next, caption);
  };

  const updateCaption = (field: string, value: string) => {
    const next = { ...caption, [field]: value };
    setCaption(next);
    notify(slides, next);
  };

  const updateHashtags = (raw: string) => {
    setHashtagInput(raw);
    const tags = raw
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const next = { ...caption, hashtags: tags };
    setCaption(next);
    notify(slides, next);
  };

  const scoreColor =
    qualityCheck?.score >= 80
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      : qualityCheck?.score >= 60
      ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
      : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Angle badge */}
      {r?.chosen_angle && (
        <Badge className="bg-primary/10 text-primary border-primary/20">
          {r.chosen_angle.title}
        </Badge>
      )}

      {/* Slides */}
      {slides.map((slide: any, idx: number) => {
        const photo = photos?.[idx];
        const styleClass = OVERLAY_STYLE_CLASS[slide.overlay_style] || "text-sm";

        return (
          <Card key={idx} className="border-border">
            <CardContent className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  SLIDE {slide.slide_number || idx + 1} / {slides.length}
                </span>
                {slide.role && (
                  <Badge variant="secondary" className="text-[10px]">
                    {slide.role}
                  </Badge>
                )}
              </div>

              {/* Photo thumbnail */}
              {photo?.preview && (
                <img
                  src={photo.preview}
                  alt={`Photo ${idx + 1}`}
                  className="h-20 w-auto rounded-md object-cover"
                />
              )}

              {/* Photo description (DA note) */}
              {slide.photo_description && (
                <p className="text-xs text-muted-foreground">
                  📷 {slide.photo_description}
                </p>
              )}

              {/* Overlay text */}
              {slide.overlay_text !== null && slide.overlay_text !== undefined ? (
                <div className="space-y-1">
                  <Textarea
                    value={slide.overlay_text}
                    onChange={(e) => updateSlideText(idx, e.target.value)}
                    className={`resize-none min-h-[48px] ${styleClass}`}
                    rows={2}
                  />
                  {slide.overlay_position && (
                    <Badge variant="outline" className="text-[10px]">
                      {slide.overlay_position.replace(/_/g, " ")}
                    </Badge>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  (Pas de texte — laisser l'image parler)
                </p>
              )}

              {/* DA note */}
              {slide.note && (
                <p className="text-xs text-muted-foreground">💡 {slide.note}</p>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Caption */}
      <Card className="border-border">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">📝 Légende du carrousel</p>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Hook</label>
            <Textarea
              value={caption.hook || ""}
              onChange={(e) => updateCaption("hook", e.target.value)}
              className="resize-none min-h-[48px] font-bold text-sm"
              rows={2}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Body</label>
            <Textarea
              value={caption.body || ""}
              onChange={(e) => updateCaption("body", e.target.value)}
              className="resize-none min-h-[96px] text-sm"
              rows={5}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">CTA</label>
            <Textarea
              value={caption.cta || ""}
              onChange={(e) => updateCaption("cta", e.target.value)}
              className="resize-none min-h-[48px] text-sm"
              rows={2}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Hashtags</label>
            <div className="flex flex-wrap gap-1 mb-1">
              {(caption.hashtags || []).map((tag: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-[10px]">
                  {tag.startsWith("#") ? tag : `#${tag}`}
                </Badge>
              ))}
            </div>
            <Input
              value={hashtagInput}
              onChange={(e) => updateHashtags(e.target.value)}
              placeholder="#hashtag1 #hashtag2"
              className="text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Quality check */}
      {qualityCheck && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Badge className={scoreColor}>{qualityCheck.score}/100</Badge>
          <span>
            {qualityCheck.slides_with_text ?? 0} slide{(qualityCheck.slides_with_text ?? 0) > 1 ? "s" : ""} avec texte, {qualityCheck.slides_without_text ?? 0} sans
          </span>
        </div>
      )}

      <AiGeneratedMention />
    </div>
  );
}
