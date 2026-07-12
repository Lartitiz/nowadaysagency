import { Loader2, Pencil, CalendarDays, Copy, Download, RefreshCw, RotateCcw, Palette, ChevronDown, Lightbulb, Sparkles, ArrowUpRight, Instagram, Linkedin } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import CarouselResult from "@/components/creer/formatRenderers/CarouselResult";
import CarouselPhotoResult, { type CarouselColors } from "@/components/creer/formatRenderers/CarouselPhotoResult";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import ReelResult from "@/components/creer/formatRenderers/ReelResult";
import StoryResult from "@/components/creer/formatRenderers/StoryResult";
import PostResult from "@/components/creer/formatRenderers/PostResult";
import LinkedInResult from "@/components/creer/formatRenderers/LinkedInResult";
import NewsletterResult from "@/components/creer/formatRenderers/NewsletterResult";
import PinterestVisualResult from "@/components/creer/formatRenderers/PinterestVisualResult";
import PinterestPhotoBriefResult from "@/components/creer/formatRenderers/PinterestPhotoBriefResult";
import Confetti from "@/components/Confetti";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { DownloadMenuItems } from "@/components/exports/DownloadMenuItems";
import { EDITORIAL_ANGLES, LINKEDIN_EDITORIAL_ANGLES, PINTEREST_EDITORIAL_ANGLES, type EditorialAngle } from "@/lib/content-structures";

/**
 * Nettoie le contenu streamé en temps réel.
 * L'IA renvoie du JSON wrappé dans des backticks markdown.
 * On extrait le champ "content" au fur et à mesure.
 */
function cleanStreamingContent(raw: string): string {
  if (!raw) return "";

  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/g, "");

  const contentMatch = cleaned.match(/"content"\s*:\s*"([\s\S]*?)(?:"\s*[,}]|$)/);
  if (contentMatch) {
    return contentMatch[1]
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  if (cleaned.trimStart().startsWith("{")) {
    return "";
  }

  return cleaned;
}
// ── Progress messages par format ──
const PROGRESS_MESSAGES: Record<string, string[]> = {
  carousel: [
    "Construction de tes slides…",
    "L'IA structure le fil narratif…",
    "Personnalisation avec ta voix…",
    "Rédaction des punchlines…",
    "Ajustement des CTA…",
  ],
  reel: [
    "Écriture du hook d'ouverture…",
    "Construction du script scène par scène…",
    "Calibrage du rythme (30-60s)…",
    "Ajout des indications visuelles…",
  ],
  story: [
    "Préparation de ta séquence stories…",
    "L'IA construit la narration slide par slide…",
    "Ajout des interactions (sondage, quiz)…",
    "Peaufinage du CTA final…",
  ],
  pinterest_visual: [
    "Composition de ton épingle...",
    "Création du layout infographie...",
    "Application de ta charte graphique...",
    "Génération du titre SEO...",
    "Dernières retouches...",
  ],
  pinterest_photo: [
    "Analyse de l'inspiration...",
    "Rédaction du brief photo...",
    "Création de l'overlay texte...",
    "Optimisation du titre SEO...",
    "Dernières retouches...",
  ],
  pinterest_inspiration: [
    "Analyse de l'épingle...",
    "Étude de la structure visuelle...",
    "Recherche d'angles d'adaptation...",
    "Personnalisation à ton projet...",
  ],
  linkedin: [
    "Rédaction de ton post LinkedIn…",
    "Personnalisation avec ta voix…",
    "Passe de relecture : chasse aux tics d'écriture IA…",
    "Vérification du rythme et des accroches…",
    "Derniers ajustements…",
  ],
  newsletter: [
    "Rédaction de l'objet d'email…",
    "Construction du storytelling…",
    "Développement de la réflexion en profondeur…",
    "Relecture et correction du style…",
    "Dernières retouches…",
  ],
  default: [
    "L'IA rédige ton contenu…",
    "Personnalisation avec ta voix…",
    "Vérification du ton et de la cohérence…",
    "Derniers ajustements…",
  ],
};

const VISUAL_PROGRESS_MESSAGES = [
  "Analyse de ta charte graphique…",
  "Création du layout de chaque slide…",
  "Application des couleurs et typos…",
  "Ajout des éléments décoratifs…",
  "Rendu des schémas visuels…",
  "Peaufinage des détails…",
  "Presque fini…",
];

