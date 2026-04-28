import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Badge } from "@/components/ui/badge";
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
  onPhotosNext?: (photos: PhotoItem[], description: string) => void;
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

export default function CreerStepIdea({ onNext, onCoachingSelect, onNewsjackingSelect, onPhotosNext, workspaceId, activite, initialIdea }: Props) {
  const [idea, setIdea] = useState(initialIdea || "");
  const [coachOpen, setCoachOpen] = useState(false);
  const [showNewsjacking, setShowNewsjacking] = useState(false);
  const [showPhotosMode, setShowPhotosMode] = useState(false);
  const [localPhotos, setLocalPhotos] = useState<PhotoItem[]>([]);
  const [localDescription, setLocalDescription] = useState("");
  const { toast } = useToast();

  const exitPhotosMode = () => {
    setShowPhotosMode(false);
    setLocalPhotos([]);
    setLocalDescription("");
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
          {/* Subject textarea */}
          <div className="space-y-2">
            <Textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder={getPlaceholder(activite)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">Pas besoin d'être précise : un mot-clé, une phrase, une envie. L'outil te guide ensuite.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => setCoachOpen(true)}
              >
                <HelpCircle className="h-3.5 w-3.5" /> Aide-moi à trouver une idée
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => setShowNewsjacking(true)}
              >
                <Newspaper className="h-3.5 w-3.5" /> Surfer sur l'actu
              </Button>
              {onPhotosNext && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => setShowPhotosMode(true)}
                >
                  <Camera className="h-3.5 w-3.5" /> Partir de photos
                </Button>
              )}
            </div>
          </div>

          {/* Next button */}
          <Button
            onClick={() => onNext(idea.trim())}
            disabled={!idea.trim()}
            className="w-full gap-2"
          >
            Suivant <ArrowRight className="h-4 w-4" />
          </Button>
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
              Uploade tes photos et leur contexte. On choisira ensuite le format ensemble.
            </p>
          </div>

          <PhotoUploadZone
            maxPhotos={10}
            onPhotosChange={setLocalPhotos}
            onDescriptionChange={setLocalDescription}
            initialPhotos={localPhotos}
            initialDescription={localDescription}
          />

          <Button
            onClick={() => onPhotosNext?.(localPhotos, localDescription)}
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
    </div>
  );
}
