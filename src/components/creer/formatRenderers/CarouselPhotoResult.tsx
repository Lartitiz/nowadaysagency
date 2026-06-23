import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

import AiGeneratedMention from "@/components/AiGeneratedMention";
import LinkedInCaptionEditor from "@/components/linkedin/LinkedInCaptionEditor";
import { AlertTriangle, RefreshCw, ArrowUp, ArrowDown } from "lucide-react";

interface CarouselPhotoResultProps {
  result: any;
  photos?: { preview: string }[];
  onSlidesUpdate?: (slides: any[], caption: any) => void;
  visualSlides?: { slide_number: number; html: string }[];
  channel?: "linkedin" | "instagram";
  onRetry?: () => void;
  captionLoading?: boolean;
  onRegenerateCaption?: () => void;
  onRegenerateVisuals?: () => void;
  visualLoading?: boolean;
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

export default function CarouselPhotoResult({ result, photos, onSlidesUpdate, visualSlides, channel = "instagram", onRetry, captionLoading = false, onRegenerateCaption, onRegenerateVisuals, visualLoading = false }: CarouselPhotoResultProps) {
  const r = result?.raw || result;

  // Construit la version "fullText" mono-bloc à partir des sous-champs
  const composeFullText = (c: any): string => {
    const parts: string[] = [];
    if (c?.hook) parts.push(String(c.hook).trim());
    if (c?.body) parts.push(String(c.body).trim());
    if (c?.cta) parts.push(String(c.cta).trim());
    if (c?.hashtags && c.hashtags.length > 0) {
      const tags = c.hashtags
        .map((t: string) => (t.startsWith("#") ? t : `#${t}`))
        .join(" ");
      parts.push(tags);
    }
    return parts.filter(Boolean).join("\n\n");
  };

  // Re-split best-effort d'un fullText vers { hook, body, cta, hashtags }
  // pour rétro-compat (export, programmation, etc.)
  const splitFullText = (text: string) => {
    const trimmed = (text || "").trim();
    if (!trimmed) return { hook: "", body: "", cta: "", hashtags: [] as string[] };
    const lines = trimmed.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    let hashtags: string[] = [];
    // Dernière ligne = hashtags si elle ne contient que des #...
    const last = lines[lines.length - 1] || "";
    if (/^(#\S+\s*)+$/.test(last)) {
      hashtags = last.split(/\s+/).filter(Boolean);
      lines.pop();
    }
    const hook = lines.shift() || "";
    const body = lines.join("\n\n");
    return { hook, body, cta: "", hashtags };
  };

  // Fallback minimal si l'IA a oublié la légende — au moins une amorce éditable
  const buildCaptionWithFallback = (rawCaption: any, rawSlides: any[]) => {
    const c = rawCaption || {};
    const hasContent = c.hook || c.body || c.cta || (c.hashtags && c.hashtags.length > 0) || c.fullText;
    if (hasContent) {
      const fullText = c.fullText && String(c.fullText).trim().length > 0
        ? String(c.fullText)
        : composeFullText(c);
      return {
        hook: c.hook || "",
        body: c.body || "",
        cta: c.cta || "",
        hashtags: c.hashtags || [],
        fullText,
      };
    }
    const firstSlide = rawSlides?.[0] || {};
    const fallbackHook = firstSlide.overlay_text || firstSlide.title || "";
    return {
      hook: fallbackHook,
      body: "",
      cta: "",
      hashtags: [],
      fullText: fallbackHook,
    };
  };

  const [slides, setSlides] = useState<any[]>(r?.slides || []);
  const [caption, setCaption] = useState<any>(buildCaptionWithFallback(r?.caption, r?.slides || []));
  const [hashtagInput, setHashtagInput] = useState((buildCaptionWithFallback(r?.caption, r?.slides || []).hashtags || []).join(" "));
  const [slidesReorderedSinceVisuals, setSlidesReorderedSinceVisuals] = useState(false);
  

  const prevSignature = useRef(JSON.stringify({
    slides: (r?.slides || []).map((s: any) => s.slide_number),
    captionHash: JSON.stringify(r?.caption || {}),
  }));

  useEffect(() => {
    const currentSlides = r?.slides || [];
    const newSig = JSON.stringify({
      slides: currentSlides.map((s: any) => s.slide_number),
      captionHash: JSON.stringify(r?.caption || {}),
    });
    if (newSig !== prevSignature.current) {
      setSlides(currentSlides);
      const nextCaption = buildCaptionWithFallback(r?.caption, currentSlides);
      setCaption(nextCaption);
      setHashtagInput((nextCaption.hashtags || []).join(" "));
      prevSignature.current = newSig;
    }
  }, [result]);

  // Log si la légende est vide / trop courte (Action 5)
  useEffect(() => {
    if (!caption?.body || caption.body.length < 50) {
      console.warn("[caption_missing]", {
        channel,
        slidesCount: slides.length,
        hookOnly: !!caption?.hook && !caption?.body,
        bodyLen: caption?.body?.length || 0,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // P2 : Quality check calculé côté front (au lieu de faire confiance à l'IA)
  const computedQuality = useMemo(() => {
    const isPhotoSlide = (s: any) =>
      s.slide_type === "photo_full" ||
      s.slide_type === "photo_integrated" ||
      (!s.slide_type && s.overlay_text !== undefined);

    const slides_with_text = slides.filter(
      (s: any) => s.overlay_text || s.body || s.title,
    ).length;
    const slides_without_text = slides.filter(
      (s: any) => isPhotoSlide(s) && !s.overlay_text,
    ).length;
    const all_photos_used =
      photos && photos.length > 0
        ? photos.every((_, i) =>
            slides.some((s: any) => s.photo_index === i + 1),
          )
        : true;

    return { slides_with_text, slides_without_text, all_photos_used };
  }, [slides, photos]);

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
    if (field !== "fullText") {
      next.fullText = composeFullText(next);
    }
    setCaption(next);
    notify(slides, next);
  };

  const updateFullText = (value: string) => {
    const split = splitFullText(value);
    const next = {
      ...caption,
      ...split,
      fullText: value,
    };
    setCaption(next);
    setHashtagInput((split.hashtags || []).join(" "));
    notify(slides, next);
  };

  const updateHashtags = (raw: string) => {
    setHashtagInput(raw);
    const tags = raw
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const next = { ...caption, hashtags: tags };
    next.fullText = composeFullText(next);
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium hover:bg-muted transition-colors"
                        title="Changer le type de slide"
                      >
                        {slide.slide_type === "photo_full" ? "📸 Photo plein écran"
                          : slide.slide_type === "photo_integrated" ? "📷 Photo intégrée"
                          : slide.slide_type === "text_only" ? "📝 Texte"
                          : slide.slide_type}
                        <ChevronDown size={10} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="text-xs">
                      <DropdownMenuItem
                        onClick={() => {
                          const next = slides.map((s, i) =>
                            i === idx ? { ...s, slide_type: "photo_full" } : s,
                          );
                          setSlides(next);
                          notify(next, caption);
                        }}
                      >
                        📸 Photo plein écran
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          const next = slides.map((s, i) =>
                            i === idx ? { ...s, slide_type: "photo_integrated" } : s,
                          );
                          setSlides(next);
                          notify(next, caption);
                        }}
                      >
                        📷 Photo intégrée
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          const next = slides.map((s, i) =>
                            i === idx ? { ...s, slide_type: "text_only" } : s,
                          );
                          setSlides(next);
                          notify(next, caption);
                        }}
                      >
                        📝 Texte
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {(() => {
                // P0-4 : helper unifié — une slide est "photo" si elle a un slide_type photo_*
                // OU (legacy) pas de slide_type mais un overlay_text défini.
                const isPhotoSlide =
                  slide.slide_type === "photo_full" ||
                  slide.slide_type === "photo_integrated" ||
                  (!slide.slide_type && slide.overlay_text !== undefined);
                if (!isPhotoSlide) return null;

                // Résolution photo_index 1-based avec fallback sur l'idx de la slide
                const photoNum =
                  Number.isInteger(slide.photo_index) && slide.photo_index >= 1
                    ? slide.photo_index
                    : idx + 1;
                const photo = photos?.[photoNum - 1];
                if (!photo?.preview) return null;
                return (
                  <img
                    src={photo.preview}
                    alt={`Photo ${photoNum}`}
                    className="h-32 w-auto rounded-md object-cover border border-border"
                  />
                );
              })()}

              {slide.slide_type === "photo_integrated" && slide.photo_layout && (
                <Badge variant="outline" className="text-[10px]">
                  Layout : {slide.photo_layout.replace(/_/g, " ")}
                </Badge>
              )}

              {slide.photo_description && (
                <p className="text-xs text-muted-foreground">📷 {slide.photo_description}</p>
              )}

              {/* P0-4 : édition cohérente — photo_full ET photo_integrated affichent l'overlay s'il existe.
                  Sinon (text_only ou photo_integrated avec title/body) : éditer title/body. */}
              {(slide.slide_type === "photo_full" ||
                (!slide.slide_type && slide.overlay_text !== undefined)) ? (
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

      {/* Alerte légende incomplète (Action 4) — masquée pendant le chargement de la légende LinkedIn */}
      {!captionLoading && (
        channel === "instagram"
          ? (!caption?.fullText || caption.fullText.length < 80)
          : (!caption?.body || caption.body.length < 50)
      ) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
              ⚠ La légende n'a pas été générée correctement.
            </p>
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              Tu peux la rédiger à la main ci-dessous{onRegenerateCaption ? ", relancer uniquement la légende," : ""}{onRetry ? " ou relancer la génération du carrousel." : "."}
            </p>
            <div className="flex flex-wrap gap-2">
              {onRegenerateCaption && channel === "linkedin" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                  onClick={onRegenerateCaption}
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Régénérer la légende
                </Button>
              )}
              {onRetry && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                  onClick={onRetry}
                >
                  Relancer la génération
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {channel === "linkedin" ? (
        <LinkedInCaptionEditor
          hook={caption.hook || ""}
          body={caption.body || ""}
          cta={caption.cta || ""}
          hashtags={caption.hashtags || []}
          hashtagInput={hashtagInput}
          onChangeHook={(v) => updateCaption("hook", v)}
          onChangeBody={(v) => updateCaption("body", v)}
          onChangeCta={(v) => updateCaption("cta", v)}
          onChangeHashtags={updateHashtags}
          loading={captionLoading}
        />
      ) : (
        <Card className="border-border">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">📝 Légende du carrousel</p>
            <p className="text-[11px] text-muted-foreground">
              Hook, corps, CTA et hashtags réunis dans un seul bloc éditable. Modifie librement.
            </p>
            <Textarea
              value={caption.fullText || ""}
              onChange={(e) => updateFullText(e.target.value)}
              placeholder="Écris ou colle ta légende complète (hook, corps, CTA, hashtags)..."
              className="min-h-[240px] text-sm leading-relaxed"
            />
          </CardContent>
        </Card>
      )}

      {qualityCheck && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <Badge className={scoreColor}>{qualityCheck.score}/100</Badge>
          <span>
            {computedQuality.slides_with_text} slide{computedQuality.slides_with_text > 1 ? "s" : ""} avec texte, {computedQuality.slides_without_text} sans
          </span>
          {!computedQuality.all_photos_used && (
            <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700">
              ⚠ photos non utilisées
            </Badge>
          )}
        </div>
      )}

      {visualSlides && visualSlides.length > 0 && (() => {
        // Hash du contenu textuel actuel des slides (overlay_text + title + body)
        const currentHash = JSON.stringify(
          slides.map((s: any) => [s.overlay_text || "", s.title || "", s.body || ""])
        );
        const lastRenderedHash = JSON.stringify(
          visualSlides.map((vs: any) => {
            const s = slides[vs.slide_number - 1] || {};
            return [s.overlay_text || "", s.title || "", s.body || ""];
          })
        );
        const isStale = currentHash !== lastRenderedHash;
        return (
          <>
            {isStale && onRegenerateVisuals && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1.5">
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                    Tu as édité des slides depuis le dernier rendu visuel.
                  </p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    Mets à jour les visuels pour que l'aperçu et l'export reflètent tes modifications.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                    onClick={onRegenerateVisuals}
                    disabled={visualLoading}
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${visualLoading ? "animate-spin" : ""}`} />
                    {visualLoading ? "Mise à jour…" : "Mettre à jour les visuels"}
                  </Button>
                </div>
              </div>
            )}
            <VisualSlidesCarousel slides={visualSlides} />
          </>
        );
      })()}

      <AiGeneratedMention />
    </div>
  );
}
