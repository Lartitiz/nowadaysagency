import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatSlideRole } from "@/lib/slide-roles";
import { sanitizeInternalLabels } from "@/lib/sanitize-internal-labels";
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
import { AlertTriangle, RefreshCw, ArrowUp, ArrowDown, ImageIcon, Palette, RotateCcw, Trash2, Plus } from "lucide-react";
import PhotoSwapDialog from "@/components/creer/PhotoSwapDialog";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
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

const MAX_SLIDES = 20;
const MIN_SLIDES = 2;

export interface CarouselColors {
  primary: string;
  secondary: string;
  accent: string;
}

interface CarouselPhotoResultProps {
  result: any;
  photos?: PhotoItem[];
  onSlidesUpdate?: (slides: any[], caption: any) => void;
  visualSlides?: { slide_number: number; html: string }[];
  channel?: "linkedin" | "instagram";
  onRetry?: () => void;
  captionLoading?: boolean;
  onRegenerateCaption?: () => void;
  onRegenerateVisuals?: () => void;
  visualLoading?: boolean;
  /** Ajoute une photo au set du carrousel (ou retrouve une existante) et renvoie son index 1-based. */
  onAddPhoto?: (photo: PhotoItem) => number;
  /** Surcharge de couleurs pour CE carrousel (null = couleurs de la charte). */
  colors?: CarouselColors | null;
  /** Met à jour la surcharge de couleurs (null = revenir à la charte). */
  onColorsChange?: (colors: CarouselColors | null) => void;
  /** Couleurs par défaut de la charte (pré-remplissent les sélecteurs). */
  charterColors?: CarouselColors;
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

export default function CarouselPhotoResult({ result, photos, onSlidesUpdate, visualSlides, channel = "instagram", onRetry, captionLoading = false, onRegenerateCaption, onRegenerateVisuals, visualLoading = false, onAddPhoto, colors, onColorsChange, charterColors }: CarouselPhotoResultProps) {
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
  // Dialog de remplacement de photo : index 1-based de la slide ciblée (null = fermé).
  const [swapSlideIdx, setSwapSlideIdx] = useState<number | null>(null);
  // Confirmation de suppression : index de la slide à supprimer (null = fermé).
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);

  // Signature des champs éditables d'un slide (texte + photo + type + ordre).
  // Sert à détecter de façon fiable qu'on a édité DEPUIS le dernier rendu visuel —
  // l'ancienne comparaison lisait les slides vivants des deux côtés et ratait les
  // éditions de texte ET les changements de photo.
  const slidesSignature = useCallback(
    (sl: any[], cols?: CarouselColors | null) =>
      JSON.stringify({
        slides: (sl || []).map((s: any) => [
          s.slide_number ?? null,
          s.overlay_text || "",
          s.title || "",
          s.body || "",
          s.photo_index ?? null,
          s.slide_type || "",
        ]),
        // Les couleurs font partie du rendu : les changer doit aussi marquer
        // l'aperçu comme à régénérer.
        colors: cols || null,
      }),
    [],
  );
  // Signature du contenu au moment où les visuels affichés ont été générés.
  // En STATE (pas en ref) : sa mise à jour doit re-render pour recalculer isStale,
  // sinon la bannière « Mettre à jour les visuels » ne se referme pas après régénération.
  const [renderedSig, setRenderedSig] = useState<string>("");


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

