import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { ArrowRight, Sparkles, HelpCircle, Newspaper, Camera, ArrowLeft, Repeat } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ContentCoachingDialog from "@/components/dashboard/ContentCoachingDialog";
import NewsjackingPanel from "./NewsjackingPanel";
import CreerTransformTab from "./CreerTransformTab";
import { PhotoUploadZone, type PhotoItem } from "./PhotoUploadZone";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onNext: (idea: string) => void;
  onCoachingSelect?: (data: { subject: string; format: string; objective: string; carouselSubMode?: "text" | "photo" }) => void;
  onNewsjackingSelect?: (data: { subject: string; context: string; format?: string; vehicule?: string }) => void;
  onPhotosNext?: (photos: PhotoItem[], description: string, subject: string) => void;
  workspaceId?: string;
  activite?: string;
  initialIdea?: string;
  autoOpenTransform?: boolean;
}

const ACTIVITY_PLACEHOLDERS: Record<string, string> = {
  immobilier: "Ex : je veux montrer un bien que je viens d'acquérir / je voudrais parler de pourquoi j'ai choisi le portage / j'ai envie de réagir à une actu immo...",
  marchand: "Ex : je veux montrer un bien que je viens d'acquérir / je voudrais parler de pourquoi j'ai choisi le portage / j'ai envie de réagir à une actu immo...",
  coach: "Ex : je veux partager une prise de conscience d'une cliente / je voudrais parler de pourquoi j'ai créé mon accompagnement / j'ai envie de réagir à un mythe du développement perso...",
  bien_etre: "Ex : je veux partager un rituel bien-être que j'adore / je voudrais parler de pourquoi j'ai choisi cette approche / j'ai envie de réagir à une tendance wellness...",
  coach_sportive: "Ex : je veux montrer une transformation client·e / je voudrais parler de ma méthode d'entraînement / j'ai envie de réagir à un mythe fitness...",
  artisane: "Ex : je veux montrer les nouvelles pièces que j'ai créées / je voudrais parler de pourquoi je fais ce métier / j'ai envie de réagir à une actu créa...",
  mode_textile: "Ex : je veux montrer ma dernière collection / je voudrais parler de mode éthique / j'ai envie de réagir à une tendance mode...",
  beaute_cosmetiques: "Ex : je veux montrer un nouveau soin que j'ai formulé / je voudrais parler de beauté naturelle / j'ai envie de réagir à un ingrédient controversé...",
  boutique: "Ex : je veux montrer une nouveauté en boutique / je voudrais parler de pourquoi j'ai ouvert mon shop / j'ai envie de réagir à une tendance shopping...",
  consultante: "Ex : je veux partager un cas client récent / je voudrais parler de pourquoi j'ai quitté le salariat / j'ai envie de réagir à une actu marketing...",
  formatrice: "Ex : je veux partager un retour d'atelier / je voudrais parler de ma pédagogie / j'ai envie de réagir à une actu formation...",
  art_design: "Ex : je veux montrer un projet créatif récent / je voudrais parler de mon processus artistique / j'ai envie de réagir à une expo ou une tendance design...",
  deco_interieur: "Ex : je veux montrer un chantier terminé / je voudrais parler de déco éco-responsable / j'ai envie de réagir à une tendance déco...",
};

function getPlaceholder(activite?: string): string {
  if (!activite) return "Ex : je veux montrer un projet récent / je voudrais parler de pourquoi je fais ce métier / j'ai envie de réagir à une actu...";
  const key = activite.toLowerCase();
  for (const [k, v] of Object.entries(ACTIVITY_PLACEHOLDERS)) {
    if (key.includes(k)) return v;
  }
  return "Ex : je veux montrer un projet récent / je voudrais parler de pourquoi je fais ce métier / j'ai envie de réagir à une actu...";
}

export default function CreerStepIdea({ onNext, onCoachingSelect, onNewsjackingSelect, onPhotosNext, workspaceId, activite, initialIdea, autoOpenTransform }: Props) {
  const [idea, setIdea] = useState(initialIdea || "");
  const [coachOpen, setCoachOpen] = useState(false);
  const [showNewsjacking, setShowNewsjacking] = useState(false);
  const [showPhotosMode, setShowPhotosMode] = useState(false);
  const [showTransform, setShowTransform] = useState(!!autoOpenTransform);
  const [localPhotos, setLocalPhotos] = useState<PhotoItem[]>([]);
  const [localDescription, setLocalDescription] = useState("");
  const [localPhotoSubject, setLocalPhotoSubject] = useState("");
  const { toast } = useToast();

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
              placeholder={getPlaceholder(activite)}
              rows={4}
              className="resize-none"
            />
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground flex-1 min-w-0">
                Pas besoin d'être précise : un mot-clé, une phrase, une envie.
              </p>
              <button
                type="button"
                onClick={() => setCoachOpen(true)}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0"
              >
                <HelpCircle className="h-3 w-3" /> Pas d'idée ? Laisse-toi guider
              </button>
            </div>
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
            <div className="grid sm:grid-cols-3 gap-2">
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
            </div>
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
          />

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              De quoi veux-tu parler ?
            </label>
            <Textarea
              value={localPhotoSubject}
              onChange={(e) => setLocalPhotoSubject(e.target.value)}
              placeholder={getPlaceholder(activite)}
              rows={3}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              Le message ou l'angle du post. Les questions et la rédaction s'appuieront dessus.
            </p>
          </div>

          <Button
            onClick={() => onPhotosNext?.(localPhotos, localDescription, localPhotoSubject.trim())}
            disabled={localPhotos.length === 0 || !localPhotoSubject.trim()}
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
