import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { ArrowRight, Sparkles, HelpCircle, Newspaper, Camera, ArrowLeft, Repeat, CalendarRange } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ContentCoachingDialog from "@/components/dashboard/ContentCoachingDialog";
import NewsjackingPanel from "./NewsjackingPanel";
import CreerTransformTab from "./CreerTransformTab";
import { PhotoUploadZone, type PhotoItem } from "./PhotoUploadZone";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onNext: (idea: string) => void;
  onCoachingSelect?: (data: { subject: string; format: string; objective: string; carouselSubMode?: "text" | "photo" | "mix" | "pure_photo" }) => void;
  onNewsjackingSelect?: (data: { subject: string; context: string; format?: string; vehicule?: string }) => void;
  onPhotosNext?: (photos: PhotoItem[], description: string, subject: string) => void;
  workspaceId?: string;
  initialIdea?: string;
  autoOpenTransform?: boolean;
  initialPhotos?: PhotoItem[];
  initialPhotoDescription?: string;
  initialPhotoSubject?: string;
}

const UNIVERSAL_PLACEHOLDER = "Ex : je raconte une expérience vécue / je réagis à un chiffre qui m'a marquée / j'ose un avis à contre-courant / je montre mon process en coulisses…";

export default function CreerStepIdea({ onNext, onCoachingSelect, onNewsjackingSelect, onPhotosNext, workspaceId, initialIdea, autoOpenTransform, initialPhotos, initialPhotoDescription, initialPhotoSubject }: Props) {
  const [idea, setIdea] = useState(initialIdea || "");
  const [coachOpen, setCoachOpen] = useState(false);
  const [showNewsjacking, setShowNewsjacking] = useState(false);
  const [showPhotosMode, setShowPhotosMode] = useState(!!(initialPhotos && initialPhotos.length > 0));
  const [showTransform, setShowTransform] = useState(!!autoOpenTransform);
  const [localPhotos, setLocalPhotos] = useState<PhotoItem[]>(initialPhotos || []);
  const [localDescription, setLocalDescription] = useState(initialPhotoDescription || "");
  const [localPhotoSubject, setLocalPhotoSubject] = useState(initialPhotoSubject || "");
  const { toast } = useToast();
  const navigate = useNavigate();

  // Si on arrive via un legacy redirect (?mode=transform), nettoyer le param
  // de l'URL pour éviter que le panneau ne se ré-ouvre au refresh.
  useEffect(() => {
    if (autoOpenTransform && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("mode")) {
        url.searchParams.delete("mode");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, [autoOpenTransform]);

  const exitPhotosMode = () => {
    setShowPhotosMode(false);
    setLocalPhotos([]);
    setLocalDescription("");
    setLocalPhotoSubject("");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Qu'est-ce que tu veux partager ?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Raconte ton idée en quelques mots, même vague. L'IA va t'aider à la transformer en contenu.
        </p>
      </div>

      {!showNewsjacking && !showPhotosMode && (
        <>
          {/* Subject textarea — primary path */}
          <div className="space-y-2">
            <Textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder={UNIVERSAL_PLACEHOLDER}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Pas besoin d'être précise : un mot-clé, une phrase, une envie.
            </p>

          </div>

          {/* Primary CTA */}
          <Button
            onClick={() => onNext(idea.trim())}
            disabled={!idea.trim()}
            className="w-full gap-2"
            size="lg"
          >
            Suivant <ArrowRight className="h-4 w-4" />
          </Button>
          {/* Alternative entry points — clearly visually separated */}
          <div className="pt-2">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px bg-foreground/20 flex-1" />
              <p className="text-xs uppercase tracking-wider text-foreground font-semibold">
                ou pars d'autre chose
              </p>
              <div className="h-px bg-foreground/20 flex-1" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {onPhotosNext && (
                <button
                  type="button"
                  onClick={() => setShowPhotosMode(true)}
                  className="text-left rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 p-3 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Camera className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Partir de photos</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">J'ai des photos, on construit autour.</p>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowNewsjacking(true)}
                className="text-left rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 p-3 transition-all group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Newspaper className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Surfer sur l'actu</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Réagir à une news fraîche.</p>
              </button>
              <button
                type="button"
                onClick={() => setShowTransform(true)}
                className="text-left rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 p-3 transition-all group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Repeat className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Transformer un contenu</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Recycler un post existant.</p>
              </button>
              <button
                type="button"
                onClick={() => setCoachOpen(true)}
                className="text-left rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 p-3 transition-all group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <HelpCircle className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Pas d'idée ?</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Laisse-toi guider par la coach.</p>
              </button>

            </div>
            {/* Banner: Planifier ma semaine */}
            <button
              type="button"
              onClick={() => navigate("/calendrier?coaching=1")}
              className="w-full mt-2 rounded-xl bg-rose-soft p-3 flex items-center gap-3 text-left transition-all hover:opacity-90"
            >
              <CalendarRange className="h-5 w-5 text-bordeaux shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-bordeaux">Plutôt envie de voir plus loin ?</p>
                <p className="text-xs text-bordeaux/70">L'IA te propose 5 idées pour toute ta semaine.</p>
              </div>
              <span className="bg-card text-bordeaux rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap hover:bg-card/80">
                Ma semaine →
              </span>
            </button>
          </div>
        </>
      )}

      {/* Photos-first mode */}
      {showPhotosMode && (
        <div className="space-y-4 animate-fade-in">
          <button
            type="button"
            onClick={exitPhotosMode}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Revenir au mode texte
          </button>

          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" /> Pars de tes photos
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Uploade tes photos, dis-nous de quoi tu veux parler. On choisira ensuite le format ensemble.
            </p>
          </div>

          <PhotoUploadZone
            maxPhotos={10}
            onPhotosChange={setLocalPhotos}
            onDescriptionChange={setLocalDescription}
            initialPhotos={localPhotos}
            initialDescription={localDescription}
            hideDescription
            stockSearchSeed={localPhotoSubject}
          />

          <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            De quoi veux-tu parler ? <span className="font-normal text-muted-foreground">(optionnel)</span>
          </label>
            <Textarea
              value={localPhotoSubject}
              onChange={(e) => setLocalPhotoSubject(e.target.value)}
              placeholder={UNIVERSAL_PLACEHOLDER}
              rows={3}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              Pas d'idée précise ? Laisse vide : on te posera 2-3 questions à partir de tes photos pour faire émerger ton angle.
            </p>
          </div>

          <Button
            onClick={() => onPhotosNext?.(localPhotos, localDescription, localPhotoSubject.trim())}
            disabled={localPhotos.length === 0}
            className="w-full gap-2"
          >
            Suivant <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Newsjacking panel */}
      {showNewsjacking && (
        <NewsjackingPanel
          onSelect={(data) => {
            setShowNewsjacking(false);
            toast({
              title: "📡 Actu chargée",
              description: "Choisis maintenant ton format et ton angle.",
            });
            if (onNewsjackingSelect) {
              onNewsjackingSelect(data);
            }
          }}
          onClose={() => setShowNewsjacking(false)}
          workspaceId={workspaceId}
        />
      )}

      {/* Coaching dialog */}
      <ContentCoachingDialog open={coachOpen} onOpenChange={setCoachOpen} onSelect={onCoachingSelect} onNewsjackingRedirect={() => setShowNewsjacking(true)} />

      {/* Transform sheet : panneau latéral pour recycler / crossposter / s'inspirer */}
      <Sheet open={showTransform} onOpenChange={setShowTransform}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Transformer un contenu existant</SheetTitle>
          </SheetHeader>
          <CreerTransformTab />
        </SheetContent>
      </Sheet>
    </div>
  );
}