// ── Libellé de célébration à l'apparition du résultat ──
const FORMAT_DONE_LABELS: Record<string, string> = {
  carousel: "Ton carrousel est prêt",
  reel: "Ton script de reel est prêt",
  story: "Ta séquence de stories est prête",
  post: "Ton post est prêt",
  linkedin: "Ton post LinkedIn est prêt",
  newsletter: "Ta newsletter est prête",
  pinterest_visual: "Ton épingle est prête",
  pinterest_photo: "Ton brief photo est prêt",
};

// Tips universels (valables quel que soit le format).
const TIPS_GENERIC = [
  "💡 Un bon hook = une promesse. Pas un clickbait.",
  "💡 L'algorithme favorise les contenus sauvegardés. Éducatif = jackpot.",
  "💡 Un CTA doux performe 2x mieux qu'un CTA directif.",
  "💡 Les posts qui prennent position = 3x plus de commentaires.",
  "💡 2x/semaine avec intention > tous les jours sans stratégie.",
];

// Tips spécifiques à un format (évite ex. un tip "stories" pendant un LinkedIn).
const TIPS_BY_FORMAT: Record<string, string[]> = {
  carousel: ["💡 Le premier slide détermine 80% de l'engagement."],
  reel: ["💡 Un bon reel = un hook en 3s + une seule idée claire."],
  story: ["💡 Les stories avec sondage = +40% d'engagement."],
};

function getTipsForFormat(format: string): string[] {
  return [...TIPS_GENERIC, ...(TIPS_BY_FORMAT[format] ?? [])];
}

// ── Skeleton adapté au format ──
function SkeletonPreview({ format }: { format: string }) {
  if (format === "carousel") {
    return (
      <div className="flex items-end justify-center gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-32 w-24 rounded-xl bg-secondary animate-pulse" />
            <div className="h-2 w-20 mx-auto rounded bg-secondary animate-pulse" />
          </div>
        ))}
      </div>
    );
  }
  if (format === "reel") {
    return (
      <div className="flex justify-center">
        <div className="h-48 w-28 rounded-xl bg-secondary animate-pulse" />
      </div>
    );
  }
  if (format === "story") {
    return (
      <div className="flex items-end justify-center gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 w-20 rounded-xl bg-secondary animate-pulse" />
        ))}
      </div>
    );
  }
  // post / linkedin / newsletter → text lines
  return (
    <div className="space-y-3 max-w-md mx-auto">
      <div className="h-3 rounded bg-secondary animate-pulse w-full" />
      <div className="h-3 rounded bg-secondary animate-pulse w-[90%]" />
      <div className="h-3 rounded bg-secondary animate-pulse w-[95%]" />
      <div className="h-3 rounded bg-secondary animate-pulse w-[60%]" />
    </div>
  );
}
// Cibles possibles pour "Transformer en…" — utilisent les format IDs internes
// (cf. CreerUnifie paramFormat).
const TRANSFORM_TARGETS: { id: string; emoji: string; label: string }[] = [
  { id: "carousel", emoji: "🎠", label: "Carrousel Instagram" },
  { id: "post", emoji: "📸", label: "Post Instagram" },
  { id: "reel", emoji: "🎬", label: "Reel" },
  { id: "story", emoji: "📱", label: "Stories" },
  { id: "linkedin", emoji: "💼", label: "Post LinkedIn" },
  { id: "newsletter", emoji: "📧", label: "Newsletter" },
  { id: "pinterest_visual", emoji: "📌", label: "Pinterest visuel" },
  { id: "pinterest_photo", emoji: "📌", label: "Pinterest photo" },
];

