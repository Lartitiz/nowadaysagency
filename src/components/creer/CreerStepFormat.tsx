import { useState, useEffect } from "react";
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

const CHANNELS = [
  { id: "instagram" as const, emoji: "📸", label: "Instagram", desc: "Carrousel, Reel, Story, Post" },
  { id: "linkedin" as const, emoji: "💼", label: "LinkedIn", desc: "Post texte professionnel" },
  { id: "pinterest" as const, emoji: "📌", label: "Pinterest", desc: "Épingle titre + description SEO" },
  { id: "newsletter" as const, emoji: "📧", label: "Newsletter", desc: "Email long format" },
];

type ChannelId = "instagram" | "linkedin" | "pinterest" | "newsletter";

function deduceChannel(format: string): ChannelId {
  if (format === "linkedin") return "linkedin";
  if (format === "pinterest") return "pinterest";
  if (format === "newsletter") return "newsletter";
  return "instagram";
}

interface Props {
  idea: string;
  objective?: string;
  initialFormat?: string;
  onNext: (format: string, editorialAngle?: string, carouselSubMode?: "text" | "photo" | "mix", photos?: PhotoItem[], photoDescription?: string, photoMode?: boolean, pinterestData?: { link?: string; boardId?: string; boardName?: string }, linkedinCarousel?: boolean) => void;
  onBack: () => void;
}

