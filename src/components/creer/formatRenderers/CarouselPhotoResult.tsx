import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatSlideRole } from "@/lib/slide-roles";
import { replaceSlideText } from "@/lib/carousel-html-edit";
import { SlideFramePreview } from "@/components/creer/formatRenderers/CarouselResult";
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
import { AlertTriangle, RefreshCw, ArrowUp, ArrowDown, ImageIcon, ImagePlus, Palette, RotateCcw, Trash2, Plus, Search, Type, Sparkles, Newspaper } from "lucide-react";
import PhotoSwapDialog from "@/components/creer/PhotoSwapDialog";
import NewsPhotoPickerDialog from "@/components/creer/NewsPhotoPickerDialog";
import { PhotoLibraryPickerDialog } from "@/components/photos/PhotoLibraryPickerDialog";
import { userPhotoToBase64, type UserPhotoRow } from "@/lib/photo-storage";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
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

// Chips d'ajustement de la génération d'image (lot 2) — envoyées telles quelles
// à l'edge, appliquées PAR-DESSUS la directive d'origine.
const GEN_CHIPS = ["Autre ambiance", "Avec une personne", "Fond net", "Plus naturel"];

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
  /** Remonte les visuels patchés quand une édition de texte est répercutée dans le HTML. */
  onVisualSlidesUpdate?: (slides: { slide_number: number; html: string }[]) => void;
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
  /** Remonte l'état « visuels périmés » (slides éditées depuis le dernier rendu) pour bloquer publication/export en amont. */
  onStaleChange?: (stale: boolean) => void;
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
        <p className="text-2xs text-muted-foreground">
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

            <p className="text-2xs font-mono text-muted-foreground text-center mt-2">
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