  // À chaque nouveau rendu visuel, on photographie la signature des slides DU MOMENT :
  // tout ce qui change ensuite (texte, photo, ordre) marquera l'aperçu comme à régénérer.
  // Volontairement déclenché par le seul changement de `visualSlides` (on capture l'état
  // au moment du rendu, pas à chaque édition).
  useEffect(() => {
    if (visualSlides && visualSlides.length > 0) {
      setRenderedSig(slidesSignature(slides, colors));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualSlides]);

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
    const unused_photo_numbers =
      photos && photos.length > 0
        ? photos
            .map((_, i) => i + 1)
            .filter((n) => !slides.some((s: any) => s.photo_index === n))
        : [];
    const all_photos_used = unused_photo_numbers.length === 0;

    return { slides_with_text, slides_without_text, all_photos_used, unused_photo_numbers };
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

  const moveSlide = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= slides.length) return;
    const next = [...slides];
    [next[idx], next[target]] = [next[target], next[idx]];
    const renumbered = next.map((s, i) => ({ ...s, slide_number: i + 1 }));
    setSlides(renumbered);
    notify(renumbered, caption);
  };

  // Remplacement de la photo d'une slide : ajoute la photo au set (ou retrouve son
  // index si elle y est déjà), pointe la slide dessus, et laisse la bannière
  // « Mettre à jour les visuels » apparaître via la signature.
  const handleSwapPhoto = (slideIdx: number, photo: PhotoItem) => {
    const newIndex = onAddPhoto?.(photo);
    if (!newIndex) return;
    const next = slides.map((s, i) =>
      i === slideIdx ? { ...s, photo_index: newIndex } : s,
    );
    setSlides(next);
    notify(next, caption);
  };

  // Ajout d'une slide texte vide à la fin (l'utilisatrice peut ensuite changer
  // son type, lui mettre une photo, la réordonner). Renumérote tout.
  const addSlide = () => {
    if (slides.length >= MAX_SLIDES) return;
    const next = [
      ...slides,
      { slide_type: "text_only", title: "", body: "", role: "" },
    ].map((s, i) => ({ ...s, slide_number: i + 1 }));
    setSlides(next);
    notify(next, caption);
  };

  const deleteSlide = (idx: number) => {
    if (slides.length <= MIN_SLIDES) return;
    const next = slides
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, slide_number: i + 1 }));
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
      ? "bg-success-bg text-success"
      : qualityCheck?.score >= 60
      ? "bg-warning-bg text-warning"
      : "bg-error-bg text-error";

  // ─── Couleurs du carrousel : surcharge optionnelle de la charte ───
  // Défaut = couleurs de la charte (ou, à défaut, la palette NEUTRE & éditoriale
  // du moteur visuel — volontairement appropriable, pas aux couleurs de Nowadays).
  // Doit rester synchronisé avec carousel-visual/index.ts.
  const DEFAULT_COLORS: CarouselColors = charterColors || {
    primary: "#1C1C20",
    secondary: "#6E6A66",
    accent: "#C9BFB2",
  };
  const effectiveColors: CarouselColors = {
    primary: colors?.primary ?? DEFAULT_COLORS.primary,
    secondary: colors?.secondary ?? DEFAULT_COLORS.secondary,
    accent: colors?.accent ?? DEFAULT_COLORS.accent,
  };
  const colorSwatches: { key: keyof CarouselColors; label: string }[] = [
    { key: "primary", label: "Principale" },
    { key: "secondary", label: "Secondaire" },
    { key: "accent", label: "Accent" },
  ];
  const setColor = (key: keyof CarouselColors, value: string) => {
    onColorsChange?.({ ...effectiveColors, [key]: value });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {r?.chosen_angle && (
        <Badge className="bg-primary/10 text-primary border-primary/20">
          {r.chosen_angle.title}
        </Badge>
      )}

      {onColorsChange && (
        <Card className="border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Palette size={15} className="text-primary" />
                Couleurs du carrousel
              </p>
              {colors && (
                <button
                  type="button"
                  onClick={() => onColorsChange(null)}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  title="Revenir aux couleurs de la charte"
                >
                  <RotateCcw size={11} />
                  Couleurs de la charte
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-4">
              {colorSwatches.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="color"
                    value={effectiveColors[key]}
                    onChange={(e) => setColor(key, e.target.value)}
                    className="h-8 w-8 rounded-md border border-border bg-transparent p-0.5 cursor-pointer"
                    aria-label={`Couleur ${label}`}
                  />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Modifie les couleurs puis « Mettre à jour les visuels » pour les appliquer. Par défaut, ce sont les couleurs de ta charte.
            </p>
          </CardContent>
        </Card>
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
                    {formatSlideRole(slide.role)}
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
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    disabled={idx === 0}
                    onClick={() => moveSlide(idx, -1)}
                    aria-label="Monter la slide"
                    title="Monter la slide"
                  >
                    <ArrowUp size={14} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    disabled={idx === slides.length - 1}
                    onClick={() => moveSlide(idx, 1)}
                    aria-label="Descendre la slide"
                    title="Descendre la slide"
                  >
                    <ArrowDown size={14} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    disabled={slides.length <= MIN_SLIDES}
                    onClick={() => setDeleteIdx(idx)}
                    aria-label="Supprimer la slide"
                    title={slides.length <= MIN_SLIDES ? `Minimum ${MIN_SLIDES} slides` : "Supprimer la slide"}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
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
                return (
                  <div className="flex items-end gap-2">
                    {photo?.preview ? (
                      <img
                        src={photo.preview}
                        alt={`Photo ${photoNum}`}
                        className="h-32 w-auto rounded-md object-cover border border-border"
                      />
                    ) : (
                      <div className="h-32 w-24 rounded-md border border-dashed border-border bg-muted/30 flex items-center justify-center text-muted-foreground">
                        <ImageIcon size={20} />
                      </div>
                    )}
                    {onAddPhoto && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setSwapSlideIdx(idx)}
                      >
                        <ImageIcon size={13} className="mr-1" />
                        {photo?.preview ? "Changer la photo" : "Ajouter une photo"}
                      </Button>
                    )}
                  </div>
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
                        aria-label={`Texte de la slide ${slide.slide_number || idx + 1}`}
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
                  {/* Pour une slide texte, on affiche toujours les deux champs (même vides,
                      ex. slide ajoutée à la main). Pour photo_integrated, seulement s'ils existent. */}
                  {(slide.slide_type === "text_only" || slide.title) && (
                    <Textarea
                      aria-label={`Titre de la slide ${slide.slide_number || idx + 1}`}
                      value={slide.title || ""}
                      placeholder="Titre de la slide"
                      onChange={(e) => {
                        const next = slides.map((s: any, i: number) => (i === idx ? { ...s, title: e.target.value } : s));
                        setSlides(next);
                        notify(next, caption);
                      }}
                      className="resize-none min-h-[40px] text-sm font-semibold"
                      rows={1}
                    />
                  )}
                  {(slide.slide_type === "text_only" || slide.body) && (
                    <Textarea
                      aria-label={`Texte de la slide ${slide.slide_number || idx + 1} (optionnel)`}
                      value={slide.body || ""}
                      placeholder="Texte de la slide (optionnel)"
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
                <p className="text-xs text-muted-foreground">💡 {sanitizeInternalLabels(slide.note)}</p>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Button
        type="button"
        variant="outline"
        className="w-full border-dashed"
        disabled={slides.length >= MAX_SLIDES}
        onClick={addSlide}
        title={slides.length >= MAX_SLIDES ? `Maximum ${MAX_SLIDES} slides` : "Ajouter une slide"}
      >
        <Plus size={15} className="mr-1" />
        Ajouter une slide
      </Button>

      {/* Alerte légende incomplète (Action 4) — masquée pendant le chargement de la légende LinkedIn */}
      {!captionLoading && (
        channel === "instagram"
          ? (!caption?.fullText || caption.fullText.length < 80)
          : (!caption?.body || caption.body.length < 50)
      ) && (
        <div className="rounded-lg border border-warning/30 bg-warning-bg p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <p className="text-xs font-medium text-warning">
              ⚠ La légende n'a pas été générée correctement.
            </p>
            <p className="text-[11px] text-warning">
              Tu peux la rédiger à la main ci-dessous{onRegenerateCaption ? ", relancer uniquement la légende," : ""}{onRetry ? " ou relancer la génération du carrousel." : "."}
            </p>
            <div className="flex flex-wrap gap-2">
              {onRegenerateCaption && channel === "linkedin" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-warning hover:bg-warning-bg"
                  onClick={onRegenerateCaption}
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Régénérer la légende
                </Button>
              )}
              {onRetry && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-warning hover:bg-warning-bg"
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
              aria-label="Légende du carrousel"
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
            <Badge
              variant="outline"
              className="text-[10px] border-warning/30 text-warning cursor-help"
              title={`${
                computedQuality.unused_photo_numbers.length === 1
                  ? `La photo n°${computedQuality.unused_photo_numbers[0]} n'est posée sur aucune slide`
                  : `Les photos n°${computedQuality.unused_photo_numbers.join(", ")} ne sont posées sur aucune slide`
              }. Assigne-la à une slide via « Changer la photo », ou ignore si c'est voulu (ex. après avoir remplacé une photo).`}
            >
              ⚠ {computedQuality.unused_photo_numbers.length === 1 ? "1 photo non utilisée" : `${computedQuality.unused_photo_numbers.length} photos non utilisées`}
            </Badge>
          )}
        </div>
      )}

      {visualSlides && visualSlides.length > 0 && (() => {
        // Édité depuis le dernier rendu visuel ? Compare la signature courante
        // (texte + photo + ordre) à celle photographiée au moment du rendu.
        const isStale =
          renderedSig !== "" &&
          slidesSignature(slides, colors) !== renderedSig;
        return (
          <>
            {isStale && onRegenerateVisuals && (
              <div className="rounded-lg border border-warning/30 bg-warning-bg p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1.5">
                  <p className="text-xs font-medium text-warning">
                    Tu as modifié des slides depuis le dernier rendu visuel.
                  </p>
                  <p className="text-[11px] text-warning">
                    Mets à jour les visuels pour que l'aperçu et l'export reflètent tes modifications.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-warning hover:bg-warning-bg"
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

      {onAddPhoto && swapSlideIdx !== null && (
        <PhotoSwapDialog
          open={swapSlideIdx !== null}
          onOpenChange={(o) => { if (!o) setSwapSlideIdx(null); }}
          currentPhotos={photos}
          currentIndex={(() => {
            const s = slides[swapSlideIdx];
            return Number.isInteger(s?.photo_index) && s.photo_index >= 1 ? s.photo_index : swapSlideIdx + 1;
          })()}
          defaultQuery={r?.subject || result?.subject || ""}
          onSelect={(photo) => handleSwapPhoto(swapSlideIdx, photo)}
        />
      )}

      <AlertDialog open={deleteIdx !== null} onOpenChange={(o) => { if (!o) setDeleteIdx(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette slide ?</AlertDialogTitle>
            <AlertDialogDescription>
              La slide {deleteIdx !== null ? deleteIdx + 1 : ""} et son texte seront retirés du carrousel.
              Pense à mettre à jour les visuels ensuite.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
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

      <AiGeneratedMention />
    </div>
  );
}