export default function CreerStepFormat({ idea, objective, initialFormat, onNext, onBack }: Props) {
  const [selectedChannel, setSelectedChannel] = useState<ChannelId | null>(
    initialFormat ? deduceChannel(initialFormat) : null
  );
  const [selectedFormat, setSelectedFormat] = useState<string | null>(initialFormat || null);
  const [selectedAngle, setSelectedAngle] = useState<string | undefined>(undefined);
  const [carouselSubMode, setCarouselSubMode] = useState<"text" | "photo" | "mix" | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<PhotoItem[]>([]);
  const [photoDescription, setPhotoDescription] = useState("");
  const [photoMode, setPhotoMode] = useState(false);
  const [postPhoto, setPostPhoto] = useState<PhotoItem[]>([]);
  const [postPhotoDescription, setPostPhotoDescription] = useState("");
  const [pinterestLink, setPinterestLink] = useState("");
  const [pinterestBoardId, setPinterestBoardId] = useState("");
  const [pinterestBoards, setPinterestBoards] = useState<{ id: string; name: string }[]>([]);
  const [linkedinSubMode, setLinkedinSubMode] = useState<"text" | "carousel" | null>(null);

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

  const typeEntries = Object.entries(CONTENT_TYPE_SPECS).filter(
    ([, spec]) => selectedChannel === "instagram" ? spec.channel === "instagram" : true
  );
  const priorityTypes = objective ? OBJECTIVE_RECOMMENDATIONS[objective]?.priorityTypes || [] : [];

  const { recommended, others } = selectedFormat
    ? getAnglesForType(selectedFormat, objective)
    : { recommended: [], others: [] };

  const handleFormatSelect = (id: string) => {
    if (CONTENT_TYPE_SPECS[id]?.comingSoon) return;
    setSelectedFormat(id);
    setSelectedAngle(undefined);
    setCarouselSubMode(null);
    setUploadedPhotos([]);
    setPhotoDescription("");
    setPhotoMode(false);
    setPostPhoto([]);
    setPostPhotoDescription("");
  };

  const handleChannelSelect = (channelId: ChannelId) => {
    setSelectedChannel(channelId);
    if (channelId === "linkedin") {
      // Don't auto-select format — show sub-mode choice first
      setLinkedinSubMode(null);
      setSelectedFormat(null);
      setSelectedAngle(undefined);
    } else if (channelId === "pinterest") {
      handleFormatSelect("pinterest");
    } else if (channelId === "newsletter") {
      handleFormatSelect("newsletter");
    } else {
      // Instagram: reset format so user picks from sub-grid
      setSelectedFormat(null);
      setSelectedAngle(undefined);
    }
  };

  const handleChangeChannel = () => {
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

  const showAngles = selectedFormat && (selectedFormat !== "carousel" || carouselSubMode !== null);

  const handleNext = () => {
    if (!selectedFormat) return;
    const isCarouselPhoto = selectedFormat === "carousel" && carouselSubMode === "photo";
    const isCarouselMix = selectedFormat === "carousel" && carouselSubMode === "mix";
    const isPostPhoto = selectedFormat === "post" && photoMode;
    const pinterestData = selectedFormat === "pinterest" ? {
      link: pinterestLink || undefined,
      boardId: pinterestBoardId || undefined,
      boardName: pinterestBoards.find(b => b.id === pinterestBoardId)?.name || undefined,
    } : undefined;
    onNext(
      selectedFormat,
      selectedAngle,
      selectedFormat === "carousel" ? (carouselSubMode || "text") : undefined,
      isCarouselPhoto || isCarouselMix ? uploadedPhotos : isPostPhoto ? postPhoto : undefined,
      isCarouselPhoto || isCarouselMix ? photoDescription : isPostPhoto ? postPhotoDescription : undefined,
      selectedFormat === "post" ? photoMode : undefined,
      pinterestData,
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
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

      {/* Format selection (Instagram sub-grid) */}
      {selectedChannel === "instagram" && !selectedFormat && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleChangeChannel}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Changer de canal
            </button>
          </div>
          <p className="text-sm font-semibold text-foreground">Quel format Instagram ?</p>
          <div className="grid grid-cols-2 gap-2">
            {typeEntries
              .filter(([, spec]) => spec.channel === "instagram")
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

      {/* Channel back button when format is selected */}
      {selectedChannel && selectedFormat && (
        <div>
          <button
            onClick={handleChangeChannel}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Changer de canal
          </button>
        </div>
      )}

      {/* Post photo toggle */}
      {selectedFormat === "post" && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border animate-fade-in">
          <Switch checked={photoMode} onCheckedChange={setPhotoMode} />
          <div>
            <p className="text-sm font-medium text-foreground">📸 J'accompagne une photo</p>
            <p className="text-xs text-muted-foreground">L'IA adapte ta légende à ton image</p>
          </div>
        </div>
      )}

      {/* Post photo upload */}
      {selectedFormat === "post" && photoMode && (
        <div className="animate-fade-in">
          <PhotoUploadZone
            maxPhotos={1}
            onPhotosChange={setPostPhoto}
            onDescriptionChange={setPostPhotoDescription}
          />
        </div>
      )}

      {/* Carousel sub-mode */}
      {selectedFormat === "carousel" && (
        <div className="space-y-3 animate-fade-in">
          <p className="text-sm font-semibold text-foreground">Quel type de carrousel ?</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => { setCarouselSubMode("text"); setUploadedPhotos([]); setPhotoDescription(""); }}
              className={`rounded-xl border-2 p-3 text-center transition-all ${
                carouselSubMode === "text"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <span className="text-2xl block mb-1">📝</span>
              <span className="text-xs font-semibold text-foreground">Texte</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">L'IA rédige et designe</p>
            </button>
            <button
              onClick={() => setCarouselSubMode("photo")}
              className={`rounded-xl border-2 p-3 text-center transition-all ${
                carouselSubMode === "photo"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <span className="text-2xl block mb-1">📸</span>
              <span className="text-xs font-semibold text-foreground">Photo</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">Tes photos en plein écran</p>
            </button>
            <button
              onClick={() => setCarouselSubMode("mix")}
              className={`rounded-xl border-2 p-3 text-center transition-all ${
                carouselSubMode === "mix"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <span className="text-2xl block mb-1">✨</span>
              <span className="text-xs font-semibold text-foreground">Mixte</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">Photos intégrées + slides texte</p>
            </button>
          </div>
        </div>
      )}

      {/* Photo upload zone (carousel photo mode) */}
      {(carouselSubMode === "photo" || carouselSubMode === "mix") && (
        <div className="animate-fade-in">
          <PhotoUploadZone
            maxPhotos={10}
            onPhotosChange={setUploadedPhotos}
            onDescriptionChange={setPhotoDescription}
          />
        </div>
      )}

      {/* Angle selection */}
      {showAngles && (
        <div className="space-y-3 animate-fade-in">
          <p className="text-sm font-semibold text-foreground">Précise ton angle</p>

          {recommended.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-primary">📌 Recommandés</p>
              {recommended.map((a) => renderAngleCard(a, true))}
            </div>
          )}

          {others.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Autres angles</p>
              {others.map((a) => renderAngleCard(a, false))}
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 text-muted-foreground"
            onClick={() => setSelectedAngle(undefined)}
          >
            <Wand2 className="h-3.5 w-3.5" /> L'outil choisit pour moi
          </Button>
        </div>
      )}

      {/* Pinterest specifics */}
      {selectedFormat === "pinterest" && (
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

      {/* Structure info */}
      {selectedStructure && selectedAngle && (
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
      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </Button>
        <Button
          size="sm"
          disabled={!selectedFormat}
          onClick={handleNext}
          className="gap-1"
        >
          Suivant <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