export default function CarouselPhotoResult({ result, photos, onSlidesUpdate, visualSlides, onVisualSlidesUpdate, channel = "instagram", onRetry, captionLoading = false, onRegenerateCaption, onRegenerateVisuals, visualLoading = false, onAddPhoto, colors, onColorsChange, charterColors, onStaleChange }: CarouselPhotoResultProps) {
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
  // Casting (régime texte d'abord) : dialog bibliothèque pour la slide ciblée (index 0-based).
  const [libraryPickSlideIdx, setLibraryPickSlideIdx] = useState<number | null>(null);
  const [libraryImporting, setLibraryImporting] = useState(false);
  // Photo d'actu libre de droits (lot 3) : dialog Openverse pour la slide ciblée.
  const [newsPickSlideIdx, setNewsPickSlideIdx] = useState<number | null>(null);
  // Génération IA par slide (lot 2) : proposition en cours par index de slide.
  // Chaque appel repart de la photo_directive d'ORIGINE (jamais de l'image
  // précédente) — l'ajustement s'applique par-dessus, côté edge.
  const [genState, setGenState] = useState<Record<number, { loading: boolean; image?: string; error?: string }>>({});
  const navigate = useNavigate();
  const castingWorkspaceId = useWorkspaceId();
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

  // Périmé = slides éditées depuis le dernier rendu visuel. Calculé au niveau
  // composant (pas seulement dans la bannière) pour le REMONTER : publication et
  // export d'un visuel obsolète sont bloqués/avertis en amont (avant : la bannière
  // avertissait mais rien n'empêchait de publier une version périmée).
  const visualsStale = useMemo(
    () =>
      Boolean(
        visualSlides && visualSlides.length > 0 && renderedSig !== "" &&
        slidesSignature(slides, colors) !== renderedSig,
      ),
    [visualSlides, renderedSig, slides, colors, slidesSignature],
  );
  useEffect(() => { onStaleChange?.(visualsStale); }, [visualsStale, onStaleChange]);
  // La bannière « Mettre à jour les visuels » disparaît quand le composant se
  // démonte : on remet l'état à « à jour » pour ne pas bloquer d'autres formats.
  useEffect(() => () => { onStaleChange?.(false); }, [onStaleChange]);

  // Aperçu par slide (vis-à-vis, lot F) : visuel apparié par slide_number
  const visualBySlide = useMemo(
    () => new Map((visualSlides || []).map((v) => [v.slide_number, v])),
    [visualSlides],
  );


  // La signature de resync inclut photo_index + cast_source pour que le casting
  // automatique bibliothèque (posé par le parent, régime texte d'abord) soit
  // répercuté dans l'état local même quand la liste de slides n'a pas changé.
  const prevSignature = useRef(JSON.stringify({
    slides: (r?.slides || []).map((s: any) => [s.slide_number, s.photo_index ?? null, s.cast_source || ""]),
    captionHash: JSON.stringify(r?.caption || {}),
  }));

  useEffect(() => {
    const currentSlides = r?.slides || [];
    const newSig = JSON.stringify({
      slides: currentSlides.map((s: any) => [s.slide_number, s.photo_index ?? null, s.cast_source || ""]),
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


  // Édition live (lot F) : le changement de texte est répercuté
  // chirurgicalement dans le HTML du visuel (ancre data-slide-text, repli par
  // correspondance de texte). Succès → la signature "rendue" est synchronisée
  // pour ne pas déclencher la bannière « visuels périmés » sur un simple texte ;
  // échec → visuel inchangé, la bannière + « Mettre à jour » couvrent (comportement d'avant).
  const visualSlidesLiveRef = useRef(visualSlides);
  visualSlidesLiveRef.current = visualSlides;

  const patchVisual = (
    nextSlides: any[],
    slideNumber: number,
    field: "overlay" | "title" | "body",
    oldText: string,
    newText: string,
  ) => {
    const visuals = visualSlidesLiveRef.current;
    if (!visuals?.length || !onVisualSlidesUpdate) return;
    const vi = visuals.findIndex((v) => v.slide_number === slideNumber);
    if (vi < 0) return;
    const patched = replaceSlideText(visuals[vi].html, field, oldText, newText);
    if (!patched) return;
    const nextVisuals = [...visuals];
    nextVisuals[vi] = { ...nextVisuals[vi], html: patched };
    onVisualSlidesUpdate(nextVisuals);
    setRenderedSig(slidesSignature(nextSlides, colors));
  };

  const updateSlideText = (idx: number, text: string) => {
    const oldText = slides[idx]?.overlay_text || "";
    const next = slides.map((s, i) => {
      if (i !== idx) return s;
      const edited: any = { ...s, overlay_text: text };
      // Chiffre du gabarit ancré dans le texte : si l'édition le retire, on purge
      // big_number — sinon un « -40 % » périmé resterait rendu en 170px à la
      // prochaine mise à jour des visuels.
      const big = String(edited.big_number || "").trim();
      if (big) {
        const normalize = (v: string) =>
          v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9%]+/g, " ").trim();
        if (normalize(oldText).includes(normalize(big)) && !normalize(text).includes(normalize(big))) {
          delete edited.big_number;
          if (edited.template === "chiffre") delete edited.template;
        }
      }
      return edited;
    });
    setSlides(next);
    notify(next, caption);
    patchVisual(next, slides[idx]?.slide_number || idx + 1, "overlay", oldText, text);
  };

  const updateSlideField = (idx: number, field: "title" | "body", text: string) => {
    const oldText = (slides[idx]?.[field] as string) || "";
    const next = slides.map((s: any, i: number) => (i === idx ? { ...s, [field]: text } : s));
    setSlides(next);
    notify(next, caption);
    patchVisual(next, slides[idx]?.slide_number || idx + 1, field, oldText, text);
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
  const handleSwapPhoto = (slideIdx: number, photo: PhotoItem, castSource?: string) => {
    const newIndex = onAddPhoto?.(photo);
    if (!newIndex) return;
    const next = slides.map((s, i) =>
      i === slideIdx ? { ...s, photo_index: newIndex, cast_source: castSource } : s,
    );
    setSlides(next);
    notify(next, caption);
  };

  // Casting bibliothèque (régime texte d'abord) : la photo choisie dans la
  // photothèque est convertie en PhotoItem (URL signée → base64) puis posée
  // sur la slide comme un swap classique.
  const handleLibraryPick = async (rows: UserPhotoRow[]) => {
    const row = rows[0];
    if (!row || libraryPickSlideIdx === null) return;
    setLibraryImporting(true);
    try {
      const { base64, mimeType, name } = await userPhotoToBase64(row);
      handleSwapPhoto(libraryPickSlideIdx, {
        id: row.id,
        userPhotoId: row.id,
        base64,
        preview: base64,
        name,
        mimeType,
        context: "",
      });
      setLibraryPickSlideIdx(null);
    } catch (e) {
      toast.error("Cette photo n'a pas pu être chargée", {
        description: e instanceof Error ? e.message : "Réessaie dans un instant.",
      });
    } finally {
      setLibraryImporting(false);
    }
  };

  // Génération IA de l'image d'une slide depuis sa directive (lot 2).
  // 1 crédit par appel (edge carousel-slide-image, gpt-image-2, gate Premium).
  const generateForSlide = async (idx: number, adjustment?: string) => {
    const directive = (slides[idx]?.photo_directive as string | undefined)?.trim();
    if (!directive || genState[idx]?.loading) return;
    setGenState((p) => ({ ...p, [idx]: { ...p[idx], loading: true, error: undefined } }));
    const { data, error } = await invokeWithTimeout(
      "carousel-slide-image",
      {
        body: {
          directive,
          workspace_id: castingWorkspaceId || undefined,
          ...(adjustment ? { adjustment } : {}),
        },
      },
      200_000,
    );
    if (data?.error === "premium_required") {
      setGenState((p) => ({ ...p, [idx]: { ...p[idx], loading: false } }));
      toast.error("La génération d'images est réservée au plan Premium", {
        description: "Passe en Premium pour créer les images de tes slides.",
        action: { label: "Voir les plans", onClick: () => navigate("/abonnement") },
      });
      return;
    }
    if (data?.error === "limit_reached" || error?.isRateLimit) {
      setGenState((p) => ({ ...p, [idx]: { ...p[idx], loading: false } }));
      toast.error("Tu as utilisé toutes tes retouches photo du mois", {
        description: "Elles se rechargent au début du mois prochain.",
      });
      return;
    }
    if (error || typeof data?.image !== "string" || !data.image) {
      const msg = error?.message || data?.error || "Réessaie dans quelques instants.";
      setGenState((p) => ({ ...p, [idx]: { ...p[idx], loading: false, error: msg } }));
      toast.error("Génération impossible", { description: msg });
      return;
    }
    setGenState((p) => ({ ...p, [idx]: { loading: false, image: data.image } }));
  };

  // « Garder cette image » : la proposition générée devient la photo de la slide.
  const keepGeneratedImage = (idx: number) => {
    const img = genState[idx]?.image;
    if (!img) return;
    handleSwapPhoto(idx, {
      id: crypto.randomUUID(),
      base64: img,
      preview: img,
      name: `slide-${slides[idx]?.slide_number || idx + 1}-generee.jpg`,
      mimeType: "image/jpeg",
      context: "",
    }, "generated");
    setGenState((p) => {
      const n = { ...p };
      delete n[idx];
      return n;
    });
  };

  // Photo d'actu libre (lot 3) : pose la photo sur la slide ET injecte la ligne
  // de crédit dans la légende (obligatoire en CC BY) — en UNE passe d'état pour
  // que le parent reçoive slides ET caption cohérents dans le même notify.
  const handleNewsPhotoPick = (idx: number, item: PhotoItem, credit: string) => {
    const newIndex = onAddPhoto?.(item);
    if (!newIndex) return;
    const nextSlides = slides.map((s: any, i: number) =>
      i === idx
        ? { ...s, photo_index: newIndex, cast_source: "news_stock", photo_credit: credit }
        : s,
    );
    let nextCaption = caption;
    const alreadyThere =
      (caption.body || "").includes(credit) || (caption.fullText || "").includes(credit);
    if (credit && !alreadyThere) {
      const body = (caption.body || "").trim();
      nextCaption = { ...caption, body: body ? `${body}\n\n${credit}` : credit };
      nextCaption.fullText = composeFullText(nextCaption);
    }
    setSlides(nextSlides);
    setCaption(nextCaption);
    notify(nextSlides, nextCaption);
    if (nextCaption !== caption) {
      toast("Crédit photo ajouté à la légende", { description: credit });
    }
    setNewsPickSlideIdx(null);
  };

  // Échappatoire anti-image-forcée : si aucune image ne colle à la directive,
  // la slide photo se convertit en slide texte (le récit reste intact).
  const convertSlideToText = (idx: number) => {
    const next = slides.map((s: any, i: number) =>
      i === idx
        ? {
            ...s,
            slide_type: "text_only",
            title: s.title || s.overlay_text || "",
            body: s.body || "",
            photo_index: null,
            photo_directive: undefined,
            photo_query_en: undefined,
            cast_source: undefined,
          }
        : s,
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

  // Bloc « proposition générée » (lot 2) — partagé entre la carte à caster et
  // la carte déjà castée (« Générer à la place »). La régénération et les chips
  // repartent toujours de la directive d'origine.
  const renderGenerationBlock = (idx: number) => {
    const g = genState[idx];
    if (!g) return null;
    if (g.loading) {
      return (
        <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
          Génération de l'image en cours… (~1 min, d'après la directive et ta charte)
        </div>
      );
    }
    if (g.image) {
      return (
        <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
          <div className="flex gap-3 items-start">
            <img
              src={g.image}
              alt="Proposition générée"
              className="h-40 w-auto rounded-md object-cover border border-border"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs font-medium text-foreground">
                <Sparkles size={13} className="inline mr-1 text-primary" />
                Proposition générée
              </p>
              <p className="text-2xs text-muted-foreground">
                D'après la directive de la slide + ta charte visuelle.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" size="sm" className="h-7 text-xs" onClick={() => keepGeneratedImage(idx)}>
                  Garder cette image
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => generateForSlide(idx)}
                >
                  <RefreshCw size={13} className="mr-1" />
                  Régénérer · 1 crédit
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {GEN_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => generateForSlide(idx, chip)}
                    className="rounded-full border border-border bg-background px-2.5 py-0.5 text-2xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                    title={`Régénérer (1 crédit) : ${chip}`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }
    if (g.error) {
      return <p className="mt-2 text-2xs text-destructive">⚠ {g.error}</p>;
    }
    return null;
  };

  // ═══ Casting (régime texte d'abord) ═══
  // Une slide est « à caster » quand elle porte une directive d'image sans photo posée.
  const isPhotoType = (s: any) =>
    s?.slide_type === "photo_full" || s?.slide_type === "photo_integrated";
  const castingSlides = slides.filter((s: any) => isPhotoType(s) && s.photo_directive);
  const uncastCount = castingSlides.filter((s: any) => !Number.isInteger(s.photo_index)).length;
  const castingActive = castingSlides.length > 0;

  return (
    <div className="space-y-4 animate-fade-in">
      {r?.chosen_angle && (
        <Badge className="bg-primary/10 text-primary border-primary/20">
          {r.chosen_angle.title}
        </Badge>
      )}

      {/* En-tête casting : progression + CTA de rendu, tant que les visuels n'existent pas */}
      {castingActive && (!visualSlides || visualSlides.length === 0) && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Ton carrousel est écrit ✍️</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {uncastCount === 0
                  ? "Toutes les slides photo ont leur image : tu peux créer les visuels."
                  : uncastCount === 1
                    ? "Il reste 1 image à choisir. Les slides texte sont prêtes."
                    : `Il reste ${uncastCount} images à choisir. Les slides texte sont prêtes.`}
              </p>
            </div>
            {onRegenerateVisuals && (
              <div className="text-right">
                <Button
                  size="sm"
                  onClick={onRegenerateVisuals}
                  disabled={uncastCount > 0 || visualLoading}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${visualLoading ? "animate-spin" : ""}`} />
                  {visualLoading ? "Création…" : "Créer les visuels"}
                </Button>
                {uncastCount > 0 && (
                  <p className="text-2xs text-muted-foreground mt-1">
                    s'active quand chaque slide photo a son image
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
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
                  className="inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors"
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
            <p className="text-2xs text-muted-foreground">
              Modifie les couleurs puis « Mettre à jour les visuels » pour les appliquer. Par défaut, ce sont les couleurs de ta charte.
            </p>
          </CardContent>
        </Card>
      )}

      {slides.map((slide: any, idx: number) => {
        return (
          <Card key={idx} className="border-border">
            <CardContent className="p-4">
              <div className="flex gap-3 items-start">
              <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  SLIDE {slide.slide_number || idx + 1} / {slides.length}
                </span>
                {slide.role && (
                  <Badge variant="secondary" className="text-2xs">
                    {formatSlideRole(slide.role)}
                  </Badge>
                )}
                {slide.slide_type && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-2xs font-medium hover:bg-muted transition-colors"
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

                // ═══ Slide à caster (régime texte d'abord) : directive sans photo posée ═══
                const isCasting = !!slide.photo_directive && !Number.isInteger(slide.photo_index);
                if (isCasting) {
                  return (
                    <div className="rounded-lg border border-dashed border-warning/50 bg-warning-bg/40 p-3 space-y-2.5">
                      <div className="flex items-start gap-2.5">
                        <div className="h-16 w-12 shrink-0 rounded-md border border-dashed border-border bg-background/60 flex items-center justify-center text-muted-foreground">
                          <ImagePlus size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-2xs font-semibold uppercase tracking-wide text-warning">
                            Image à choisir
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <span className="font-medium text-foreground">L'image idéale ici :</span>{" "}
                            {slide.photo_directive}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setLibraryPickSlideIdx(idx)}
                        >
                          <ImageIcon size={13} className="mr-1" />
                          Ma bibliothèque
                        </Button>
                        {onAddPhoto && slide.news_entity && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setNewsPickSlideIdx(idx)}
                            title={`Photos libres de droits de « ${slide.news_entity} » (crédit ajouté à la légende)`}
                          >
                            <Newspaper size={13} className="mr-1" />
                            Photo d'actu (libre)
                          </Button>
                        )}
                        {onAddPhoto && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setSwapSlideIdx(idx)}
                          >
                            <Search size={13} className="mr-1" />
                            Banque d'images / import
                          </Button>
                        )}
                        {/* Jamais de personnalité/marque générée par IA : le bouton
                            Générer est masqué quand la slide vise une entité d'actu. */}
                        {onAddPhoto && !slide.news_entity && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={genState[idx]?.loading}
                            onClick={() => generateForSlide(idx)}
                          >
                            <Sparkles size={13} className="mr-1" />
                            Générer l'image · 1 crédit
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => convertSlideToText(idx)}
                          title="Aucune image ne colle ? La slide devient une slide texte."
                        >
                          <Type size={13} className="mr-1" />
                          Passer en slide texte
                        </Button>
                      </div>
                      {renderGenerationBlock(idx)}
                    </div>
                  );
                }

                // Résolution photo_index 1-based avec fallback sur l'idx de la slide
                const photoNum =
                  Number.isInteger(slide.photo_index) && slide.photo_index >= 1
                    ? slide.photo_index
                    : idx + 1;
                const photo = photos?.[photoNum - 1];
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-end gap-2">
                      {photo?.preview ? (
                        <img loading="lazy"
                          src={photo.preview}
                          alt={`Photo ${photoNum}`}
                          className="h-32 w-auto rounded-md object-cover border border-border"
                        />
                      ) : (
                        <div className="h-32 w-24 rounded-md border border-dashed border-border bg-muted/30 flex items-center justify-center text-muted-foreground">
                          <ImageIcon size={20} />
                        </div>
                      )}
                      <div className="flex flex-col items-start gap-1">
                        {slide.cast_source === "library_auto" && (
                          <Badge variant="secondary" className="text-2xs bg-success-bg text-success border-transparent">
                            <Sparkles size={10} className="mr-1" />
                            Castée depuis ta bibliothèque
                          </Badge>
                        )}
                        {slide.cast_source === "generated" && (
                          <Badge variant="secondary" className="text-2xs bg-primary/10 text-primary border-transparent">
                            <Sparkles size={10} className="mr-1" />
                            Image générée
                          </Badge>
                        )}
                        {slide.cast_source === "news_stock" && (
                          <Badge variant="secondary" className="text-2xs bg-primary/10 text-primary border-transparent">
                            <Newspaper size={10} className="mr-1" />
                            Photo d'actu — crédit dans la légende
                          </Badge>
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
                        {slide.photo_directive && (
                          <div className="flex flex-wrap gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-muted-foreground"
                              onClick={() => setLibraryPickSlideIdx(idx)}
                            >
                              Ma bibliothèque
                            </Button>
                            {onAddPhoto && slide.news_entity && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-muted-foreground"
                                onClick={() => setNewsPickSlideIdx(idx)}
                              >
                                <Newspaper size={13} className="mr-1" />
                                Photo d'actu
                              </Button>
                            )}
                            {/* Pas de génération IA quand la slide vise une entité
                                d'actu (jamais de personnalité générée). */}
                            {onAddPhoto && !slide.news_entity && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-muted-foreground"
                                disabled={genState[idx]?.loading}
                                onClick={() => generateForSlide(idx)}
                              >
                                <Sparkles size={13} className="mr-1" />
                                Générer à la place · 1 crédit
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {slide.photo_directive && (
                      <p className="text-2xs text-muted-foreground">
                        🎯 {slide.photo_directive}
                      </p>
                    )}
                    {renderGenerationBlock(idx)}
                  </div>
                );
              })()}

              {slide.slide_type === "photo_integrated" && slide.photo_layout && (
                <Badge variant="outline" className="text-2xs">
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
                        <Badge variant="outline" className="text-2xs">
                          {slide.overlay_position.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">(Pas de texte : laisser l'image parler)</p>
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
                      onChange={(e) => updateSlideField(idx, "title", e.target.value)}
                      className="resize-none min-h-[40px] text-sm font-semibold"
                      rows={1}
                    />
                  )}
                  {(slide.slide_type === "text_only" || slide.body) && (
                    <Textarea
                      aria-label={`Texte de la slide ${slide.slide_number || idx + 1} (optionnel)`}
                      value={slide.body || ""}
                      placeholder="Texte de la slide (optionnel)"
                      onChange={(e) => updateSlideField(idx, "body", e.target.value)}
                      className="resize-none min-h-[48px] text-sm"
                      rows={2}
                    />
                  )}
                </div>
              )}

              {slide.note && (
                <p className="text-xs text-muted-foreground">💡 {sanitizeInternalLabels(slide.note)}</p>
              )}
              </div>
              {(() => {
                const v = visualBySlide.get(slide.slide_number || idx + 1);
                return v ? (
                  <SlideFramePreview
                    html={v.html}
                    title={`Aperçu slide ${slide.slide_number || idx + 1}`}
                    width={150}
                  />
                ) : null;
              })()}
              </div>
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
            <p className="text-2xs text-warning">
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
            <p className="text-2xs text-muted-foreground">
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
              className="text-2xs border-warning/30 text-warning cursor-help"
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
        const isStale = visualsStale;
        return (
          <>
            {isStale && onRegenerateVisuals && (
              <div className="rounded-lg border border-warning/30 bg-warning-bg p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1.5">
                  <p className="text-xs font-medium text-warning">
                    Tu as modifié des slides depuis le dernier rendu visuel.
                  </p>
                  <p className="text-2xs text-warning">
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
          defaultQuery={(() => {
            // Casting : la recherche banque d'images est pré-remplie avec les
            // mots-clés de la directive (photo_query_en, généré par l'IA), à
            // défaut la directive elle-même, à défaut le sujet du carrousel.
            const s = slides[swapSlideIdx];
            return s?.photo_query_en || s?.photo_directive || r?.subject || result?.subject || "";
          })()}
          onSelect={(photo) => handleSwapPhoto(swapSlideIdx, photo)}
        />
      )}

      {/* Casting : photo d'actu libre de droits (Openverse) pour la slide ciblée */}
      {newsPickSlideIdx !== null && (
        <NewsPhotoPickerDialog
          open={newsPickSlideIdx !== null}
          onOpenChange={(o) => { if (!o) setNewsPickSlideIdx(null); }}
          defaultQuery={(slides[newsPickSlideIdx]?.news_entity as string) || ""}
          onSelect={(photo, credit) => {
            if (newsPickSlideIdx !== null) handleNewsPhotoPick(newsPickSlideIdx, photo, credit);
          }}
        />
      )}

      {/* Casting : choisir une image dans la photothèque pour la slide ciblée */}
      <PhotoLibraryPickerDialog
        open={libraryPickSlideIdx !== null && !libraryImporting}
        onOpenChange={(o) => { if (!o) setLibraryPickSlideIdx(null); }}
        maxSelectable={1}
        onConfirm={handleLibraryPick}
      />
      {libraryImporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60">
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
        </div>
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
