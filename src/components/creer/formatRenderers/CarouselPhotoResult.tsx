import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Plus, ImageIcon, Type } from "lucide-react";
import AiGeneratedMention from "@/components/AiGeneratedMention";

type SlideStructure = {
  slide_number: number;
  type: "photo_full" | "photo_integrated" | "text_only";
  photo_index?: number;
  photo_layout?: "top_photo" | "left_photo" | "right_photo" | "card_photo";
};

interface CarouselPhotoResultProps {
  result: any;
  photos?: { preview: string }[];
  onSlidesUpdate?: (slides: any[], caption: any) => void;
  visualSlides?: { slide_number: number; html: string }[];
  onSlideStructureReady?: (structure: SlideStructure[]) => void;
}

// ─── Layout helpers ───

const LAYOUT_OPTIONS: { value: SlideStructure["photo_layout"]; label: string }[] = [
  { value: undefined, label: "Pleine page" },
  { value: "top_photo", label: "Photo en haut" },
  { value: "left_photo", label: "Photo à gauche" },
  { value: "right_photo", label: "Photo à droite" },
  { value: "card_photo", label: "Carte photo" },
];

// ─── SlideStructurePlanner ───

function SlideStructurePlanner({
  photos,
  slideCount = 8,
  onStructureConfirmed,
}: {
  photos: { preview: string }[];
  slideCount?: number;
  onStructureConfirmed: (structure: SlideStructure[]) => void;
}) {
  const [assignments, setAssignments] = useState<
    Record<number, { photoIndex: number; layout?: SlideStructure["photo_layout"] }>
  >({});
  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  const [openSlotPicker, setOpenSlotPicker] = useState<number | null>(null);

  const assignedPhotoIndices = new Set(Object.values(assignments).map((a) => a.photoIndex));
  const hasAnyAssignment = Object.keys(assignments).length > 0;

  const handlePhotoClick = (photoIdx: number) => {
    setSelectedPhoto((prev) => (prev === photoIdx ? null : photoIdx));
    setOpenSlotPicker(null);
  };

  const handleSlotClick = (slotIdx: number) => {
    if (assignments[slotIdx]) return; // already assigned, use ✕ to remove

    if (selectedPhoto !== null) {
      // Direct assign selected photo as photo_full
      setAssignments((prev) => ({
        ...prev,
        [slotIdx]: { photoIndex: selectedPhoto, layout: undefined },
      }));
      setSelectedPhoto(null);
      setOpenSlotPicker(null);
    } else {
      setOpenSlotPicker((prev) => (prev === slotIdx ? null : slotIdx));
    }
  };

  const assignFromPicker = (slotIdx: number, photoIdx: number) => {
    setAssignments((prev) => ({
      ...prev,
      [slotIdx]: { photoIndex: photoIdx, layout: undefined },
    }));
    setOpenSlotPicker(null);
  };

  const updateLayout = (slotIdx: number, layout: SlideStructure["photo_layout"]) => {
    setAssignments((prev) => ({
      ...prev,
      [slotIdx]: { ...prev[slotIdx], layout },
    }));
  };

  const removeAssignment = (slotIdx: number) => {
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[slotIdx];
      return next;
    });
  };

  const handleConfirm = () => {
    const structure: SlideStructure[] = Array.from({ length: slideCount }, (_, i) => {
      const slot = i;
      const assignment = assignments[slot];
      if (assignment) {
        const type = assignment.layout ? "photo_integrated" : "photo_full";
        return {
          slide_number: i + 1,
          type,
          photo_index: assignment.photoIndex + 1, // 1-based
          ...(assignment.layout ? { photo_layout: assignment.layout } : {}),
        } as SlideStructure;
      }
      return { slide_number: i + 1, type: "text_only" as const };
    });
    onStructureConfirmed(structure);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Comment veux-tu répartir tes photos ?
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Clique sur une photo puis sur un slot, ou utilise le "+" pour choisir.
        </p>
      </div>

      <div className="flex gap-4 flex-col sm:flex-row">
        {/* Left: photo thumbnails */}
        <div className="space-y-2 shrink-0">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Tes photos
          </p>
          <div className="flex sm:flex-col flex-row flex-wrap gap-2">
            {photos.map((photo, idx) => {
              const isAssigned = assignedPhotoIndices.has(idx);
              const isSelected = selectedPhoto === idx;
              return (
                <button
                  key={idx}
                  onClick={() => !isAssigned && handlePhotoClick(idx)}
                  disabled={isAssigned}
                  className={`relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/30 scale-105"
                      : isAssigned
                        ? "border-muted opacity-40 cursor-not-allowed"
                        : "border-border hover:border-primary/50 cursor-pointer"
                  }`}
                >
                  <img
                    src={photo.preview}
                    alt={`Photo ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <Badge
                    className="absolute top-1 left-1 bg-primary text-primary-foreground text-[9px] px-1.5 py-0"
                  >
                    {idx + 1}
                  </Badge>
                  {isAssigned && (
                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                      <span className="text-[10px] font-semibold text-muted-foreground">Assignée</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: slide slots */}
        <div className="flex-1 space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Slides ({slideCount})
          </p>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: slideCount }, (_, slotIdx) => {
              const assignment = assignments[slotIdx];

              return (
                <Card
                  key={slotIdx}
                  className={`border transition-all duration-200 ${
                    selectedPhoto !== null && !assignment
                      ? "border-primary/40 bg-primary/5 cursor-pointer hover:border-primary"
                      : "border-border"
                  }`}
                >
                  <CardContent className="p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-semibold text-muted-foreground">
                        Slide {slotIdx + 1}
                      </span>
                      {assignment && (
                        <button
                          onClick={() => removeAssignment(slotIdx)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {assignment ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <img
                            src={photos[assignment.photoIndex].preview}
                            alt={`Photo ${assignment.photoIndex + 1}`}
                            className="w-10 h-10 rounded object-cover"
                          />
                          <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px]">
                            <ImageIcon className="w-2.5 h-2.5 mr-0.5" />
                            Photo {assignment.photoIndex + 1}
                          </Badge>
                        </div>
                        {/* Layout picker */}
                        <div className="flex flex-wrap gap-1">
                          {LAYOUT_OPTIONS.map((opt) => (
                            <button
                              key={opt.label}
                              onClick={() => updateLayout(slotIdx, opt.value)}
                              className={`text-[9px] px-1.5 py-0.5 rounded-md border transition-colors ${
                                assignment.layout === opt.value ||
                                (!assignment.layout && !opt.value)
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-border text-muted-foreground hover:border-primary/50"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <button
                          onClick={() => handleSlotClick(slotIdx)}
                          className="w-full flex items-center justify-center gap-1.5 py-3 rounded-lg border border-dashed border-muted-foreground/20 text-muted-foreground/50 hover:border-primary/40 hover:text-primary/60 transition-colors"
                        >
                          {selectedPhoto !== null ? (
                            <>
                              <ImageIcon className="w-3.5 h-3.5" />
                              <span className="text-[10px]">Placer ici</span>
                            </>
                          ) : (
                            <>
                              <Type className="w-3.5 h-3.5" />
                              <span className="text-[10px]">Slide texte</span>
                              <Plus className="w-3 h-3 ml-1" />
                            </>
                          )}
                        </button>

                        {/* Inline picker */}
                        {openSlotPicker === slotIdx && (
                          <div className="mt-1.5 p-2 bg-card border border-border rounded-lg shadow-md space-y-1.5">
                            <p className="text-[10px] font-semibold text-muted-foreground">
                              Choisir une photo :
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {photos.map((photo, pIdx) => {
                                if (assignedPhotoIndices.has(pIdx)) return null;
                                return (
                                  <button
                                    key={pIdx}
                                    onClick={() => assignFromPicker(slotIdx, pIdx)}
                                    className="relative w-10 h-10 rounded overflow-hidden border border-border hover:border-primary transition-colors"
                                  >
                                    <img
                                      src={photo.preview}
                                      alt={`Photo ${pIdx + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                    <span className="absolute bottom-0 right-0 bg-primary text-primary-foreground text-[8px] px-1">
                                      {pIdx + 1}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* Confirm button */}
      <Button
        onClick={handleConfirm}
        disabled={!hasAnyAssignment}
        className="w-full"
      >
        Confirmer cette structure
      </Button>
    </div>
  );
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
      onSlidesUpdate?.(slides, { ...caption, _structureReady: true, _structure: structure });
    },
    [slides, caption, onSlidesUpdate],
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
