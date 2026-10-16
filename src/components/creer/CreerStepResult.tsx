import { resultCopyText } from "@/lib/result-copy-text";
import { copyTextForChannel } from "@/lib/linkedin-copy";
import { Loader2, Pencil, Palette, Sparkles, ArrowUpRight } from "lucide-react";
import { useState, useEffect, useRef, type ReactNode } from "react";
import type { CarouselQuality } from "@/hooks/use-carousel-quality";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import CarouselResult from "@/components/creer/formatRenderers/CarouselResult";
import CarouselEditorConnected from "@/components/creer/CarouselEditorConnected";
import CarouselPhotoResult, { type CarouselColors } from "@/components/creer/formatRenderers/CarouselPhotoResult";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import ReelResult from "@/components/creer/formatRenderers/ReelResult";
import StoryResult, { type StoryExportActions } from "@/components/creer/formatRenderers/StoryResult";
import PostResult from "@/components/creer/formatRenderers/PostResult";
import LinkedInResult from "@/components/creer/formatRenderers/LinkedInResult";
import NewsletterResult from "@/components/creer/formatRenderers/NewsletterResult";
import PinterestVisualResult from "@/components/creer/formatRenderers/PinterestVisualResult";
import PinterestPhotoBriefResult from "@/components/creer/formatRenderers/PinterestPhotoBriefResult";
import Confetti from "@/components/Confetti";
import { CarouselDraftPreview, type DraftSlide } from "@/components/creer/CarouselDraftPreview";

import ResultActions from "@/components/creer/ResultActions";
import GenerationTimeHint from "@/components/creer/GenerationTimeHint";
import { getIncludeLogoPref, setIncludeLogoPref } from "@/lib/export-logo";

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
    "Rédaction des formules percutantes…",
    "Ajustement des appels à l'action…",
  ],
  reel: [
    "Écriture de l'accroche d'ouverture…",
    "Construction du script scène par scène…",
    "Calibrage du rythme (30-60s)…",
    "Ajout des indications visuelles…",
  ],
  story: [
    "Préparation de ta séquence stories…",
    "L'IA construit la narration slide par slide…",
    "Ajout des interactions (sondage, quiz)…",
    "Peaufinage de l'appel à l'action final…",
  ],
  pinterest_visual: [
    "Composition de ton épingle...",
    "Création de la mise en page de l'infographie...",
    "Application de ta charte graphique...",
    "Génération du titre pour le référencement...",
    "Dernières retouches...",
  ],
  pinterest_photo: [
    "Analyse de l'inspiration...",
    "Rédaction des consignes photo...",
    "Création du texte en surimpression...",
    "Optimisation du titre pour le référencement...",
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
    "Construction du récit…",
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
  "Création de la mise en page de chaque slide…",
  "Application des couleurs et typos…",
  "Ajout des éléments décoratifs…",
  "Rendu des schémas visuels…",
  "Peaufinage des détails…",
  "Presque fini…",
];

// ── Libellé de célébration à l'apparition du résultat ──
const FORMAT_DONE_LABELS: Record<string, string> = {
  carousel: "Ton brouillon de carrousel est généré",
  reel: "Ton script de reel est prêt",
  story: "Ta séquence de stories est prête",
  post: "Ton post est prêt",
  linkedin: "Ton post LinkedIn est prêt",
  newsletter: "Ta newsletter est prête",
  pinterest_visual: "Ton épingle est prête",
  pinterest_photo: "Tes consignes photo sont prêtes",
};

// Tips universels (valables quel que soit le format).
const TIPS_GENERIC = [
  "💡 Une bonne accroche = une promesse. Pas un attrape-clic.",
  "💡 L'algorithme favorise les contenus sauvegardés. Éducatif = jackpot.",
  "💡 Termine par une invitation qui te ressemble, sans forcer la vente.",
  "💡 Une prise de position gagne à s'appuyer sur un exemple concret.",
  "💡 2x/semaine avec intention > tous les jours sans stratégie.",
];

