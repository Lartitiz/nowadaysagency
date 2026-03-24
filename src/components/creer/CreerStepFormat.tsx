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
  { id: "pinterest" as const, emoji: "📌", label: "Pinterest", desc: "Épingle texte ou visuelle" },
  { id: "newsletter" as const, emoji: "📧", label: "Newsletter", desc: "Email long format" },
];

type ChannelId = "instagram" | "linkedin" | "pinterest" | "newsletter";

function deduceChannel(format: string): ChannelId {
  if (format === "linkedin") return "linkedin";
  if (format === "pinterest" || format === "pinterest_visual" || format === "pinterest_inspiration") return "pinterest";
  if (format === "newsletter") return "newsletter";
  return "instagram";
}

interface Props {
  idea: string;
  objective?: string;
  initialFormat?: string;
  suggestedFormat?: string;
  onNext: (format: string, editorialAngle?: string, carouselSubMode?: "text" | "photo" | "mix", photos?: PhotoItem[], photoDescription?: string, photoMode?: boolean, pinterestData?: { link?: string; boardId?: string; boardName?: string }, linkedinCarousel?: boolean) => void;
  onBack: () => void;
}

export default function CreerStepFormat({ idea, objective, initialFormat, suggestedFormat, onNext, onBack }: Props) {
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
  const [pinterestSubMode, setPinterestSubMode] = useState<"text" | "visual" | "inspiration" | null>(null);
  const [inspirationPhotos, setInspirationPhotos] = useState<PhotoItem[]>([]);
  const [photoWarning, setPhotoWarning] = useState(false);

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
    ? getAnglesForType(
        // For LinkedIn carousel, use LinkedIn angles instead of Instagram carousel angles
        selectedChannel === "linkedin" && selectedFormat === "carousel" ? "linkedin" : selectedFormat,
        objective
      )
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

  const showAngles = selectedFormat && selectedFormat !== "pinterest_inspiration" && (selectedFormat !== "carousel" || carouselSubMode !== null || selectedChannel === "linkedin");

  const handleNext = () => {
    if (!selectedFormat) return;
    // Guard: photo/mix mode requires at least one photo
    if (selectedFormat === "carousel" && (carouselSubMode === "photo" || carouselSubMode === "mix") && uploadedPhotos.length === 0) {
      setPhotoWarning(true);
      return;
    }
    const isCarouselPhoto = selectedFormat === "carousel" && carouselSubMode === "photo";
    const isCarouselMix = selectedFormat === "carousel" && carouselSubMode === "mix";
    const isPostPhoto = selectedFormat === "post" && photoMode;
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
      isCarouselPhoto || isCarouselMix ? uploadedPhotos : isPostPhoto ? postPhoto : isInspirationPin ? inspirationPhotos : undefined,
      isCarouselPhoto || isCarouselMix ? photoDescription : isPostPhoto ? postPhotoDescription : undefined,
      selectedFormat === "post" ? photoMode : undefined,
      pinterestData,
      isLinkedInCarousel,
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
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

      {/* LinkedIn sub-mode selection */}
      {selectedChannel === "linkedin" && !selectedFormat && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <button
              onClick={handleChangeChannel}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Changer de canal
            </button>
          </div>
          <p className="text-sm font-semibold text-foreground">Quel format LinkedIn ?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setLinkedinSubMode("text"); handleFormatSelect("linkedin"); }}
              className="rounded-xl border-2 border-border bg-card hover:border-primary/40 p-3 text-center transition-all"
            >
              <span className="text-2xl block mb-1">📝</span>
              <span className="text-xs font-semibold text-foreground">Post texte</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">1300-2000 caractères</p>
            </button>
            <button
              onClick={() => { setLinkedinSubMode("carousel"); handleFormatSelect("carousel"); }}
              className="rounded-xl border-2 border-border bg-card hover:border-primary/40 p-3 text-center transition-all"
            >
              <span className="text-2xl block mb-1">🎠</span>
              <span className="text-xs font-semibold text-foreground">Carrousel PDF</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">8-10 slides téléchargeables</p>
            </button>
          </div>
        </div>
      )}

      {/* Pinterest sub-mode selection */}
      {selectedChannel === "pinterest" && !selectedFormat && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <button
              onClick={handleChangeChannel}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Changer de canal
            </button>
          </div>
          <p className="text-sm font-semibold text-foreground">Quel format d'épingle ?</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              onClick={() => { setPinterestSubMode("text"); handleFormatSelect("pinterest"); }}
              className="rounded-xl border-2 border-border bg-card hover:border-primary/40 p-3 text-center transition-all"
            >
              <span className="text-2xl block mb-1">📝</span>
              <span className="text-xs font-semibold text-foreground">Texte</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">Titre + description SEO</p>
            </button>
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

      {/* Carousel sub-mode (Instagram only) */}
      {selectedFormat === "carousel" && selectedChannel === "instagram" && (
        <div className="space-y-3 animate-fade-in">
          <p className="text-sm font-semibold text-foreground">Quel type de carrousel ?</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
            onPhotosChange={(photos) => {
              setUploadedPhotos(photos);
              if (photos.length > 0) setPhotoWarning(false);
            }}
            onDescriptionChange={setPhotoDescription}
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

      {/* Angle selection */}
      {showAngles && (
        <div className="space-y-3 animate-fade-in">
          <div>
            <p className="text-sm font-semibold text-foreground">Comment tu veux en parler ?</p>
            <p className="text-xs text-muted-foreground mt-0.5">Chaque approche donne un ton et une structure différente à ton contenu. Pas sûre ? Laisse l'outil choisir.</p>
          </div>

          <button
            className="w-full rounded-xl border-2 border-primary/30 bg-primary/5 p-3 text-center transition-all hover:border-primary/50 hover:bg-primary/10"
            onClick={handleNext}
          >
            <div className="flex items-center justify-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-primary">L'outil choisit pour moi</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">L'IA sélectionne la meilleure approche selon ton idée et ton objectif</p>
          </button>

          {recommended.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-primary">📌 Recommandées pour ton objectif</p>
              {recommended.map((a) => renderAngleCard(a, true))}
            </div>
          )}

          {others.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Autres approches</p>
              {others.map((a) => renderAngleCard(a, false))}
            </div>
          )}
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
      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </Button>
        <Button
          size="sm"
          disabled={!selectedFormat || (selectedFormat === "pinterest_inspiration" && inspirationPhotos.length === 0)}
          onClick={handleNext}
          className="gap-1"
        >
          Suivant <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