interface Props {
  result: any;
  format: string;
  generating: boolean;
  /**
   * Étape RÉELLE de la génération (events SSE du serveur) : "writing" pendant
   * la rédaction, "correcting" pendant la relecture anti-patterns IA.
   * null/undefined = pas d'info (messages rotatifs simulés, comportement historique).
   */
  generationStage?: string | null;
  streamingContent?: string;
  // Carrousel passé par l'étape structure → la rédaction est l'étape 2/2.
  step2of2?: boolean;
  // "Mode qualité Max" activé → rédaction Opus (plus longue) : on prévient pendant l'attente.
  qualityMax?: boolean;
  onEdit: () => void;
  onReset: () => void;
  onRegenerate: () => void;
  onCopy: (text: string) => void;
  onSave?: () => void;
  onCalendar?: () => void;
  calendarLabel?: string;
  onGenerateVisuals?: () => void;
  visualLoading?: boolean;
  /** Progression réelle des visuels (lots de slides terminés, SSE). null = barre simulée. */
  visualChunkProgress?: { done: number; total: number } | null;
  visualSlides?: { slide_number: number; html: string }[];
  onVisualSlidesUpdate?: (slides: { slide_number: number; html: string }[]) => void;
  onExportPptx?: () => void;
  onExportHybridPptx?: () => void;
  /** Pont Canva : exporte le PPTX et l'ouvre comme design éditable dans Canva. */
  onOpenInCanva?: () => void;
  openingCanva?: boolean;
  onExportVisualPng?: () => void;
  onSlidesUpdate?: (slides: any[], caption: any) => void;
  onStoriesUpdate?: (stories: any[]) => void;
  /** Remonte l'état « visuels périmés » du carrousel photo (bloque publication/export en amont). */
  onCarouselStaleChange?: (stale: boolean) => void;
  photos?: PhotoItem[];
  /** Remplacement de photo d'une slide de carrousel : ajoute la photo au set et renvoie son index 1-based. */
  onAddPhoto?: (photo: PhotoItem) => number;
  /** Surcharge de couleurs du carrousel (null = couleurs de la charte). */
  carouselColors?: CarouselColors | null;
  onCarouselColorsChange?: (colors: CarouselColors | null) => void;
  /** Couleurs de la charte, pour pré-remplir les sélecteurs. */
  charterColors?: CarouselColors;
  pinterestPinHtml?: string | null;
  onExportPinterestPng?: () => void;
  onExportPinterestEditablePptx?: () => void;
  photoBriefOverlayHtml?: string | null;
  channel?: "linkedin" | "instagram";
  captionLoading?: boolean;
  onRegenerateCaption?: () => void;
  onChangeAngle?: (angleId: string | null) => void;
  currentAngle?: string | null;
  currentChannel?: string;
  /** Nombre de photos qui ont été envoyées à l'IA en vision (photo_mode). 0/undefined = pas de vision. */
  usedPhotoCount?: number;
  /** Brief source pour pré-remplir une duplication "Transformer en…". */
  sourceIdea?: string;
  sourceObjective?: string;
  sourceAngle?: string | null;
  /** Phase 1 publication directe Instagram. Si défini, affiche le bouton. */
  onPublishInstagram?: () => void;
  publishInstagramLoading?: boolean;
  publishInstagramDisabledReason?: string | null;
  /** Publication directe LinkedIn (texte). Si défini, affiche le bouton. */
  onPublishLinkedIn?: () => void;
  publishLinkedInLoading?: boolean;
  publishLinkedInDisabledReason?: string | null;
}

