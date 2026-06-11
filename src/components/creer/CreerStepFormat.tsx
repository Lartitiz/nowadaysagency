import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, ArrowRight, Wand2 } from "lucide-react";
import {
  CONTENT_TYPE_SPECS,
  OBJECTIVE_RECOMMENDATIONS,
  CONTENT_STRUCTURES,
  getAnglesForType,
  getStructureForCombo,
  type EditorialAngle,
} from "@/lib/content-structures";
import { PhotoUploadZone, type PhotoItem } from "@/components/creer/PhotoUploadZone";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CHANNELS = [
  { id: "instagram" as const, emoji: "📸", label: "Instagram", desc: "Carrousel, Reel, Story, Post" },
  { id: "linkedin" as const, emoji: "💼", label: "LinkedIn", desc: "Post ou carrousel" },
  { id: "pinterest" as const, emoji: "📌", label: "Pinterest", desc: "Épingle texte, visuelle ou inspirée" },
  { id: "newsletter" as const, emoji: "📧", label: "Newsletter", desc: "Email 1500-2500 mots" },
];

type ChannelId = "instagram" | "linkedin" | "pinterest" | "newsletter";

function deduceChannel(format: string): ChannelId {
  if (format === "linkedin") return "linkedin";
  if (format === "pinterest" || format === "pinterest_visual" || format === "pinterest_inspiration") return "pinterest";
  if (format === "newsletter") return "newsletter";
  return "instagram";
}

// Formats supporting a single attached photo (vision-anchored generation via creative-flow / future single-photo flows).
// Excludes carousel (handled separately, multi-photo) and pinterest_* (own flow).
function formatAcceptsSinglePhoto(format: string | null | undefined): boolean {
  if (!format) return false;
  return ["post", "reel", "story", "linkedin", "newsletter"].includes(format);
}

function getPhotoToggleCopy(format: string): { title: string; subtitle: string } {
  switch (format) {
    case "post":
      return { title: "📸 J'accompagne une photo", subtitle: "L'IA adapte ta légende à ton image" };
    case "reel":
      return { title: "📸 Mon Reel s'appuie sur une image", subtitle: "Référence visuelle, vignette ou plan d'inspiration — l'IA s'en sert pour le hook et le script" };
    case "story":
      return { title: "📸 Mes stories tournent autour d'une photo", subtitle: "L'IA construit une séquence narrative à partir de l'image" };
    case "linkedin":
      return { title: "📸 J'attache une photo à mon post", subtitle: "L'IA ancre le texte sur un point précis du visuel" };
    case "newsletter":
      return { title: "📸 Image d'en-tête / illustration", subtitle: "L'IA prolonge l'ambiance de l'image dans le texte" };
    default:
      return { title: "📸 J'accompagne une photo", subtitle: "L'IA adapte ton contenu à ton image" };
  }
}

interface Props {
  idea: string;
  objective?: string;
  initialFormat?: string;
  suggestedFormat?: string;
  initialPhotos?: PhotoItem[];
  initialPhotoDescription?: string;
  onNext: (format: string, editorialAngle?: string, carouselSubMode?: "text" | "photo" | "mix" | "pure_photo", photos?: PhotoItem[], photoDescription?: string, photoMode?: boolean, pinterestData?: { link?: string; boardId?: string; boardName?: string }, linkedinCarousel?: boolean) => void;
  onBack: () => void;
}

