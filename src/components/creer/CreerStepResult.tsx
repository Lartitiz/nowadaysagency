import { Loader2, Pencil, CalendarDays, Copy, Download, RefreshCw, RotateCcw, Palette, ChevronDown, Lightbulb, Sparkles, ArrowUpRight } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import CarouselResult from "@/components/creer/formatRenderers/CarouselResult";
import CarouselPhotoResult from "@/components/creer/formatRenderers/CarouselPhotoResult";
import ReelResult from "@/components/creer/formatRenderers/ReelResult";
import StoryResult from "@/components/creer/formatRenderers/StoryResult";
import PostResult from "@/components/creer/formatRenderers/PostResult";
import LinkedInResult from "@/components/creer/formatRenderers/LinkedInResult";
import NewsletterResult from "@/components/creer/formatRenderers/NewsletterResult";
import PinterestVisualResult from "@/components/creer/formatRenderers/PinterestVisualResult";
import PinterestPhotoBriefResult from "@/components/creer/formatRenderers/PinterestPhotoBriefResult";

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

  let cleaned = raw
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

const TIPS = [
  "💡 Un bon hook = une promesse. Pas un clickbait.",
  "💡 L'algorithme favorise les contenus sauvegardés. Éducatif = jackpot.",
  "💡 Le premier slide détermine 80% de l'engagement.",
  "💡 Un CTA doux performe 2x mieux qu'un CTA directif.",
  "💡 Les posts qui prennent position = 3x plus de commentaires.",
  "💡 2x/semaine avec intention > tous les jours sans stratégie.",
  "💡 Un bon reel = un hook en 3s + une seule idée claire.",
  "💡 Les stories avec sondage = +40% d'engagement.",
];

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
  streamingContent?: string;
  onEdit: () => void;
  onReset: () => void;
  onRegenerate: () => void;
  onCopy: (text: string) => void;
  onSave?: () => void;
  onCalendar?: () => void;
  calendarLabel?: string;
  onGenerateVisuals?: () => void;
  visualLoading?: boolean;
  visualSlides?: { slide_number: number; html: string }[];
  onExportPptx?: () => void;
  onExportHybridPptx?: () => void;
  onExportVisualPng?: () => void;
  onSlidesUpdate?: (slides: any[], caption: any) => void;
  onStoriesUpdate?: (stories: any[]) => void;
  photos?: { preview: string; base64?: string; name?: string }[];
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
}

export default function CreerStepResult({
  result,
  format,
  generating,
  streamingContent,
  onEdit,
  onReset,
  onRegenerate,
  onCopy,
  onSave,
  onCalendar,
  calendarLabel,
  onGenerateVisuals,
  visualLoading,
  visualSlides,
  onExportPptx,
  onExportHybridPptx,
  onExportVisualPng,
  onSlidesUpdate,
  onStoriesUpdate,
  photos,
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
}: Props) {
  // ── Rotation des messages et tips pendant le loading ──
  const messages = PROGRESS_MESSAGES[format] || PROGRESS_MESSAGES.default;
  const [messageIndex, setMessageIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [progress, setProgress] = useState(0);
  const [visualProgressIndex, setVisualProgressIndex] = useState(0);
  const startTimeRef = useRef(Date.now());

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
      setTipIndex((prev) => (prev + 1) % TIPS.length);
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

  // ── Rotation des messages pour génération visuels ──
  useEffect(() => {
    if (!visualLoading) {
      setVisualProgressIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setVisualProgressIndex((prev) => (prev + 1) % VISUAL_PROGRESS_MESSAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [visualLoading]);

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
    return (
      <div className="py-8 animate-fade-in space-y-5">
        <SkeletonPreview format={format} />

        <div className="space-y-3">
          <p className="text-sm font-medium text-center text-foreground animate-fade-in" key={messageIndex}>
            {messages[messageIndex]}
          </p>
          <div className="w-full bg-secondary rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-center text-muted-foreground">{TIPS[tipIndex]}</p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const renderResult = () => {
    // Carousel photo gets its own renderer — but only if we actually have photos
    const r = result?.raw || result;
    if (format === "carousel" && (r?.carousel_type === "photo" || r?.carousel_type === "mix") && photos && photos.length > 0) {
      return (
        <CarouselPhotoResult result={result} photos={photos} onSlidesUpdate={onSlidesUpdate} visualSlides={visualSlides} channel={channel} onRetry={onRegenerate} captionLoading={captionLoading} onRegenerateCaption={onRegenerateCaption} onRegenerateVisuals={onGenerateVisuals} visualLoading={visualLoading} />
      );
    }

    switch (format) {
      case "carousel":
        return <CarouselResult result={result} visualSlides={visualSlides} onSlidesUpdate={onSlidesUpdate} />;
      case "reel":
        return <ReelResult result={result} />;
      case "story":
        return <StoryResult result={result} onStoriesUpdate={onStoriesUpdate} />;
      case "post":
        return <PostResult result={result} />;
      case "linkedin":
        return <LinkedInResult result={result} photos={photos} />;
      case "newsletter":
        return <NewsletterResult result={result} />;
      case "pinterest_photo":
        return <PinterestPhotoBriefResult result={{ raw: result }} overlayHtml={photoBriefOverlayHtml || result?.overlay_html || null} />;
      case "pinterest_visual":
        return <PinterestVisualResult result={{ raw: result }} pinHtml={pinterestPinHtml || null} />;
      default:
        return <PostResult result={result} />;
    }
  };

  const hasVisuals = !!(visualSlides && visualSlides.length > 0);
  const isCarousel = format === "carousel";

  return (
    <div className="space-y-4 animate-fade-in">
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

      {/* 2. Peaufiner */}

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

              {/* Message rotatif */}
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                <p className="text-sm font-medium text-primary animate-fade-in" key={visualProgressIndex}>
                  {VISUAL_PROGRESS_MESSAGES[visualProgressIndex]}
                </p>
              </div>

              {/* Tip */}
              <p className="text-[11px] text-muted-foreground">
                💡 L'IA crée chaque slide avec ta charte graphique. Ça prend environ 30 secondes.
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
          <Button onClick={onCalendar} className="w-full gap-2 h-11 text-sm font-semibold">
            <CalendarDays className="h-4 w-4" /> {calendarLabel || "Ajouter au calendrier"}
          </Button>
        )
      )}

      {/* 4. Actions secondaires */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
        {onSave && (
          <Button variant="ghost" size="sm" onClick={onSave} className="gap-1.5 text-xs text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5" /> Sauvegarder en idée
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
          } else {
            onCopy(JSON.stringify(result, null, 2));
          }
        }} className="gap-1.5 text-xs text-muted-foreground">
          <Copy className="h-3.5 w-3.5" /> Copier
        </Button>
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
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
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
        {isCarousel && hasVisuals && onGenerateVisuals && (
          <Button variant="ghost" size="sm" onClick={onGenerateVisuals} className="gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" /> Regénérer visuels
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
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground font-normal">
                    Actuel : {currentLabel}
                  </DropdownMenuLabel>
                )}
                <DropdownMenuItem onClick={() => onChangeAngle(null)} className="gap-2">
                  <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">Laisser l'IA choisir</p>
                    <p className="text-[10px] text-muted-foreground">Selon ton idée et ta voix</p>
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
                      <p className="text-[10px] text-muted-foreground line-clamp-2">{a.principle}</p>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })()}
        <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5 text-xs text-muted-foreground">
          <RotateCcw className="h-3.5 w-3.5" /> Nouveau contenu
        </Button>
      </div>
    </div>
  );
}
