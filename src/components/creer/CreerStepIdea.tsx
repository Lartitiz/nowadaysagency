import { useState, useEffect, lazy, Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { ArrowRight, Camera, ArrowLeft, CalendarRange } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ContentCoachingDialog from "@/components/dashboard/ContentCoachingDialog";
// Gros panneau (recherche d'actu) chargé à la demande — pas dans le chunk initial.
const NewsjackingPanel = lazy(() => import("./NewsjackingPanel"));
import CreerTransformTab from "./CreerTransformTab";
import { PhotoUploadZone, type PhotoItem } from "./PhotoUploadZone";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";

interface Props {
  channel?: "instagram" | "linkedin" | "pinterest" | "newsletter" | null;
  onNext: (idea: string) => void;
  onIdeaChange?: (idea: string) => void;
  onPhotosChange?: (photos: PhotoItem[]) => void;
  onPhotoDescriptionChange?: (description: string) => void;
  onPhotoSubjectChange?: (subject: string) => void;
  onPhotoEntryChange?: (open: boolean) => void;
  photoEntry?: boolean;
  onCoachingSelect?: (data: { subject: string; format: string; objective: string; carouselSubMode?: "text" | "photo" | "mix" | "pure_photo"; editorialAngle?: string }) => void;
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

// Départs prêts à l'emploi : battent la page blanche pour une première création rapide.
const STARTER_IDEAS = [
  "Une erreur fréquente dans mon domaine",
  "Les coulisses de mon travail",
  "Un avis à contre-courant sur mon métier",
  "Une question qu'on me pose souvent",
  "Ce que j'aurais aimé savoir en débutant",
];

export default function CreerStepIdea({ channel, onNext, onCoachingSelect, onNewsjackingSelect, onPhotosNext, workspaceId, initialIdea, autoOpenTransform, initialPhotos, initialPhotoDescription, initialPhotoSubject, onIdeaChange, onPhotosChange, onPhotoDescriptionChange, onPhotoSubjectChange, onPhotoEntryChange, photoEntry }: Props) {
  const [fallbackIdea, setFallbackIdea] = useState(initialIdea || "");
  const [coachOpen, setCoachOpen] = useState(false);
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
  const { column, value } = useWorkspaceFilter();

  // L4 : idées personnalisées générées par le diagnostic (saved_ideas,
  // source_module="diagnostic") — remplacent les départs génériques quand elles existent.
  const [personalIdeas, setPersonalIdeas] = useState<string[]>([]);
  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase.from("saved_ideas") as any)
        .select("titre")
        .eq(column, value)
        .eq("source_module", "diagnostic")
        .eq("status", "to_explore")
        .order("created_at", { ascending: true })
        .limit(5);
      if (!cancelled && data?.length) {
        setPersonalIdeas(data.map((d: any) => d.titre).filter(Boolean));
      }
    })();
    return () => { cancelled = true; };
  }, [column, value]);

  const starterChips = personalIdeas.length > 0 ? personalIdeas : STARTER_IDEAS;

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
          <header>
            {channel && <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">{{ instagram: "Instagram", linkedin: "LinkedIn", pinterest: "Pinterest", newsletter: "Newsletter" }[channel]}</p>}
            <h1 className="font-display text-4xl sm:text-5xl text-primary leading-tight">De quoi veux-tu parler&nbsp;?</h1>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground">Une idée suffit. Tu peux aussi commencer avec tes photos.</p>
          </header>
          <div className="grid gap-8 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:gap-10">
            <div className="min-w-0">
              <div className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-7">
                <label htmlFor="creation-idea" className="block text-sm font-semibold text-primary">Ton idée</label>
                <Textarea
                  id="creation-idea"
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="Une nouveauté, les coulisses, une question de tes clientes…"
                  rows={6}
                  className="resize-y min-h-40 text-base"
                />
                {onPhotosNext && (
                  <button type="button" onClick={() => setShowPhotosMode(true)} className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-4 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4">
                    <Camera size={17} aria-hidden="true" /> Partir de photos{localPhotos.length > 0 ? ` (${localPhotos.length})` : ""}
                  </button>
                )}
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
                  <p className="max-w-56 text-xs leading-relaxed text-muted-foreground">Quelques mots suffisent pour commencer.</p>
                  <Button onClick={() => onNext(idea.trim())} disabled={!idea.trim()} className="gap-2" size="lg">
                    Continuer <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <details className="mt-5 text-sm">
                <summary className="w-fit cursor-pointer text-primary underline underline-offset-4 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4">
                  {personalIdeas.length > 0 ? "Retrouver mes idées du diagnostic" : "Essayer avec un exemple"}
                </summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {starterChips.map((s) => (
                    <button key={s} type="button" onClick={() => setIdea(s)} className="rounded-xl border border-border bg-card px-3 py-2 text-left text-xs hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                      {s}
                    </button>
                  ))}
                </div>
              </details>
            </div>
            <aside aria-label="Autres points de départ" className="min-w-0">
              <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Un autre point de départ</p>
              <div className="divide-y divide-border border-y border-border">
                {[
                  { label: "J’ai déjà du contenu", description: "Recycler, adapter ou s’inspirer d’un texte, d’un post ou d’un document.", action: () => setShowTransform(true) },
                  { label: "J’ai besoin d’une idée", description: "Quelques échanges pour trouver quoi partager.", action: () => setCoachOpen(true) },
                  { label: "Réagir à une actualité", description: "Relier une actu à ton activité.", action: () => setShowNewsjacking(true) },
                ].map(({ label, description, action }) => (
                  <button key={label} type="button" onClick={action} className="group flex w-full items-center gap-4 py-5 text-left text-primary hover:bg-rose-pale/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2">
                    <span className="min-w-0 flex-1"><span className="block text-base font-semibold">{label}</span><span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{description}</span></span>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card group-hover:border-primary/40"><ArrowRight size={17} aria-hidden="true" /></span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => navigate("/calendrier?coaching=1")} className="mt-6 flex items-center gap-2 rounded-sm text-sm text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4">
                <CalendarRange size={17} aria-hidden="true" /> Préparer ma semaine
              </button>
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
          <label htmlFor="creation-photo-subject" className="text-sm font-medium text-foreground">
            De quoi veux-tu parler ? <span className="font-normal text-muted-foreground">(optionnel)</span>
          </label>
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
