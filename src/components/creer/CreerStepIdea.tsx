import { useState, useEffect, lazy, Suspense, type ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { ArrowRight, Camera, ArrowLeft } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ContentCoachingDialog from "@/components/dashboard/ContentCoachingDialog";
import StoryQuestionsDialog from "./StoryQuestionsDialog";
import type { StoryAnswer } from "@/features/creer/story/story-answers";
// Gros panneau (recherche d'actu) chargé à la demande — pas dans le chunk initial.
const NewsjackingPanel = lazy(() => import("./NewsjackingPanel"));
import CreerTransformTab from "./CreerTransformTab";
import { PhotoUploadZone, type PhotoItem } from "./PhotoUploadZone";
import { toast } from "sonner";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHideAppBreadcrumb } from "@/lib/app-breadcrumb";
import { IdeaPicks } from "./CreerIdeaPicks";
import { fetchIdeasToDevelop } from "@/lib/ideas-to-develop";
import type { IdeaToCreate } from "@/lib/idea-create-link";

interface Props {
  initialFormat?: string | null;
  channel?: "instagram" | "linkedin" | "pinterest" | "newsletter" | null;
  /** ideaId : fiche de l'idée du diagnostic choisie telle quelle (le contenu s'y enregistre). */
  onNext: (idea: string, ideaId?: string) => void;
  /** Idée de Mes idées choisie d'un clic : même chemin que « Créer ce contenu » (chantier S). */
  onPickIdea?: (idea: IdeaToCreate) => void;
  onIdeaChange?: (idea: string) => void;
  onPhotosChange?: (photos: PhotoItem[]) => void;
  onPhotoDescriptionChange?: (description: string) => void;
  onPhotoSubjectChange?: (subject: string) => void;
  onPhotoEntryChange?: (open: boolean) => void;
  photoEntry?: boolean;
  onCoachingSelect?: (data: { subject: string; format: string; objective: string; canal?: string; carouselSubMode?: "text" | "photo" | "mix" | "pure_photo"; editorialAngle?: string }) => void;
  onNewsjackingSelect?: (data: { subject: string; context: string; format?: string; vehicule?: string }) => void;
  onPhotosNext?: (photos: PhotoItem[], description: string, subject: string) => void;
  workspaceId?: string;
  initialIdea?: string;
  autoOpenTransform?: boolean;
  initialPhotos?: PhotoItem[];
  initialPhotoDescription?: string;
  initialPhotoSubject?: string;
  /** Boutons Annuler / Rétablir, posés sur la ligne du titre du champ : leur
      apparition ne décale plus « Continuer » (passe du 16/10). */
  historyControls?: ReactNode;
  /** « Je te pose des questions » : idée tirée de son histoire, et ses réponses pour l'écriture. */
  onStoryTaken?: (subject: string, answers: StoryAnswer[]) => void;
}

const UNIVERSAL_PLACEHOLDER = "Ex : je raconte une expérience vécue / je réagis à un chiffre qui m'a marquée / j'ose un avis à contre-courant / je montre mon process en coulisses…";

// Départs prêts à l'emploi : battent la page blanche pour une première création rapide.
const STARTER_IDEAS = [
  "Une erreur fréquente dans mon domaine",
  "Les coulisses de mon travail",
  "Un avis à contre-courant sur mon métier",
  "Une question qu'on me pose souvent",
  "Ce que j'aurais aimé savoir en débutant",
];