export default function CreerStepResult({
  result,
  format,
  generating,
  generationStage,
  streamingContent,
  step2of2,
  qualityMax,
  onEdit,
  onReset,
  onRegenerate,
  onCopy,
  onSave,
  onCalendar,
  calendarLabel,
  onGenerateVisuals,
  visualLoading,
  visualChunkProgress,
  visualSlides,
  onVisualSlidesUpdate,
  onExportPptx,
  onExportHybridPptx,
  onOpenInCanva,
  openingCanva,
  onExportVisualPng,
  onSlidesUpdate,
  onStoriesUpdate,
  onCarouselStaleChange,
  photos,
  onAddPhoto,
  carouselColors,
  onCarouselColorsChange,
  charterColors,
  pinterestPinHtml,
  onExportPinterestPng,
  onExportPinterestEditablePptx,
  photoBriefOverlayHtml,
  channel,
  captionLoading,
  onRegenerateCaption,
  onChangeAngle,
  currentAngle,
  currentChannel,
  usedPhotoCount,
  sourceIdea,
  sourceObjective,
  sourceAngle,
  onPublishInstagram,
  publishInstagramLoading,
  publishInstagramDisabledReason,
  onPublishLinkedIn,
  publishLinkedInLoading,
  publishLinkedInDisabledReason,
}: Props) {
  // ── Rotation des messages et tips pendant le loading ──
  const messages = PROGRESS_MESSAGES[format] || PROGRESS_MESSAGES.default;
  const tips = getTipsForFormat(format);
  const [messageIndex, setMessageIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * getTipsForFormat(format).length));
  const [progress, setProgress] = useState(0);
  const [visualProgressIndex, setVisualProgressIndex] = useState(0);
  const [visualProgress, setVisualProgress] = useState(0);
  const startTimeRef = useRef(Date.now());

  // ── Célébration à l'apparition du résultat ──
  // Ne se déclenche que sur la transition génération → résultat (pas sur un
  // reload qui restaure un résultat déjà existant).
  const prevGenerating = useRef(generating);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    if (!generating) {
      setProgress(0);
      setMessageIndex(0);
      return;
    }
    startTimeRef.current = Date.now();

    const msgInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 4000);

    const tipInterval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 6000);

    const progressInterval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      // Fast at start, slows down approaching 85%
      const p = Math.min(85, 85 * (1 - Math.exp(-elapsed / 12)));
      setProgress(Math.round(p));
    }, 300);

    return () => {
      clearInterval(msgInterval);
      clearInterval(tipInterval);
      clearInterval(progressInterval);
    };
  }, [generating, messages.length]);

  // ── Rotation des messages + barre de progression pour génération visuels ──
  useEffect(() => {
    if (!visualLoading) {
      setVisualProgressIndex(0);
      setVisualProgress(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setVisualProgressIndex((prev) => (prev + 1) % VISUAL_PROGRESS_MESSAGES.length);
    }, 5000);
    // Barre calibrée sur la durée réelle mesurée : ~50 s en Mode qualité Max (Opus),
    // ~25 s sinon (Sonnet). Avance vite puis ralentit en approchant 92 % jusqu'à
    // l'arrivée réelle des visuels.
    const tau = qualityMax ? 22 : 11;
    const progressInterval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const p = Math.min(92, 92 * (1 - Math.exp(-elapsed / tau)));
      setVisualProgress(Math.round(p));
    }, 300);
    return () => {
      clearInterval(interval);
      clearInterval(progressInterval);
    };
  }, [visualLoading, qualityMax]);

  // Détecte la fin de génération (true → false avec un résultat) → célèbre.
  useEffect(() => {
    const justFinished = prevGenerating.current && !generating && !!result;
    prevGenerating.current = generating;
    if (!justFinished) return;
    setShowCelebration(true);
    const t = setTimeout(() => setShowCelebration(false), 4500);
    return () => clearTimeout(t);
  }, [generating, result]);

  if (generating) {
    // Mode streaming : le contenu texte arrive progressivement
    if (streamingContent) {
      const displayContent = cleanStreamingContent(streamingContent);
      if (displayContent) {
        return (
          <div className="animate-fade-in space-y-4">
            <div className="rounded-2xl border border-primary/20 bg-accent/30 p-6">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{displayContent}</p>
              <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5" />
            </div>
            <p className="text-xs text-center text-muted-foreground">L'IA rédige en temps réel…</p>
          </div>
        );
      }
      // Si le contenu n'est pas encore extractible, montrer le skeleton
    }

    // Mode skeleton : formats structurés (carousel, reel, story)
    // Étape réelle si le serveur l'envoie (SSE) : la correction démarre quand la
    // rédaction est finie → message honnête + barre calée sur la vraie avancée.
    const isCorrecting = generationStage === "correcting";
    const displayedMessage = isCorrecting
      ? "Relecture finale : on gomme les tournures d'IA…"
      : messages[messageIndex];
    const displayedProgress = isCorrecting ? Math.max(progress, 65) : progress;
    return (
      <div className="py-8 animate-fade-in space-y-5">
        {step2of2 && (
          <div className="text-center">
            <span className="inline-block text-2xs font-semibold uppercase tracking-wide text-primary/70 bg-primary/10 rounded-full px-3 py-1">
              Étape 2 / 2 · Rédaction
            </span>
          </div>
        )}

        <SkeletonPreview format={format} />

        <div className="space-y-3">
          <p className="text-sm font-medium text-center text-foreground animate-fade-in" key={isCorrecting ? "correcting" : messageIndex}>
            {displayedMessage}
          </p>
          <div className="w-full bg-secondary rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${displayedProgress}%` }}
            />
          </div>
          {qualityMax ? (
            <p className="text-xs text-center text-primary/80 font-medium">
              ✨ Mode qualité Max activé — c'est plus long, mais plus soigné.
            </p>
          ) : (
            <p className="text-xs text-center text-muted-foreground">{tips[tipIndex % tips.length]}</p>
          )}
        </div>
      </div>
    );
  }

  if (!result) return null;

  const renderResult = () => {
    // Carousel photo gets its own renderer — si on a des photos, OU si les slides
    // portent des directives d'image (régime texte d'abord : le casting se fait
    // dans CarouselPhotoResult, qui démarre alors sans aucune photo).
    const r = result?.raw || result;
    const hasCastingSlides = Array.isArray(r?.slides) && r.slides.some((s: any) => s?.photo_directive);
    if (format === "carousel" && (r?.carousel_type === "photo" || r?.carousel_type === "mix") && ((photos && photos.length > 0) || hasCastingSlides)) {
      return (
        <CarouselPhotoResult result={result} photos={photos} onSlidesUpdate={onSlidesUpdate} visualSlides={visualSlides} onVisualSlidesUpdate={onVisualSlidesUpdate} channel={channel} onRetry={onRegenerate} captionLoading={captionLoading} onRegenerateCaption={onRegenerateCaption} onRegenerateVisuals={onGenerateVisuals} visualLoading={visualLoading} onAddPhoto={onAddPhoto} colors={carouselColors} onColorsChange={onCarouselColorsChange} charterColors={charterColors} onStaleChange={onCarouselStaleChange} />
      );
    }

    switch (format) {
      case "carousel":
        return <CarouselResult result={result} visualSlides={visualSlides} onSlidesUpdate={onSlidesUpdate} onVisualSlidesUpdate={onVisualSlidesUpdate} />;
      case "reel":
        return <ReelResult result={result} />;
      case "story":
        return <StoryResult result={result} onStoriesUpdate={onStoriesUpdate} photos={photos} />;
      case "post":
        return <PostResult result={result} photos={photos} />;
      case "linkedin":
        return <LinkedInResult result={result} photos={photos} />;
      case "newsletter":
        return <NewsletterResult result={result} />;
      case "pinterest_photo":
        return <PinterestPhotoBriefResult result={{ raw: result }} overlayHtml={photoBriefOverlayHtml || result?.overlay_html || null} />;
      case "pinterest_visual":
        return <PinterestVisualResult result={{ raw: result }} pinHtml={pinterestPinHtml || null} />;
      default:
        return <PostResult result={result} photos={photos} />;
    }
  };

  const hasVisuals = !!(visualSlides && visualSlides.length > 0);
  const isCarousel = format === "carousel";

  return (
    <div className="space-y-4 animate-fade-in">
      {showCelebration && <Confetti />}

      {/* Moment de victoire : matérialise le résultat après l'attente */}
      {showCelebration && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-primary/10 to-accent/40 border border-primary/20 animate-fade-in">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm font-semibold text-foreground">
            {(FORMAT_DONE_LABELS[format] || "Ton contenu est prêt")} ✨
          </p>
        </div>
      )}

      {/* Badge : confirme que la photo a bien été utilisée par l'IA */}
      {usedPhotoCount && usedPhotoCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-xs text-foreground animate-fade-in">
          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>
            <strong>
              Généré à partir de {usedPhotoCount === 1 ? "ta photo" : `tes ${usedPhotoCount} photos`}
            </strong>
            {usedPhotoCount === 2
              ? " (mode avant / après)"
              : usedPhotoCount >= 3
              ? " (mode série / reportage)"
              : ""} — l'IA s'est appuyée sur {usedPhotoCount === 1 ? "le visuel" : "les visuels"} pour rédiger le texte.
          </span>
        </div>
      )}

      {/* 1. Contenu (slides, caption, visuels, etc.) */}
      {renderResult()}

      {/* Nudge personnalisation : les visuels utilisent une palette par défaut
          tant que la charte n'a pas de couleurs. On invite à la poser pour des
          visuels « à sa marque » plutôt qu'aux couleurs par défaut. */}
      {isCarousel && !charterColors && (
        <Link
          to="/branding"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground hover:bg-muted/60 transition-colors"
        >
          <Palette className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>
            Astuce : <strong className="text-foreground">pose tes couleurs de marque en 1 min</strong> pour des visuels vraiment à ton image.
          </span>
          <ArrowUpRight className="h-3.5 w-3.5 ml-auto shrink-0" />
        </Link>
      )}

      {/* HÉROS carrousel : finir le visuel dans Canva = action principale après
          génération (l'aperçu in-app est un brouillon ; l'asset final vit dans
          Canva). Publier/Calendrier deviennent secondaires. */}
      {isCarousel && hasVisuals && onOpenInCanva && (
        <Button
          onClick={onOpenInCanva}
          disabled={openingCanva}
          className="w-full gap-2 h-12 text-base font-semibold bg-primary hover:bg-primary text-white border-none"
        >
          {openingCanva ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0" aria-hidden="true">
              <defs>
                <linearGradient id="canvaHeroG" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#00C4CC" />
                  <stop offset="100%" stopColor="#7D2AE8" />
                </linearGradient>
              </defs>
              <circle cx="16" cy="16" r="16" fill="url(#canvaHeroG)" />
              <text x="16" y="23" textAnchor="middle" fontSize="20" fontWeight="700" fill="#ffffff" fontFamily="Georgia, serif">C</text>
            </svg>
          )}
          {openingCanva ? "Ouverture…" : "Ouvrir dans Canva"}
        </Button>
      )}

      {/* 3. CTAs principaux */}
      {isCarousel && !hasVisuals ? (
        <div className="space-y-3">
          {visualLoading ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
              {/* Skeleton des slides */}
              <div className="flex gap-2 overflow-hidden">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-16 h-20 rounded-lg bg-primary/10 animate-pulse shrink-0"
                    style={{ animationDelay: `${i * 200}ms` }}
                  />
                ))}
                <div className="w-16 h-20 rounded-lg bg-primary/5 shrink-0" />
              </div>

              {/* Message : progression réelle (lots de slides, SSE) si dispo, sinon rotatif */}
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                <p className="text-sm font-medium text-primary animate-fade-in" key={visualChunkProgress ? `chunk-${visualChunkProgress.done}` : visualProgressIndex}>
                  {visualChunkProgress && visualChunkProgress.total > 1 && visualChunkProgress.done > 0
                    ? `Design des slides… ${visualChunkProgress.done}/${visualChunkProgress.total} lots prêts`
                    : VISUAL_PROGRESS_MESSAGES[visualProgressIndex]}
                </p>
              </div>

              {/* Barre de progression : vraie avancée des lots quand on la connaît,
                  sinon barre simulée (comportement historique) */}
              <div className="w-full bg-primary/10 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${visualChunkProgress && visualChunkProgress.total > 0
                      ? Math.max(Math.min(visualProgress, 88), Math.round((visualChunkProgress.done / visualChunkProgress.total) * 92))
                      : visualProgress}%`,
                  }}
                />
              </div>

              {/* Attente honnête + rassurante (durée selon le mode) */}
              <p className="text-2xs text-muted-foreground">
                💡 L'IA dessine chaque slide avec ta charte graphique — compte {qualityMax ? "une cinquantaine de secondes" : "une vingtaine de secondes"}.
                Pas besoin d'attendre ici : tu peux relire ton texte au-dessus, les visuels s'affichent dès qu'ils sont prêts.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {onGenerateVisuals && (
                <Button
                  onClick={onGenerateVisuals}
                  className="h-11 gap-2 text-sm font-semibold"
                >
                  <Palette className="h-4 w-4" />
                  Créer les visuels
                </Button>
              )}
              {onCalendar && (
                <Button
                  variant="outline"
                  onClick={onCalendar}
                  className="h-11 gap-2 text-sm font-semibold"
                >
                  <CalendarDays className="h-4 w-4" /> {calendarLabel || "Ajouter au calendrier"}
                </Button>
              )}
            </div>
          )}
          {visualLoading && onCalendar && (
            <Button
              variant="outline"
              onClick={onCalendar}
              className="w-full h-9 gap-2 text-xs text-muted-foreground"
            >
              <CalendarDays className="h-3.5 w-3.5" /> Ajouter au calendrier en attendant
            </Button>
          )}
        </div>
      ) : (
        onCalendar && (
          <Button onClick={onCalendar} variant={isCarousel && hasVisuals ? "outline" : "default"} className="w-full gap-2 h-11 text-sm font-semibold">
            <CalendarDays className="h-4 w-4" /> {calendarLabel || "Ajouter au calendrier"}
          </Button>
        )
      )}

      {/* Publication directe Instagram (phase 1 : 1 image) */}
      {onPublishInstagram && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="w-full inline-block">
                <Button
                  variant="outline"
                  onClick={onPublishInstagram}
                  disabled={!!publishInstagramDisabledReason || publishInstagramLoading}
                  className="w-full gap-2 h-10 text-sm"
                >
                  {publishInstagramLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Instagram className="h-4 w-4" />
                  )}
                  Publier sur Instagram
                </Button>
              </span>
            </TooltipTrigger>
            {publishInstagramDisabledReason && (
              <TooltipContent>{publishInstagramDisabledReason}</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Publication directe LinkedIn (texte) */}
      {onPublishLinkedIn && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="w-full inline-block">
                <Button
                  variant="outline"
                  onClick={onPublishLinkedIn}
                  disabled={!!publishLinkedInDisabledReason || publishLinkedInLoading}
                  className="w-full gap-2 h-10 text-sm"
                >
                  {publishLinkedInLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Linkedin className="h-4 w-4" />
                  )}
                  Publier sur LinkedIn
                </Button>
              </span>
            </TooltipTrigger>
            {publishLinkedInDisabledReason && (
              <TooltipContent>{publishLinkedInDisabledReason}</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}

      {/* 4. Actions secondaires — regroupées en blocs lisibles */}
      <div className="space-y-3">

      {/* ── Récupérer le visuel ── */}
      <div className="space-y-1.5">
        {isCarousel && hasVisuals && (
          <p className="text-2xs text-muted-foreground text-center">Récupérer le visuel</p>
        )}
        <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
          {isCarousel && hasVisuals && (onExportVisualPng || onExportHybridPptx) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
                  <Download className="h-3.5 w-3.5" /> Télécharger <ChevronDown className="h-3 w-3 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DownloadMenuItems
                  onPng={onExportVisualPng}
                  onPptxEditable={onExportHybridPptx}
                  count={visualSlides?.length ?? 1}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {isCarousel && !hasVisuals && onExportPptx && (
            <Button variant="ghost" size="sm" onClick={onExportPptx} className="gap-1.5 text-xs text-muted-foreground">
              <Download className="h-3.5 w-3.5" /> Télécharger PPTX
            </Button>
          )}
          {format === "pinterest_visual" && (result?.pin_html || result?.title) && (onExportPinterestPng || onExportPinterestEditablePptx) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
                  <Download className="h-3.5 w-3.5" /> Télécharger <ChevronDown className="h-3 w-3 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DownloadMenuItems
                  onPng={onExportPinterestPng}
                  onPptxEditable={onExportPinterestEditablePptx}
                  count={1}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {format === "pinterest_photo" && result?.overlay_html && onExportPinterestPng && (
            <Button variant="ghost" size="sm" onClick={onExportPinterestPng} className="gap-1.5 text-xs text-muted-foreground">
              <Download className="h-3.5 w-3.5" /> Télécharger PNG
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => {
            if (format === "pinterest_photo" && result?.title) {
              const b = result.photo_brief;
              const briefText = b ? `\n\n📷 BRIEF PHOTO :\n• Sujet : ${b.what}\n• Cadrage : ${b.framing}\n• Lumière : ${b.lighting}\n• Accessoires : ${(b.props || []).join(", ")}\n• Ambiance : ${b.mood}` : "";
              onCopy(`📌 ${result.title}\n\n${result.description || ""}${briefText}`);
              return;
            }
            if (format === "reel" && (result?.sections || result?.script)) {
              const reelSections = result.sections || result.script || [];
              const scriptText = reelSections.map((s: any) => `[${s.timing || ""}] ${(s.label || "").toUpperCase()}\n${s.texte_parle || ""}${s.texte_overlay ? `\n📝 ${s.texte_overlay}` : ""}`).join("\n\n");
              const tip = result.personal_tip ? `\n\n🎯 ${result.personal_tip}` : "";
              onCopy(`🎬 Script Reel (${result.duree_cible || ""})\n\n${scriptText}${tip}`);
              return;
            }
            if (format === "pinterest_visual" && result?.title) {
              onCopy(`${result.title}\n\n${result.description || ""}`);
              return;
            }
            const cleanText =
              result?.full_text ||
              result?.content ||
              [result?.hook, result?.body, result?.cta].filter(Boolean).join("\n\n").trim();
            onCopy(cleanText || JSON.stringify(result, null, 2));
          }} className="gap-1.5 text-xs text-muted-foreground">
            <Copy className="h-3.5 w-3.5" /> Copier
          </Button>
        </div>
      </div>

      {/* ── Affiner ── */}
      <div className="space-y-1.5">
        {isCarousel && (
          <p className="text-2xs text-muted-foreground text-center">Affiner</p>
        )}
        <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
          {/* Éditer le texte — formats texte (le carrousel a son édition inline) */}
          {!isCarousel && onEdit && result && !generating && (
            <Button variant="ghost" size="sm" onClick={onEdit} className="gap-1.5 text-xs text-muted-foreground">
              <Pencil className="h-3.5 w-3.5" /> Éditer le texte
            </Button>
          )}
          {isCarousel && hasVisuals && onGenerateVisuals && (
            <Button variant="ghost" size="sm" onClick={onGenerateVisuals} disabled={visualLoading} className="gap-1.5 text-xs text-muted-foreground">
              {visualLoading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Génération…</>
              ) : (
                <><RefreshCw className="h-3.5 w-3.5" /> Regénérer visuels</>
              )}
            </Button>
          )}
          {isCarousel && !generating && result && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              title="Régénère le carrousel sur le même sujet (consomme 1 crédit)."
              className="gap-1.5 text-xs text-muted-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Nouvelle proposition
            </Button>
          )}
          {onChangeAngle && !generating && result && (() => {
            const angleList: EditorialAngle[] =
              currentChannel === "linkedin" ? LINKEDIN_EDITORIAL_ANGLES :
              currentChannel === "pinterest" ? PINTEREST_EDITORIAL_ANGLES :
              EDITORIAL_ANGLES;
            const currentLabel = currentAngle ? angleList.find(a => a.id === currentAngle)?.label : null;
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
                    <Palette className="h-3.5 w-3.5" /> Changer d'angle <ChevronDown className="h-3 w-3 ml-0.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 max-h-96 overflow-y-auto">
                  {currentLabel && (
                    <DropdownMenuLabel className="text-2xs text-muted-foreground font-normal">
                      Actuel : {currentLabel}
                    </DropdownMenuLabel>
                  )}
                  <DropdownMenuItem onClick={() => onChangeAngle(null)} className="gap-2">
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">Laisser l'IA choisir</p>
                      <p className="text-2xs text-muted-foreground">Selon ton idée et ta voix</p>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {angleList.map((a) => (
                    <DropdownMenuItem
                      key={a.id}
                      onClick={() => onChangeAngle(a.id)}
                      disabled={a.id === currentAngle}
                      className="gap-2"
                    >
                      <span className="text-base shrink-0">{a.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">{a.label}</p>
                        <p className="text-2xs text-muted-foreground line-clamp-2">{a.principle}</p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })()}
          {sourceIdea && sourceIdea.trim().length > 0 && (() => {
            const targets = TRANSFORM_TARGETS.filter((t) => t.id !== format);
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
                    <ArrowUpRight className="h-3.5 w-3.5" /> Transformer en <ChevronDown className="h-3 w-3 ml-0.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
                    Ouvre un nouvel onglet pré-rempli
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {targets.map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      onClick={() => {
                        const params = new URLSearchParams({
                          sujet: sourceIdea,
                          ...(sourceObjective ? { objectif: sourceObjective } : {}),
                          format: t.id,
                          ...(sourceAngle ? { angle: sourceAngle } : {}),
                          from: "transform",
                        });
                        window.open(`/creer?${params.toString()}`, "_blank", "noopener,noreferrer");
                      }}
                      className="gap-2 cursor-pointer"
                    >
                      <span className="text-base">{t.emoji}</span>
                      <span className="text-sm">{t.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })()}
        </div>
      </div>

      {/* ── Ranger ── */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap border-t border-border pt-3">
        {onSave && (
          <Button variant="ghost" size="sm" onClick={onSave} className="gap-1.5 text-xs text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5" /> Sauvegarder en idée
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5 text-xs text-muted-foreground">
          <RotateCcw className="h-3.5 w-3.5" /> Nouveau contenu
        </Button>
      </div>

      </div>
    </div>
  );
}