export default function CreerStepFormat({ idea, objective, initialFormat, suggestedFormat, initialPhotos, initialPhotoDescription, onNext, onBack }: Props) {
  const [selectedChannel, setSelectedChannel] = useState<ChannelId | null>(
    initialFormat ? deduceChannel(initialFormat) : null
  );
  const [selectedFormat, setSelectedFormat] = useState<string | null>(initialFormat || null);
  const [selectedAngle, setSelectedAngle] = useState<string | undefined>(undefined);
  const [carouselSubMode, setCarouselSubMode] = useState<"text" | "photo" | "mix" | "pure_photo" | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<PhotoItem[]>(initialPhotos ?? []);
  const [photoDescription, setPhotoDescription] = useState(initialPhotoDescription ?? "");
  const [photoMode, setPhotoMode] = useState(false);
  const [postPhoto, setPostPhoto] = useState<PhotoItem[]>(
    // On garde toutes les photos par défaut — handleFormatSelect slicera
    // selon le format choisi (LinkedIn = 10, autres = 1).
    initialPhotos ?? []
  );
  const [postPhotoDescription, setPostPhotoDescription] = useState(initialPhotoDescription ?? "");
  const hasUserChangedFormat = useRef(false);
  const [pinterestLink, setPinterestLink] = useState("");
  const [pinterestBoardId, setPinterestBoardId] = useState("");
  const [pinterestBoards, setPinterestBoards] = useState<{ id: string; name: string }[]>([]);
  const [linkedinSubMode, setLinkedinSubMode] = useState<"text" | "carousel" | null>(null);
  const [pinterestSubMode, setPinterestSubMode] = useState<"text" | "visual" | "inspiration" | null>(null);
  const [inspirationPhotos, setInspirationPhotos] = useState<PhotoItem[]>([]);
  const [photoWarning, setPhotoWarning] = useState(false);
  const [expandAngles, setExpandAngles] = useState(false);
  const [forceShowAll, setForceShowAll] = useState(false);
  const hasPreloadedPhotos = (initialPhotos?.length ?? 0) > 0 && !forceShowAll;

  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();

  useEffect(() => {
    if (selectedChannel !== "pinterest" || !user) return;
    const loadBoards = async () => {
      const { data } = await (supabase.from("pinterest_boards") as any)
        .select("id, name")
        .eq(column, value)
        .order("sort_order");
      if (data) setPinterestBoards(data);
    };
    loadBoards();
  }, [selectedChannel, user?.id]);

  // Auto-active photoMode dès qu'une photo est présente sur un format compatible.
  // Sinon, l'utilisateur·rice voit sa photo affichée mais le `photo_mode: true`
  // n'est jamais envoyé à l'IA → texte généré "à l'aveugle".
  useEffect(() => {
    if (formatAcceptsSinglePhoto(selectedFormat) && postPhoto.length > 0 && !photoMode) {
      setPhotoMode(true);
    }
  }, [selectedFormat, postPhoto.length]);

  // Garde-fou : si LinkedIn est déjà sélectionné et que de nouvelles initialPhotos
  // arrivent (ou qu'on a perdu des photos en chemin), on rehydrate postPhoto
  // selon la règle du format (10 pour LinkedIn, 1 pour les autres formats mono-photo).
  useEffect(() => {
    if (!initialPhotos || initialPhotos.length === 0) return;
    if (!formatAcceptsSinglePhoto(selectedFormat)) return;
    const cap = selectedFormat === "linkedin" ? 10 : 1;
    const target = initialPhotos.slice(0, cap);
    if (target.length > postPhoto.length) {
      setPostPhoto(target);
    }
  }, [initialPhotos, selectedFormat]);

  const typeEntries = Object.entries(CONTENT_TYPE_SPECS).filter(
    ([, spec]) => selectedChannel === "instagram" ? spec.channel === "instagram" : true
  );
  const priorityTypes = objective ? OBJECTIVE_RECOMMENDATIONS[objective]?.priorityTypes || [] : [];

  const { recommended, others } = selectedFormat
    ? getAnglesForType(
        // For LinkedIn carousel, use LinkedIn angles instead of Instagram carousel angles
        selectedChannel === "linkedin" && selectedFormat === "carousel" ? "linkedin" : selectedFormat,
        objective
      )
    : { recommended: [], others: [] };

  const handleFormatSelect = (id: string, opts?: { keepCarouselSubMode?: "text" | "photo" | "mix" | "pure_photo" }) => {
    if (CONTENT_TYPE_SPECS[id]?.comingSoon) return;
    const isFirstSelectionWithPhotos = !hasUserChangedFormat.current && (initialPhotos?.length ?? 0) > 0;
    hasUserChangedFormat.current = true;
    setSelectedFormat(id);
    setSelectedAngle(undefined);
    if (isFirstSelectionWithPhotos) {
      // Restore photos from initialPhotos (may have been reset by handleChangeChannel)
      setUploadedPhotos(initialPhotos!);
      setPhotoDescription(initialPhotoDescription ?? "");
      if (id === "carousel") {
        setCarouselSubMode(opts?.keepCarouselSubMode ?? "mix");
        setPhotoMode(false);
      } else if (formatAcceptsSinglePhoto(id)) {
        setCarouselSubMode(null);
        setPhotoMode(true);
        setPostPhoto(initialPhotos!.slice(0, id === "linkedin" ? 10 : 1));
        setPostPhotoDescription(initialPhotoDescription ?? "");
      } else {
        setCarouselSubMode(null);
        setPhotoMode(false);
      }
    } else {
      setCarouselSubMode(opts?.keepCarouselSubMode ?? null);
      // Préserver les photos uploadées si on entre en mode carousel mix/photo/pure_photo
      if (!(id === "carousel" && (opts?.keepCarouselSubMode === "mix" || opts?.keepCarouselSubMode === "photo" || opts?.keepCarouselSubMode === "pure_photo"))) {
        setUploadedPhotos([]);
        setPhotoDescription("");
      }
      setPhotoMode(false);
      setPostPhoto([]);
      setPostPhotoDescription("");
    }
  };

  const handleChannelSelect = (channelId: ChannelId) => {
    setSelectedChannel(channelId);
    if (channelId === "linkedin") {
      // Don't auto-select format — show sub-mode choice first
      setLinkedinSubMode(null);
      setSelectedFormat(null);
      setSelectedAngle(undefined);
    } else if (channelId === "pinterest") {
      setPinterestSubMode(null);
      setSelectedFormat(null);
      setSelectedAngle(undefined);
    } else if (channelId === "newsletter") {
      handleFormatSelect("newsletter");
    } else {
      // Instagram: reset format so user picks from sub-grid
      setSelectedFormat(null);
      setSelectedAngle(undefined);
    }
  };

  const handleChangeChannel = () => {
    hasUserChangedFormat.current = false;
    setSelectedChannel(null);
    setSelectedFormat(null);
    setSelectedAngle(undefined);
    setCarouselSubMode(null);
    setUploadedPhotos([]);
    setPhotoDescription("");
    setPhotoMode(false);
    setPostPhoto([]);
    setPostPhotoDescription("");
    setPinterestLink("");
    setPinterestBoardId("");
    setLinkedinSubMode(null);
    setPinterestSubMode(null);
    setInspirationPhotos([]);
  };

  const renderAngleCard = (angle: EditorialAngle, isRecommended: boolean) => {
    const structureId = selectedFormat ? getStructureForCombo(selectedFormat, angle.id) : null;
    const structure = structureId ? CONTENT_STRUCTURES[structureId] : null;
    const isSelected = selectedAngle === angle.id;

    return (
      <button
        key={angle.id}
        onClick={() => setSelectedAngle(isSelected ? undefined : angle.id)}
        className={`w-full text-left rounded-xl border-2 p-3 transition-all ${
          isSelected
            ? "border-primary bg-primary/5 shadow-sm"
            : "border-border bg-card hover:border-primary/40"
        } ${isRecommended ? "" : "py-2.5"}`}
      >
        <div className="flex items-start gap-2">
          <span className={isRecommended ? "text-xl" : "text-lg"}>{angle.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-foreground ${isRecommended ? "text-sm" : "text-xs"}`}>
              {angle.label}
            </p>
            {isRecommended && (
              <p className="text-xs text-muted-foreground mt-0.5">{angle.principle}</p>
            )}
            {isRecommended && structure && (
              <>
                <Badge variant="secondary" className="mt-1.5 text-[10px]">
                  Structure auto : {structure.label}
                </Badge>
                <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                  {structure.steps.slice(0, 4).map((s) => s.label).join(" → ")}
                  {structure.steps.length > 4 ? " …" : ""}
                </p>
              </>
            )}
          </div>
        </div>
      </button>
    );
  };

  const selectedStructureId = selectedFormat && selectedAngle ? getStructureForCombo(selectedFormat, selectedAngle) : null;
  const selectedStructure = selectedStructureId ? CONTENT_STRUCTURES[selectedStructureId] : null;

  // LinkedIn post en mode photo : on saute la sélection d'angle, l'IA choisit toute seule.
  const isLinkedInPhotoPost = selectedFormat === "linkedin" && photoMode;
  const showAngles = selectedFormat && selectedFormat !== "pinterest_inspiration" && !isLinkedInPhotoPost && (selectedFormat !== "carousel" || carouselSubMode !== null || selectedChannel === "linkedin");

  const handleNext = () => {
    if (!selectedFormat) return;
    // Guard: carousel requires explicit sub-mode (text/photo/mix) — sinon on tombait silencieusement sur "text"
    if (selectedFormat === "carousel" && !carouselSubMode) {
      toast.error("Choisis le type de carrousel (Texte, Photo ou Mixte) avant de continuer.");
      return;
    }
    // Guard: photo/mix mode requires at least one photo
    if (selectedFormat === "carousel" && (carouselSubMode === "photo" || carouselSubMode === "mix" || carouselSubMode === "pure_photo") && uploadedPhotos.length === 0) {
      setPhotoWarning(true);
      return;
    }
    const isCarouselPhoto = selectedFormat === "carousel" && carouselSubMode === "photo";
    const isCarouselMix = selectedFormat === "carousel" && carouselSubMode === "mix";
    const isCarouselPurePhoto = selectedFormat === "carousel" && carouselSubMode === "pure_photo";
    const isSinglePhotoFormat = formatAcceptsSinglePhoto(selectedFormat) && photoMode;
    const isLinkedInCarousel = selectedChannel === "linkedin" && selectedFormat === "carousel";
    const isInspirationPin = selectedFormat === "pinterest_inspiration";
    const pinterestData = (selectedFormat === "pinterest" || selectedFormat === "pinterest_visual") ? {
      link: pinterestLink || undefined,
      boardId: pinterestBoardId || undefined,
      boardName: pinterestBoards.find(b => b.id === pinterestBoardId)?.name || undefined,
    } : undefined;
    onNext(
      selectedFormat,
      selectedAngle,
      selectedFormat === "carousel" ? (carouselSubMode || "text") : undefined,
      isCarouselPhoto || isCarouselMix || isCarouselPurePhoto ? uploadedPhotos : isSinglePhotoFormat ? postPhoto : isInspirationPin ? inspirationPhotos : undefined,
      isCarouselPhoto || isCarouselMix || isCarouselPurePhoto ? photoDescription : isSinglePhotoFormat ? postPhotoDescription : undefined,
      formatAcceptsSinglePhoto(selectedFormat) ? photoMode : undefined,
      pinterestData,
      isLinkedInCarousel,
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Preloaded photos banner — visible only before a channel is picked.
          Once a channel is chosen, the photo state lives in the PhotoUploadZone (no duplication). */}
      {(initialPhotos?.length ?? 0) > 0 && !hasUserChangedFormat.current && !selectedChannel && (
        <div className="rounded-2xl bg-primary/5 border border-primary/10 p-3 flex items-center gap-3">
          <span className="text-lg">📸</span>
          <p className="text-sm font-medium text-foreground">
            {initialPhotos!.length} photo{initialPhotos!.length > 1 ? "s" : ""} déjà prête{initialPhotos!.length > 1 ? "s" : ""} à être utilisée{initialPhotos!.length > 1 ? "s" : ""}
          </p>
        </div>
      )}
      {/* Newsjacking format suggestion */}
      {suggestedFormat && !selectedFormat && (
        <div className="rounded-2xl bg-primary/5 border border-primary/10 p-3 flex items-center gap-3">
          <span className="text-lg">📡</span>
          <div className="flex-1">
            <p className="text-sm font-medium">L'IA te suggère : <span className="text-primary">{CONTENT_TYPE_SPECS[suggestedFormat]?.label || suggestedFormat}</span></p>
            <p className="text-xs text-muted-foreground">C'est une suggestion basée sur l'actu. Tu peux choisir un autre format.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const channel = deduceChannel(suggestedFormat);
              if (channel) setSelectedChannel(channel);
              setSelectedFormat(suggestedFormat);
            }}
          >
            Appliquer
          </Button>
        </div>
      )}
      {/* Channel selection */}
      {!selectedChannel && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">Sur quel canal publier ?</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CHANNELS.map((ch) => (
              <button
                key={ch.id}
                onClick={() => handleChannelSelect(ch.id)}
                className="rounded-xl border-2 border-border bg-card hover:border-primary/40 p-3 text-center transition-all"
              >
                <span className="text-2xl block mb-1">{ch.emoji}</span>
                <span className="text-xs font-semibold text-foreground">{ch.label}</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">{ch.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Persistent channel chip — visible once channel is chosen */}
      {selectedChannel && (() => {
        const ch = CHANNELS.find((c) => c.id === selectedChannel);
        if (!ch) return null;
        return (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 border border-border px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg">{ch.emoji}</span>
              <span className="text-sm font-semibold text-foreground truncate">{ch.label}</span>
            </div>
            <button
              type="button"
              onClick={handleChangeChannel}
              className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 shrink-0"
            >
              <ArrowLeft className="h-3 w-3" /> Changer de canal
            </button>
          </div>
        );
      })()}

      {/* Photos preloaded: discreet hint that some formats are filtered out */}
      {selectedChannel && (initialPhotos?.length ?? 0) > 0 && !selectedFormat && (
        <p className="text-xs text-muted-foreground -mt-1">
          {hasPreloadedPhotos ? (
            <>
              Quelques formats sont masqués car ils n'utilisent pas tes photos.{" "}
              <button
                type="button"
                onClick={() => setForceShowAll(true)}
                className="text-primary hover:underline"
              >
                Tout afficher quand même
              </button>
            </>
          ) : (
            <>
              Tous les formats sont affichés.{" "}
              <button
                type="button"
                onClick={() => setForceShowAll(false)}
                className="text-primary hover:underline"
              >
                Masquer ceux qui n'utilisent pas mes photos
              </button>
            </>
          )}
        </p>
      )}

      {/* LinkedIn sub-mode selection */}
      {selectedChannel === "linkedin" && !selectedFormat && (
        <div className="space-y-3 animate-fade-in">
          <p className="text-sm font-semibold text-foreground">Quel format LinkedIn ?</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              onClick={() => { setLinkedinSubMode("text"); handleFormatSelect("linkedin"); }}
              className="rounded-xl border-2 border-border bg-card hover:border-primary/40 p-3 text-center transition-all"
            >
              <span className="text-2xl block mb-1">📝</span>
              <span className="text-xs font-semibold text-foreground">Post</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">1300-2000 caractères, photo en option</p>
            </button>
            {!hasPreloadedPhotos && (
              <button
                onClick={() => { setLinkedinSubMode("carousel"); handleFormatSelect("carousel", { keepCarouselSubMode: "text" }); }}
                className="rounded-xl border-2 border-border bg-card hover:border-primary/40 p-3 text-center transition-all"
              >
                <span className="text-2xl block mb-1">🎠</span>
                <span className="text-xs font-semibold text-foreground">Carrousel texte</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">8-10 slides, design auto, .pptx téléchargeable</p>
              </button>
            )}
            <button
              onClick={() => { setLinkedinSubMode("carousel"); handleFormatSelect("carousel", { keepCarouselSubMode: "mix" }); }}
              className="rounded-xl border-2 border-border bg-card hover:border-primary/40 p-3 text-center transition-all"
            >
              <span className="text-2xl block mb-1">✨</span>
              <span className="text-xs font-semibold text-foreground">Carrousel mixte</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">Photos + texte (6-8 slides)</p>
            </button>
          </div>
        </div>
      )}

      {/* Pinterest sub-mode selection */}
      {selectedChannel === "pinterest" && !selectedFormat && (
        <div className="space-y-3 animate-fade-in">
          <p className="text-sm font-semibold text-foreground">Quel format d'épingle ?</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {!hasPreloadedPhotos && (
              <button
                onClick={() => { setPinterestSubMode("text"); handleFormatSelect("pinterest"); }}
                className="rounded-xl border-2 border-border bg-card hover:border-primary/40 p-3 text-center transition-all"
              >
                <span className="text-2xl block mb-1">📝</span>
                <span className="text-xs font-semibold text-foreground">Texte SEO</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">Titre + description SEO</p>
              </button>
            )}
            <button
              onClick={() => { setPinterestSubMode("visual"); handleFormatSelect("pinterest_visual"); }}
              className="rounded-xl border-2 border-border bg-card hover:border-primary/40 p-3 text-center transition-all"
            >
              <span className="text-2xl block mb-1">🎨</span>
              <span className="text-xs font-semibold text-foreground">Visuel</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">Infographie, checklist, schéma</p>
            </button>
            <button
              onClick={() => { setPinterestSubMode("inspiration" as any); handleFormatSelect("pinterest_inspiration"); }}
              className="rounded-xl border-2 border-border bg-card hover:border-primary/40 p-3 text-center transition-all"
            >
              <span className="text-2xl block mb-1">🔍</span>
              <span className="text-xs font-semibold text-foreground">Inspiration</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">Partir d'une épingle existante</p>
            </button>
          </div>
        </div>
      )}

      {/* Format selection (Instagram sub-grid) */}
      {selectedChannel === "instagram" && !selectedFormat && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">Quel format Instagram ?</p>
          <div className="grid grid-cols-2 gap-2">
            {typeEntries
              .filter(([id, spec]) => spec.channel === "instagram" && (!hasPreloadedPhotos || formatAcceptsSinglePhoto(id) || id === "carousel"))
              .map(([id, spec]) => {
                const isRecommended = priorityTypes.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => handleFormatSelect(id)}
                    disabled={spec.comingSoon}
                    className={`relative rounded-xl border-2 p-3 text-center transition-all ${
                      spec.comingSoon
                        ? "opacity-40 cursor-not-allowed border-border bg-muted"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <span className="text-2xl block mb-1">{spec.emoji}</span>
                    <span className="text-xs font-semibold text-foreground">{spec.label}</span>
                    {spec.comingSoon && (
                      <Badge variant="secondary" className="absolute top-1 right-1 text-[9px]">Bientôt</Badge>
                    )}
                    {isRecommended && !spec.comingSoon && (
                      <p className="text-[10px] text-primary mt-0.5">Recommandé 🎯</p>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Channel back button removed — chip at the top now handles it */}

      {/* Preloaded photos: incompatible format warning */}
      {(initialPhotos?.length ?? 0) > 0 && selectedFormat &&
        selectedFormat !== "carousel" && !formatAcceptsSinglePhoto(selectedFormat) && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2 animate-fade-in">
            <span className="text-base leading-tight">⚠</span>
            <div className="flex-1 text-sm text-amber-800">
              Ce format n'utilisera pas tes {initialPhotos!.length} photo{initialPhotos!.length > 1 ? "s" : ""} chargée{initialPhotos!.length > 1 ? "s" : ""}.
              <button
                onClick={() => handleFormatSelect("carousel")}
                className="ml-2 font-medium underline hover:no-underline"
              >
                Revenir au carrousel
              </button>
            </div>
          </div>
        )}

      {/* Single-photo formats toggle (post, reel, story, linkedin, newsletter) — hidden if photos preloaded & user hasn't changed format */}
      {formatAcceptsSinglePhoto(selectedFormat) && !((initialPhotos?.length ?? 0) > 0 && photoMode && postPhoto.length > 0) && (
        <button
          type="button"
          onClick={() => setPhotoMode(!photoMode)}
          className={cn(
            "w-full flex items-center gap-3 p-4 rounded-lg border transition-all animate-fade-in text-left",
            photoMode
              ? "bg-primary/5 border-primary/40 ring-1 ring-primary/20"
              : "bg-muted/30 border-border hover:border-primary/30"
          )}
          aria-pressed={photoMode}
        >
          <Switch checked={photoMode} onCheckedChange={setPhotoMode} className="pointer-events-none flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{getPhotoToggleCopy(selectedFormat!).title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{getPhotoToggleCopy(selectedFormat!).subtitle}</p>
          </div>
        </button>
      )}

      {/* Avertissement explicite : photo chargée mais toggle OFF → l'IA ne la verra pas */}
      {formatAcceptsSinglePhoto(selectedFormat) && postPhoto.length > 0 && !photoMode && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2 animate-fade-in">
          <span className="text-base leading-tight">⚠️</span>
          <div className="flex-1 text-sm text-amber-800">
            Ta photo est chargée mais l'IA <strong>ne la regardera pas</strong>. Active le mode photo ci-dessus pour qu'elle s'en serve.
          </div>
        </div>
      )}

      {/* Single-photo formats — preloaded photo confirmation banner — REMOVED.
          The toggle "📸 J'accompagne une photo" + the PhotoUploadZone below already convey the state. */}

      {/* Single-photo upload zone — LinkedIn accepte jusqu'à 10 photos (série / reportage / avant-après) */}
      {formatAcceptsSinglePhoto(selectedFormat) && photoMode && (
        <div className="animate-fade-in space-y-2">
          <PhotoUploadZone
            maxPhotos={selectedFormat === "linkedin" ? 5 : 1}
            initialPhotos={postPhoto.length > 0 ? postPhoto : undefined}
            initialDescription={postPhotoDescription}
            onPhotosChange={setPostPhoto}
            onDescriptionChange={setPostPhotoDescription}
            title={postPhoto.length > 0 ? `Vos photos (${postPhoto.length})` : undefined}
            compact
          />
          {selectedFormat === "linkedin" && (
            <p className="text-xs text-muted-foreground pl-1">
              💡 Jusqu'à <strong>10 photos</strong> : 1 = scène unique, 2 = <strong>avant / après</strong> (1ʳᵉ = avant, 2ᵉ = après), 3+ = <strong>série / reportage</strong> (l'IA construit un récit en plusieurs temps).
            </p>
          )}
        </div>
      )}

      {/* Carousel sub-mode — collapsed chip once chosen, full picker otherwise */}
      {selectedFormat === "carousel" &&
        (selectedChannel === "instagram" || selectedChannel === "linkedin") && (
        carouselSubMode ? (
          // Collapsed chip — replaces the full picker once a sub-mode is selected
          (() => {
            const subModeMeta = {
              text: { emoji: "📝", label: "Carrousel texte", desc: "L'IA écrit et designe les slides" },
              photo: { emoji: "📸", label: "Carrousel full photo", desc: "Photos plein écran + texte par-dessus" },
              mix: { emoji: "✨", label: "Carrousel storytelling", desc: "Photos + slides texte design" },
              pure_photo: { emoji: "🖼️", label: "Carrousel juste photo", desc: "Tes photos cadrées Insta, aucun texte par-dessus" },
            }[carouselSubMode];
            return (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 border border-border px-3 py-2 animate-fade-in">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">{subModeMeta.emoji}</span>
                  <span className="text-sm font-semibold text-foreground truncate">
                    {subModeMeta.label}
                  </span>
                  <span className="text-xs text-muted-foreground hidden sm:inline truncate">
                    · {subModeMeta.desc}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCarouselSubMode(null);
                    setUploadedPhotos([]);
                    setPhotoDescription("");
                    setPhotoWarning(false);
                  }}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 shrink-0"
                >
                  Changer
                </button>
              </div>
            );
          })()
        ) : (
          <div className="space-y-3 animate-fade-in">
            <p className="text-sm font-semibold text-foreground">Quel type de carrousel ?</p>
            <div className={`grid grid-cols-1 ${hasPreloadedPhotos ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"} gap-2`}>
              {!hasPreloadedPhotos && (
                <button
                  onClick={() => { setCarouselSubMode("text"); setUploadedPhotos([]); setPhotoDescription(""); }}
                  className="rounded-xl border-2 border-border bg-card hover:border-primary/40 p-4 text-left transition-all flex flex-col gap-1.5"
                >
                  <span className="text-2xl">📝</span>
                  <span className="text-sm font-semibold text-foreground">Carrousel texte</span>
                  <p className="text-[11px] leading-snug text-muted-foreground">L'IA écrit et designe 8-10 slides. .pptx téléchargeable.</p>
                </button>
              )}
              <button
                onClick={() => setCarouselSubMode("photo")}
                className="rounded-xl border-2 border-border bg-card hover:border-primary/40 p-4 text-left transition-all flex flex-col gap-1.5"
              >
                <span className="text-2xl">📸</span>
                <span className="text-sm font-semibold text-foreground">Carrousel full photo</span>
                <p className="text-[11px] leading-snug text-muted-foreground">Tes photos en plein écran, l'IA pose un texte court par-dessus chaque slide (+ légende).</p>
              </button>
              <button
                onClick={() => setCarouselSubMode("mix")}
                className="rounded-xl border-2 border-border bg-card hover:border-primary/40 p-4 text-left transition-all flex flex-col gap-1.5"
              >
                <span className="text-2xl">✨</span>
                <span className="text-sm font-semibold text-foreground">Carrousel storytelling</span>
                <p className="text-[11px] leading-snug text-muted-foreground">Alterne tes photos et des slides texte design, avec de l'espace blanc.</p>
              </button>
              <button
                onClick={() => setCarouselSubMode("pure_photo")}
                className="rounded-xl border-2 border-border bg-card hover:border-primary/40 p-4 text-left transition-all flex flex-col gap-1.5"
              >
                <span className="text-2xl">🖼️</span>
                <span className="text-sm font-semibold text-foreground">Carrousel juste photo</span>
                <p className="text-[11px] leading-snug text-muted-foreground">Tes photos cadrées Insta, aucun texte par-dessus. L'IA écrit juste la légende.</p>
              </button>
            </div>
          </div>
        )
      )}

      {/* Photo upload zone (carousel photo / mix / pure_photo) */}
      {(carouselSubMode === "photo" || carouselSubMode === "mix" || carouselSubMode === "pure_photo") && (
        <div className="animate-fade-in">
          <PhotoUploadZone
            maxPhotos={10}
            initialPhotos={uploadedPhotos.length > 0 ? uploadedPhotos : undefined}
            initialDescription={photoDescription}
            onPhotosChange={(photos) => {
              setUploadedPhotos(photos);
              if (photos.length > 0) setPhotoWarning(false);
            }}
            onDescriptionChange={setPhotoDescription}
            title={uploadedPhotos.length > 0 ? `Vos photos (${uploadedPhotos.length})` : undefined}
            compact={uploadedPhotos.length > 0}
          />
          {photoWarning && (
            <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2 animate-fade-in">
              <p className="text-sm text-amber-800">
                📸 Pour ce mode, il faut au moins une photo. Pas de photos sous la main ?
              </p>
              <button
                onClick={() => {
                  setCarouselSubMode("text");
                  setUploadedPhotos([]);
                  setPhotoDescription("");
                  setPhotoWarning(false);
                }}
                className="text-sm font-medium text-primary hover:underline"
              >
                → Passer en mode Texte (tu pourras toujours ajouter tes photos plus tard)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Angle selection — collapsed by default, expert override available */}
      {showAngles && !expandAngles && (
        <div className="space-y-2 animate-fade-in">
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3.5">
            <div className="flex items-start gap-2.5">
              <Wand2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-primary">L'IA va choisir l'angle parfait</p>
                <p className="text-xs text-muted-foreground mt-0.5">Selon ton idée, ton objectif et ta voix de marque.</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpandAngles(true)}
            className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors"
          >
            Choisir mon angle moi-même
          </button>
        </div>
      )}

      {showAngles && expandAngles && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Comment tu veux en parler ?</p>
              <p className="text-xs text-muted-foreground mt-0.5">Chaque approche donne un ton et une structure différente.</p>
            </div>
            <button
              type="button"
              onClick={() => { setExpandAngles(false); setSelectedAngle(undefined); }}
              className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors shrink-0"
            >
              ← Choix auto
            </button>
          </div>

          <div className="space-y-2">
            {[...recommended, ...others].map((a) => renderAngleCard(a, true))}
          </div>
        </div>
      )}

      {/* Pinterest specifics */}
      {(selectedFormat === "pinterest" || selectedFormat === "pinterest_visual") && (
        <div className="space-y-4 animate-fade-in">
          <p className="text-sm font-semibold text-foreground">Détails de l'épingle</p>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Lien de destination</label>
            <Input
              value={pinterestLink}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPinterestLink(e.target.value)}
              placeholder="https://ton-site.com/produit-ou-article"
            />
            <p className="text-[10px] text-muted-foreground">L'URL vers laquelle l'épingle renverra (page produit, article de blog…)</p>
          </div>

          {pinterestBoards.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Tableau de destination</label>
              <Select value={pinterestBoardId} onValueChange={setPinterestBoardId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un tableau" />
                </SelectTrigger>
                <SelectContent>
                  {pinterestBoards.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {pinterestBoards.length === 0 && (
            <p className="text-[10px] text-muted-foreground">Pas de tableaux configurés. Tu peux en créer dans l'espace Pinterest.</p>
          )}
        </div>
      )}

      {/* Pinterest inspiration upload */}
      {selectedFormat === "pinterest_inspiration" && (
        <div className="space-y-3 animate-fade-in">
          <p className="text-sm font-semibold text-foreground">📸 Uploade une capture d'une épingle qui t'inspire</p>
          <p className="text-xs text-muted-foreground">
            Va sur Pinterest, trouve une épingle qui cartonne sur ton mot-clé, fais une capture d'écran et uploade-la ici.
          </p>
          <PhotoUploadZone
            maxPhotos={1}
            onPhotosChange={setInspirationPhotos}
            onDescriptionChange={() => {}}
          />
        </div>
      )}

      {/* Structure info (hidden for Pinterest formats) */}
      {selectedStructure && selectedAngle && selectedChannel !== "pinterest" && (
        <div className="rounded-lg bg-muted/50 border border-border p-2.5 space-y-1 animate-fade-in">
          <p className="text-xs font-semibold text-foreground">
            Structure : {selectedStructure.label} ({selectedStructure.steps.length} étapes)
          </p>
          <ul className="space-y-0.5">
            {selectedStructure.steps.map((s, i) => (
              <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                <span className="font-mono text-primary/60">{i + 1}.</span> {s.label} — {s.desc}
              </li>
            ))}
          </ul>
        </div>
      )}


      {/* Navigation */}
      <div className="space-y-2 pt-2">
        <Button
          disabled={!selectedFormat || (selectedFormat === "pinterest_inspiration" && inspirationPhotos.length === 0)}
          onClick={handleNext}
          className="w-full gap-2"
          size="lg"
        >
          Suivant <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">
          On affinera ensuite ton brief avec quelques questions rapides.
        </p>
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 text-muted-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Retour
          </Button>
        </div>
      </div>
    </div>
  );
}