export default function CreerStepIdea({ initialFormat, channel, onNext, onPickIdea, onCoachingSelect, onNewsjackingSelect, onPhotosNext, workspaceId, initialIdea, autoOpenTransform, initialPhotos, initialPhotoDescription, initialPhotoSubject, onIdeaChange, onPhotosChange, onPhotoDescriptionChange, onPhotoSubjectChange, onPhotoEntryChange, photoEntry, historyControls, onStoryTaken }: Props) {
  const [fallbackIdea, setFallbackIdea] = useState(initialIdea || "");
  const [coachOpen, setCoachOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [showNewsjacking, setShowNewsjacking] = useState(false);
  const [fallbackPhotoEntry, setFallbackPhotoEntry] = useState(!!(initialPhotos && initialPhotos.length > 0));
  const [showTransform, setShowTransform] = useState(!!autoOpenTransform);
  const [fallbackPhotos, setFallbackPhotos] = useState<PhotoItem[]>(initialPhotos || []);
  const [fallbackDescription, setFallbackDescription] = useState(initialPhotoDescription || "");
  const [fallbackPhotoSubject, setFallbackPhotoSubject] = useState(initialPhotoSubject || "");
  // The creator owns the draft, including explicit empty values and async photos.
  // Standalone callers can still use the historical initial-value API.
  const idea = onIdeaChange ? initialIdea ?? "" : fallbackIdea;
  const setIdea = onIdeaChange ?? setFallbackIdea;
  const localPhotos = onPhotosChange ? initialPhotos ?? [] : fallbackPhotos;
  const setLocalPhotos = onPhotosChange ?? setFallbackPhotos;
  const localDescription = onPhotoDescriptionChange ? initialPhotoDescription ?? "" : fallbackDescription;
  const setLocalDescription = onPhotoDescriptionChange ?? setFallbackDescription;
  const localPhotoSubject = onPhotoSubjectChange ? initialPhotoSubject ?? "" : fallbackPhotoSubject;
  const setLocalPhotoSubject = onPhotoSubjectChange ?? setFallbackPhotoSubject;
  const showPhotosMode = onPhotoEntryChange ? !!photoEntry : fallbackPhotoEntry;
  const setShowPhotosMode = onPhotoEntryChange ?? setFallbackPhotoEntry;
  const navigate = useNavigate();
  // Écran épuré (14/11/2026) : le fil « Accueil › Créer un contenu » doublait le menu.
  useHideAppBreadcrumb();
  const { column, value } = useWorkspaceFilter();

  // Idées encore sans contenu (celles du diagnostic d'abord), montrées sans
  // repli sous le champ (chantier S, 18/10) ; sinon les départs génériques.
  const [personalIdeas, setPersonalIdeas] = useState<IdeaToCreate[]>([]);
  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    fetchIdeasToDevelop(column, value).then((ideas) => { if (!cancelled) setPersonalIdeas(ideas); });
    return () => { cancelled = true; };
  }, [column, value]);
  const isMobile = useIsMobile();
  const ideaPicks = personalIdeas.length > 0 && (
    <IdeaPicks ideas={personalIdeas} max={3} onPick={(p) => (onPickIdea ? onPickIdea(p) : setIdea(p.titre))} />
  );
  // Idée reprise telle quelle → le contenu s'enregistre dans sa fiche
  // (sinon elle reste « à placer » une fois le contenu fait, passe du 16/10).
  const pickedIdeaId = personalIdeas.find((p) => p.titre === idea.trim())?.id;

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
    // Returning to the text entry is navigation, not a request to delete photos.
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {!showNewsjacking && !showPhotosMode && (
        <>
          {/* Écran épuré (14/11/2026, maquette validée par Laetitia) : le titre, le champ
              et « Continuer » d'abord ; plus de canal, de phrase d'aide ni de descriptions. */}
          <h1 className="font-display text-3xl sm:text-4xl text-primary leading-tight">De quoi veux-tu parler&nbsp;?</h1>
          <div className="grid gap-8 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] md:gap-10">
            <div className="min-w-0">
              <label htmlFor="creation-idea" className="sr-only">Ton idée</label>
              <div className="space-y-4 rounded-2xl border-2 border-primary/70 bg-card p-4 sm:p-5 focus-within:border-primary">
                {historyControls && <div className="flex min-h-7 flex-wrap items-center justify-end gap-2">{historyControls}</div>}
                <Textarea
                  id="creation-idea"
                  data-testid="creer-idea-input"
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="Une nouveauté, les coulisses, une question de tes clientes…"
                  rows={ideaPicks && isMobile ? 3 : 5}
                  className={`resize-y border-0 px-1 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 max-h-[40vh] overflow-y-auto ${ideaPicks && isMobile ? "min-h-24" : "min-h-32"}`}
                />
                {/* Dès qu'elle écrit, les idées s'effacent : elles poussaient « Continuer » hors de l'écran du téléphone (audit du 01/11). */}
                {isMobile && !idea.trim() && ideaPicks}
                <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                  {onPhotosNext ? (
                    // Entrée photos à côté de « Continuer » (passe Auriana du 12/11 : il faut
                    // la voir ; 14/11 : bouton discret pour laisser « Continuer » en premier).
                    <button
                      type="button"
                      onClick={() => {
                        // L'idée déjà tapée devient le sujet des photos : elle se perdait
                        // au clic (test LinkedIn d'Auriana, 12/11/2026).
                        if (idea.trim() && !localPhotoSubject.trim()) setLocalPhotoSubject(idea.trim());
                        setShowPhotosMode(true);
                      }}
                      data-testid="creer-start-photos"
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/50 hover:bg-rose-pale/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                    >
                      <Camera size={17} aria-hidden="true" />
                      <span>Partir de photos{localPhotos.length > 0 ? <span className="font-normal"> ({localPhotos.length} ajoutée{localPhotos.length > 1 ? "s" : ""})</span> : null}</span>
                    </button>
                  ) : <span />}
                  <Button onClick={() => onNext(idea.trim(), pickedIdeaId)} disabled={!idea.trim()} className="w-full gap-2 sm:w-auto" size="lg" data-testid="creer-idea-next">
                    Continuer <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {!ideaPicks && <details className="mt-5 text-sm">
                <summary className="w-fit cursor-pointer text-primary underline underline-offset-4 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4">
                  Essayer avec un exemple
                </summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {STARTER_IDEAS.map((s) => (
                    <button key={s} type="button" onClick={() => setIdea(s)} className="rounded-xl border border-border bg-card px-3 py-2 text-left text-xs hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                      {s}
                    </button>
                  ))}
                </div>
              </details>}
            </div>
            <aside aria-label="Autres points de départ" className="min-w-0">
              {!isMobile && ideaPicks && <div className="mb-8">{ideaPicks}</div>}
              <p className="mb-2 text-sm text-muted-foreground">Ou bien</p>
              <div className="divide-y divide-border border-t border-border">
                {[
                  // Demande de Laetitia (14/11/2026) : des posts storytelling qui fonctionnent.
                  ...(onStoryTaken ? [{ label: "Je te pose des questions pour trouver l’inspiration", action: () => setStoryOpen(true) }] : []),
                  { label: "J’ai déjà du contenu", action: () => setShowTransform(true) },
                  { label: "J’ai besoin d’une idée", action: () => setCoachOpen(true) },
                  { label: "Réagir à une actualité", action: () => setShowNewsjacking(true) },
                  { label: "Préparer ma semaine", action: () => navigate("/calendrier?coaching=1") },
                ].map(({ label, action }) => (
                  <button key={label} type="button" onClick={action} className="group flex w-full items-center justify-between gap-3 px-1 py-3 text-left text-sm font-medium text-primary hover:bg-rose-pale/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2">
                    <span>{label}</span>
                    <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </button>
                ))}
              </div>
            </aside>
          </div>
        </>
      )}

      {/* Photos-first mode */}
      {showPhotosMode && (
        <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
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
              Ajoute tes photos, puis choisis le format. Le sujet est optionnel.
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
          <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
            <label htmlFor="creation-photo-subject" className="text-sm font-medium text-foreground">
              De quoi veux-tu parler ? <span className="font-normal text-muted-foreground">(optionnel)</span>
            </label>
            {historyControls}
          </div>
            <Textarea
              id="creation-photo-subject"
              value={localPhotoSubject}
              onChange={(e) => setLocalPhotoSubject(e.target.value)}
              placeholder={UNIVERSAL_PLACEHOLDER}
              rows={3}
              className="resize-none"
            />
            <p className="text-2xs text-muted-foreground">
              Tu peux laisser ce champ vide : tes photos serviront de point de départ.
            </p>
          </div>

          <Button
            onClick={() => onPhotosNext?.(localPhotos, localDescription, localPhotoSubject.trim())}
            disabled={localPhotos.length === 0}
            className="w-full gap-2"
          >
            Suivant <ArrowRight className="h-4 w-4" />
          </Button>
          {localPhotos.length === 0 && (
            <p className="text-xs text-muted-foreground text-center -mt-1">
              Ajoute au moins une photo pour continuer.
            </p>
          )}
        </div>
      )}

      {/* Newsjacking panel */}
      {showNewsjacking && (
        <Suspense fallback={<div className="py-12 flex justify-center"><Spinner className="h-8 w-8" /></div>}>
        <div className="max-w-2xl mx-auto"><NewsjackingPanel
          onSelect={(data) => {
            setShowNewsjacking(false);
            toast("📡 Actu chargée", {
              description: "Choisis maintenant ton format et ton angle.",
            });
            if (onNewsjackingSelect) {
              onNewsjackingSelect(data);
            }
          }}
          onClose={() => setShowNewsjacking(false)}
          workspaceId={workspaceId}
        /></div>
        </Suspense>
      )}

      {/* Coaching dialog */}
      <ContentCoachingDialog initialFormat={initialFormat} initialChannel={channel} open={coachOpen} onOpenChange={setCoachOpen} onSelect={onCoachingSelect} onNewsjackingRedirect={() => setShowNewsjacking(true)} />

      {onStoryTaken && (
        <StoryQuestionsDialog
          open={storyOpen}
          onOpenChange={setStoryOpen}
          workspaceId={workspaceId}
          onKeep={(subject, answers) => { setIdea(subject); onStoryTaken(subject, answers); }}
        />
      )}

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
