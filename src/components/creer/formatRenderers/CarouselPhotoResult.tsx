import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Plus, ImageIcon, Type } from "lucide-react";
import AiGeneratedMention from "@/components/AiGeneratedMention";

interface CarouselPhotoResultProps {
  result: any;
  photos?: { preview: string }[];
  onSlidesUpdate?: (slides: any[], caption: any) => void;
  visualSlides?: { slide_number: number; html: string }[];
}

// ─── VisualSlidesCarousel (unchanged) ───

function VisualSlidesCarousel({ slides }: { slides: { slide_number: number; html: string }[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.getBoundingClientRect().width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sur mobile, la slide fait 85% du conteneur. Sur desktop, 280px max.
  const SLIDE_WIDTH = containerWidth > 0 ? Math.min(280, containerWidth * 0.85) : 280;
  const SLIDE_GAP = 20;
  const scale = SLIDE_WIDTH / 1080;
  const slideHeight = SLIDE_WIDTH * (1350 / 1080);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const scrollPos = el.scrollLeft;
      const itemWidth = SLIDE_WIDTH + SLIDE_GAP;
      const index = Math.round(scrollPos / itemWidth);
      setActiveIndex(Math.max(0, Math.min(index, slides.length - 1)));
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [slides.length, SLIDE_WIDTH]);

  const scrollToSlide = (idx: number) => {
    scrollRef.current?.scrollTo({
      left: idx * (SLIDE_WIDTH + SLIDE_GAP),
      behavior: "smooth",
    });
  };

  return (
    <div ref={containerRef} className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Aperçu des visuels ({slides.length} slides)
        </p>
        <p className="text-[10px] text-muted-foreground">
          ← Défiler →
        </p>
      </div>

      <div
        ref={scrollRef}
        style={{
          display: "flex",
          gap: `${SLIDE_GAP}px`,
          overflowX: "auto",
          padding: "16px 0 24px",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "thin",
          scrollbarColor: "hsl(var(--primary)) transparent",
        }}
        className="[&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-primary/40 [&::-webkit-scrollbar-thumb]:rounded-full"
      >
        {slides.map((vs) => (
          <div
            key={vs.slide_number}
            style={{
              flex: `0 0 ${SLIDE_WIDTH}px`,
              scrollSnapAlign: "center",
            }}
            className="group"
          >
            <div
              className="relative overflow-hidden rounded-xl transition-all duration-300 group-hover:-translate-y-1"
              style={{
                width: `${SLIDE_WIDTH}px`,
                height: `${slideHeight}px`,
                boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.14)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 24px rgba(0,0,0,0.08)";
              }}
            >
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
            </div>

            <p className="text-[10px] font-mono text-muted-foreground text-center mt-2">
              {vs.slide_number} / {slides.length}
            </p>
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-1.5">
        {slides.map((vs, idx) => (
          <button
            key={vs.slide_number}
            onClick={() => scrollToSlide(idx)}
            className={`rounded-full transition-all duration-200 ${
              idx === activeIndex
                ? "w-2.5 h-2.5 bg-primary"
                : "w-1.5 h-1.5 bg-muted-foreground/25 hover:bg-muted-foreground/50"
            }`}
            aria-label={`Aller à la slide ${vs.slide_number}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───

const OVERLAY_STYLE_CLASS: Record<string, string> = {
  minimal: "text-sm font-bold",
  sensoriel: "text-sm italic",
  narratif: "text-sm",
  technique: "text-sm font-mono",
};

export default function CarouselPhotoResult({ result, photos, onSlidesUpdate, visualSlides }: CarouselPhotoResultProps) {
  const r = result?.raw || result;
  const [slides, setSlides] = useState<any[]>(r?.slides || []);
  const [caption, setCaption] = useState<any>(r?.caption || {});
  const [hashtagInput, setHashtagInput] = useState((r?.caption?.hashtags || []).join(" "));
  const [confirmedStructure, setConfirmedStructure] = useState<SlideStructure[] | null>(null);

  const prevSignature = useRef(JSON.stringify((r?.slides || []).map((s: any) => s.slide_number)));

  useEffect(() => {
    const currentSlides = r?.slides || [];
    const newSig = JSON.stringify(currentSlides.map((s: any) => s.slide_number));
    if (newSig !== prevSignature.current) {
      setSlides(currentSlides);
      setCaption(r?.caption || {});
      setHashtagInput((r?.caption?.hashtags || []).join(" "));
      prevSignature.current = newSig;
    }
  }, [result]);

  const qualityCheck = r?.quality_check;
  const isMixMode = r?.carousel_type === "mix";
  const showPlanner = isMixMode && photos && photos.length > 0 && !visualSlides?.length && !confirmedStructure;

  const notify = useCallback(
    (s: any[], c: any) => {
      onSlidesUpdate?.(s, c);
    },
    [onSlidesUpdate],
  );

  const handleStructureConfirmed = useCallback(
    (structure: SlideStructure[]) => {
      setConfirmedStructure(structure);
      onSlideStructureReady?.(structure);
    },
    [onSlideStructureReady],
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

  // Show planner for mix mode before visual generation
  if (showPlanner) {
    return (
      <div className="space-y-4 animate-fade-in">
        {r?.chosen_angle && (
          <Badge className="bg-primary/10 text-primary border-primary/20">
            {r.chosen_angle.title}
          </Badge>
        )}
        <SlideStructurePlanner
          photos={photos}
          slideCount={slides.length || 8}
          onStructureConfirmed={handleStructureConfirmed}
        />
        <AiGeneratedMention />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {r?.chosen_angle && (
        <Badge className="bg-primary/10 text-primary border-primary/20">
          {r.chosen_angle.title}
        </Badge>
      )}

      {slides.map((slide: any, idx: number) => {
        return (
          <Card key={idx} className="border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  SLIDE {slide.slide_number || idx + 1} / {slides.length}
                </span>
                {slide.role && (
                  <Badge variant="secondary" className="text-[10px]">
                    {slide.role}
                  </Badge>
                )}
                {slide.slide_type && (
                  <Badge variant="outline" className="text-[10px]">
                    {slide.slide_type === "photo_full" ? "📸 Photo plein écran"
                      : slide.slide_type === "photo_integrated" ? "📷 Photo intégrée"
                      : slide.slide_type === "text_only" ? "📝 Texte"
                      : slide.slide_type}
                  </Badge>
                )}
              </div>

              {(slide.slide_type === "photo_full" || slide.slide_type === "photo_integrated" || (!slide.slide_type && slide.overlay_text !== undefined)) && (
                <>
                  {slide.photo_index && photos?.[slide.photo_index - 1]?.preview && (
                    <img
                      src={photos[slide.photo_index - 1].preview}
                      alt={`Photo ${slide.photo_index}`}
                      className="h-20 w-auto rounded-md object-cover"
                    />
                  )}
                  {!slide.photo_index && photos?.[idx]?.preview && (
                    <img
                      src={photos[idx].preview}
                      alt={`Photo ${idx + 1}`}
                      className="h-20 w-auto rounded-md object-cover"
                    />
                  )}
                </>
              )}

              {slide.slide_type === "photo_integrated" && slide.photo_layout && (
                <Badge variant="outline" className="text-[10px]">
                  Layout : {slide.photo_layout.replace(/_/g, " ")}
                </Badge>
              )}

              {slide.photo_description && (
                <p className="text-xs text-muted-foreground">📷 {slide.photo_description}</p>
              )}

              {(slide.slide_type === "photo_full" || (!slide.slide_type && slide.overlay_text !== undefined)) ? (
                <>
                  {slide.overlay_text !== null && slide.overlay_text !== undefined ? (
                    <div className="space-y-1">
                      <Textarea
                        value={slide.overlay_text}
                        onChange={(e) => updateSlideText(idx, e.target.value)}
                        className={`resize-none min-h-[48px] ${OVERLAY_STYLE_CLASS[slide.overlay_style] || "text-sm"}`}
                        rows={2}
                      />
                      {slide.overlay_position && (
                        <Badge variant="outline" className="text-[10px]">
                          {slide.overlay_position.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">(Pas de texte — laisser l'image parler)</p>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  {slide.title && (
                    <Textarea
                      value={slide.title}
                      onChange={(e) => {
                        const next = slides.map((s: any, i: number) => (i === idx ? { ...s, title: e.target.value } : s));
                        setSlides(next);
                        notify(next, caption);
                      }}
                      className="resize-none min-h-[40px] text-sm font-semibold"
                      rows={1}
                    />
                  )}
                  {slide.body && (
                    <Textarea
                      value={slide.body}
                      onChange={(e) => {
                        const next = slides.map((s: any, i: number) => (i === idx ? { ...s, body: e.target.value } : s));
                        setSlides(next);
                        notify(next, caption);
                      }}
                      className="resize-none min-h-[48px] text-sm"
                      rows={2}
                    />
                  )}
                </div>
              )}

              {slide.note && (
                <p className="text-xs text-muted-foreground">💡 {slide.note}</p>
              )}
            </CardContent>
          </Card>
        );
      })}

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

      {qualityCheck && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Badge className={scoreColor}>{qualityCheck.score}/100</Badge>
          <span>
            {qualityCheck.slides_with_text ?? 0} slide{(qualityCheck.slides_with_text ?? 0) > 1 ? "s" : ""} avec texte, {qualityCheck.slides_without_text ?? 0} sans
          </span>
        </div>
      )}

      {visualSlides && visualSlides.length > 0 && (
        <VisualSlidesCarousel slides={visualSlides} />
      )}

      <AiGeneratedMention />
    </div>
  );
}