// Tips spécifiques à un format (évite ex. un tip "stories" pendant un LinkedIn).
const TIPS_BY_FORMAT: Record<string, string[]> = {
  carousel: ["💡 Le premier slide doit donner une raison de lire la suite."],
  reel: ["💡 Un bon reel = une accroche en 3s + une seule idée claire."],
  story: ["💡 Un sondage : une question simple à laquelle ta communauté peut répondre."],
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
  /** Carrousel : slides en brouillon reçues pendant l'écriture (affichées grisées). */
  draftSlides?: DraftSlide[];
  /** Carrousel : titres prévus affichés pendant la réflexion, avant la 1re slide. */
  outlineTitles?: string[];
  streamingContent?: string;
  // Carrousel passé par l'étape structure → la rédaction est l'étape 2/2.
  step2of2?: boolean;
  // "Mode qualité Max" activé → rédaction Opus (plus longue) : on prévient pendant l'attente.
  qualityMax?: boolean;
  onEdit: () => void;
  onReset: () => void;
  onRegenerate: () => void;
  onCopy: (text: string) => void;
  onResultTextChange?: (text: string) => void;
  onPostPhotosChange?: (photos: PhotoItem[]) => void | Promise<void>;
  onSave?: () => void;
  saveNotice?: string;
  /** Carrousel enregistré tout seul dans Mes idées : on le dit au lieu d'un bouton. */
  autoSavedToIdeas?: boolean;
  savingContent?: boolean;
  canAutoPublish?: boolean;
  /** Ouvre la fenêtre « Publier ou programmer » (ou sauvegarde directe si fromCalendar). */
  onPublishOrSchedule?: () => void;
  /**
   * Remonte l'URL durable du reel monté : le parent la joint au contenu
   * (`media_urls`) pour que publication et programmation l'emportent.
   */
  reelMp4Url?: string | null;
  onReelMp4Change?: (url: string | null) => void;
  /** Correction structurée d'un Reel (script, montage et sauvegarde). */
  onReelResultChange?: (result: any) => void;
  reelWorkspaceId?: string;
  publishOrScheduleLabel?: string;
  onGenerateVisuals?: () => void;
  visualLoading?: boolean;
  /** Échec des tentatives AUTO de visuels : affiché près du bouton « Créer les visuels »
      (les tentatives auto ne toastent pas — sans ce message, l'échec serait muet). */
  visualsAutoError?: string | null;
  /** Progression réelle des visuels (lots de slides terminés, SSE). null = barre simulée. */
  visualChunkProgress?: { done: number; total: number } | null;
  visualSlides?: { slide_number: number; html: string }[];
  onVisualSlidesUpdate?: (slides: { slide_number: number; html: string }[]) => void;
  onCarouselDocumentChange?: (raw: any, slides: { slide_number: number; html: string }[]) => void;
  onOpenCarouselStudio?: (slideId: string) => void;
  carouselCloudTools?: ReactNode;
  carouselQuality?: CarouselQuality;
  onExportPptx?: () => void;
  onExportHybridPptx?: () => void;
  /** Pont Canva : exporte le PPTX et l'ouvre comme design éditable dans Canva. */
  onOpenInCanva?: () => void;
  openingCanva?: boolean;
  onExportVisualPng?: () => void;
  /** Carrousel LinkedIn : PDF « document LinkedIn » (une page par slide). */
  onExportVisualPdf?: () => void;
  /** La charte a un logo : affiche la case « Ajouter mon logo » au téléchargement. */
  logoAvailable?: boolean;
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
}

export default function CreerStepResult({
  result,
  format,
  generating,
  generationStage,
  draftSlides,
  outlineTitles,
  streamingContent,
  step2of2,
  qualityMax,
  onEdit,
  onReset,
  onRegenerate,
  onCopy,
  onResultTextChange,
  onPostPhotosChange,
  onSave,
  saveNotice,
  autoSavedToIdeas,
  savingContent,
  canAutoPublish,
  onPublishOrSchedule,
  publishOrScheduleLabel,
  reelMp4Url,
  onReelMp4Change,
  onReelResultChange,
  reelWorkspaceId,
  onGenerateVisuals,
  visualLoading,
  visualsAutoError,
  visualChunkProgress,
  visualSlides,
  onVisualSlidesUpdate,
  onCarouselDocumentChange,
  onOpenCarouselStudio,
  carouselCloudTools,
  carouselQuality,
  onExportPptx,
  onExportHybridPptx,
  onOpenInCanva,
  openingCanva,
  onExportVisualPng,
  onExportVisualPdf,
  logoAvailable,
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
  // Actions d'export des stories, remontées par StoryResult (null = pas de frame) :
  // le panneau minimal les affiche au même endroit que pour les carrousels.
  const [storyActions, setStoryActions] = useState<StoryExportActions | null>(null);

  // Avancée du parcours Reel (4 étapes), remontée par ReelResult : sert à ne
  // proposer « Publier ou programmer » qu'à la dernière étape — on ne publie
  // pas une vidéo qui n'est pas encore tournée. Reste `null` tant que rien
  // n'est remonté, et le bouton s'affiche alors comme avant (fail-open) : un
  // reel sans signal ne doit JAMAIS devenir impubliable en silence.
  const [reelStep, setReelStep] = useState<
    { key: "script" | "tournage" | "montage" | "caption"; step: number; isLast: boolean; montageDone: boolean } | null
  >(null);

  // Encadrés sauvegarde + contrôle qualité du carrousel : rendus sous la
  // barre d'actions (ResultActions) via un portail (lisibilité — ils n'écrasent plus le haut de l'éditeur).
  const [carouselToolsSlot, setCarouselToolsSlot] = useState<HTMLElement | null>(null);


  // ── Célébration à l'apparition du résultat ──
  // Ne se déclenche que sur la transition génération → résultat (pas sur un
  // reload qui restaure un résultat déjà existant).
  const prevGenerating = useRef(generating);
  const [showCelebration, setShowCelebration] = useState(false);
  const [includeLogo, setIncludeLogo] = useState(getIncludeLogoPref);
  const handleIncludeLogoChange = (value: boolean) => { setIncludeLogo(value); setIncludeLogoPref(value); };

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
  // Pas de confettis si le visuel Pinterest manque à l'appel : le renderer
  // affiche alors « n'a pas pu être créé » — célébrer serait contradictoire.
  const pinterestVisualMissing =
    (format === "pinterest_visual" && !(pinterestPinHtml || result?.pin_html)) ||
    (format === "pinterest_photo" && !(photoBriefOverlayHtml || result?.overlay_html));
  useEffect(() => {
    const justFinished = prevGenerating.current && !generating && !!result && !pinterestVisualMissing;
    prevGenerating.current = generating;
    if (!justFinished) return;
    setShowCelebration(true);
    const t = setTimeout(() => setShowCelebration(false), 4500);
    return () => clearTimeout(t);
  }, [generating, result, pinterestVisualMissing]);

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
            <GenerationTimeHint format={format} startedAt={startTimeRef.current} afterPlan={step2of2} />
          </div>
        );
      }
      // Si le contenu n'est pas encore extractible, montrer le skeleton
    }

    // Carrousel : les slides arrivent en brouillon pendant l'écriture.
    if (format === "carousel" && ((draftSlides?.length ?? 0) > 0 || (outlineTitles?.length ?? 0) > 0)) {
      return (
        <div className="py-6 space-y-4">
          {step2of2 && (
            <div className="text-center">
              <span className="inline-block text-2xs font-semibold uppercase tracking-wide text-primary/70 bg-primary/10 rounded-full px-3 py-1">
                Puis la rédaction des slides
              </span>
            </div>
          )}
          <CarouselDraftPreview slides={draftSlides ?? []} outline={outlineTitles} stage={generationStage} photos={photos} />
          <GenerationTimeHint format={format} startedAt={startTimeRef.current} afterPlan={step2of2} />
          {qualityMax && (
            <p className="text-xs text-center text-primary/80 font-medium">
              ✨ Rédaction la plus soignée activée — c'est plus long, mais ça en vaut la peine.
            </p>
          )}
        </div>
      );
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
              Puis la rédaction des slides
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
          <GenerationTimeHint format={format} startedAt={startTimeRef.current} afterPlan={step2of2} />
          {qualityMax ? (
            <p className="text-xs text-center text-primary/80 font-medium">
              ✨ Rédaction la plus soignée activée — c'est plus long, mais ça en vaut la peine.
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
    if (format === "carousel" && visualSlides?.length && onCarouselDocumentChange) {
      return <fieldset disabled={visualLoading} className={`min-w-0 w-full ${visualLoading ? "pointer-events-none opacity-60" : ""}`} aria-busy={visualLoading}>
        {visualLoading && <p role="status" className="mb-3 text-sm">Régénération en cours. Les retouches seront disponibles dès que les nouveaux visuels seront prêts.</p>}
        <CarouselEditorConnected brandColors={charterColors ? [charterColors.primary, charterColors.secondary, charterColors.accent] : undefined} onOpenStudio={onOpenCarouselStudio} result={result} visualSlides={visualSlides} onChange={onCarouselDocumentChange} photos={photos} onAddPhoto={onAddPhoto} onStaleChange={onCarouselStaleChange} cloudTools={carouselCloudTools} quality={carouselQuality} toolsPortal={carouselToolsSlot} />
      </fieldset>;
    }
    // Carousel photo gets its own renderer — si on a des photos, OU si les slides
    // portent des directives d'image (régime texte d'abord : le casting se fait
    // dans CarouselPhotoResult, qui démarre alors sans aucune photo).
    const r = result?.raw || result;
    const hasCastingSlides = Array.isArray(r?.slides) && r.slides.some((s: any) => s?.photo_directive);
    if (format === "carousel" && (r?.carousel_type === "photo" || r?.carousel_type === "mix") && ((photos && photos.length > 0) || hasCastingSlides)) {
      return (
        <CarouselPhotoResult onOpenStudio={onOpenCarouselStudio} result={result} photos={photos} onSlidesUpdate={onSlidesUpdate} visualSlides={visualSlides} onVisualSlidesUpdate={onVisualSlidesUpdate} channel={channel} onRetry={onRegenerate} captionLoading={captionLoading} onRegenerateCaption={onRegenerateCaption} onRegenerateVisuals={onGenerateVisuals} visualLoading={visualLoading} onAddPhoto={onAddPhoto} colors={carouselColors} onColorsChange={onCarouselColorsChange} charterColors={charterColors} onStaleChange={onCarouselStaleChange} />
      );
    }

    switch (format) {
      case "carousel":
        return <CarouselResult result={result} visualSlides={visualSlides} onSlidesUpdate={onSlidesUpdate} onVisualSlidesUpdate={onVisualSlidesUpdate} onStaleChange={onCarouselStaleChange} />;
      case "reel":
        return <ReelResult initialMp4Url={reelMp4Url} result={result} workspaceId={reelWorkspaceId} onStepChange={setReelStep} onMp4Change={onReelMp4Change} onResultChange={onReelResultChange} />;
      case "story":
        return <StoryResult result={result} onStoriesUpdate={onStoriesUpdate} photos={photos} onExportActionsChange={setStoryActions} />;
      case "post":
        return <PostResult result={result} photos={photos} onTextChange={onResultTextChange} onPhotosChange={onPostPhotosChange} />;
      case "linkedin":
        return <LinkedInResult result={result} photos={photos} onTextChange={onResultTextChange} />;
      case "newsletter":
        return <NewsletterResult result={result} />;
      case "pinterest_photo":
        return <PinterestPhotoBriefResult result={{ raw: result }} overlayHtml={photoBriefOverlayHtml || result?.overlay_html || null} onRetry={onRegenerate} />;
      case "pinterest_visual":
        return <PinterestVisualResult result={{ raw: result }} pinHtml={pinterestPinHtml || null} onRetry={onRegenerate} />;
      default:
        return <PostResult result={result} photos={photos} onTextChange={onResultTextChange} />;
    }
  };

  const hasVisuals = !!(visualSlides && visualSlides.length > 0);
  const isCarousel = format === "carousel";
  const isStory = format === "story";

  // Texte propre à copier selon le format (déplacé tel quel dans le menu « Autres actions »).
  // LinkedIn n'interprète pas le markdown : un **gras** collé resterait en
  // astérisques. Même nettoyage que la publication directe (linkedin-graph).
  const handleCopyText = () => onCopy(copyTextForChannel(resultCopyText(format, result, reelStep?.key), format));

  return (
    <div className="space-y-4 animate-fade-in">
      {showCelebration && <Confetti />}

      {/* Moment de victoire : matérialise le résultat après l'attente */}
      {showCelebration && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-pale border border-primary/20 animate-fade-in">
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
      {!isCarousel && onEdit && result && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={onEdit} className="gap-2">
            <Pencil className="h-4 w-4" /> Éditer le texte
          </Button>
        </div>
      )}
      <div data-testid="result-content">{renderResult()}</div>

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

      {/* Carrousel sans visuels : « Créer les visuels » est l'action principale.
          Les autres actions vivent dans la barre collée en bas (ResultActions). */}
      {isCarousel && !hasVisuals && (
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
            onGenerateVisuals && (
              <div className="space-y-2">
                {visualsAutoError && (
                  <p
                    data-testid="visuals-auto-error"
                    className="text-xs text-warning bg-warning-bg border border-warning/30 rounded-lg px-3 py-2"
                  >
                    {visualsAutoError} Relance quand tu veux avec le bouton ci-dessous.
                  </p>
                )}
                <Button
                  onClick={onGenerateVisuals}
                  className="w-full h-11 gap-2 text-sm font-semibold"
                >
                  <Palette className="h-4 w-4" />
                  {visualsAutoError ? "Réessayer les visuels" : "Créer les visuels"}
                </Button>
              </div>
            )
          )}
        </div>
      )}

      <ResultActions
        format={format}
        result={result}
        hasVisuals={hasVisuals}
        visualCount={visualSlides?.length ?? 1}
        visualLoading={visualLoading}
        createVisualsPending={isCarousel && !hasVisuals && !!onGenerateVisuals}
        onGenerateVisuals={onGenerateVisuals}
        // Reel : publier seulement à la DERNIÈRE étape (on ne publie pas une vidéo
        // pas encore tournée). Test à l'envers (`!== false`) exprès : tant
        // qu'aucune étape n'est remontée, le bouton s'affiche.
        onPublishOrSchedule={format !== "reel" || reelStep?.isLast !== false ? onPublishOrSchedule : undefined}
        publishOrScheduleLabel={publishOrScheduleLabel}
        canAutoPublish={canAutoPublish}
        onCopyText={handleCopyText}
        storyActions={isStory ? storyActions : null}
        onExportVisualPng={onExportVisualPng}
        onExportVisualPdf={onExportVisualPdf}
        onExportHybridPptx={onExportHybridPptx}
        onExportPptx={onExportPptx}
        onExportPinterestPng={onExportPinterestPng}
        onExportPinterestEditablePptx={onExportPinterestEditablePptx}
        onOpenInCanva={onOpenInCanva}
        openingCanva={openingCanva}
        logoAvailable={logoAvailable}
        includeLogo={includeLogo}
        onIncludeLogoChange={handleIncludeLogoChange}
        onSave={onSave}
        savingContent={savingContent}
        saveNotice={saveNotice}
        autoSavedToIdeas={autoSavedToIdeas}
        onReset={onReset}
        onRegenerate={onRegenerate}
        onChangeAngle={onChangeAngle}
        currentAngle={currentAngle}
        currentChannel={currentChannel}
        sourceIdea={sourceIdea}
        sourceObjective={sourceObjective}
        sourceAngle={sourceAngle}
      />

      {/* Encadrés sauvegarde + contrôle qualité (rendus par CarouselEditor
          via un portail) : sous les actions principales, jamais au-dessus. */}
      <div ref={setCarouselToolsSlot} data-testid="carousel-tools-slot" />
    </div>
  );
}
