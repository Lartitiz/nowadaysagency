import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhotoLibraryPickerDialog } from "@/components/photos/PhotoLibraryPickerDialog";
import { listStudioVideos, readStudioVideo, videoRequest, type StudioVideoJob } from "./api";

export interface VideoSource { kind: "photo" | "studio_version"; id: string; name: string }
export function StudioVideoPanel({ workspaceId, writable, initialSource, initialPrompt = "", onPickClip, showComposer = true }: {
  workspaceId: string;
  writable: boolean;
  initialSource?: VideoSource | null;
  initialPrompt?: string;
  onPickClip?: (job: StudioVideoJob) => void;
  showComposer?: boolean;
}) {
  const cache = useQueryClient();
  const [source, setSource] = useState<VideoSource | null>(initialSource || null);
  const [picker, setPicker] = useState(false);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState<"480p" | "720p">("480p");
  const [personFree, setPersonFree] = useState(false);
  const [quote, setQuote] = useState<StudioVideoJob | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [watchId, setWatchId] = useState<string | null>(null);
  const inputKey = JSON.stringify([source?.kind, source?.id, prompt.trim(), duration, resolution, personFree]);
  const currentInputKey = useRef(inputKey);
  currentInputKey.current = inputKey;
  const jobs = useQuery({ queryKey: ["studio-videos", workspaceId], queryFn: () => listStudioVideos(workspaceId), retry: 1 });
  const watched = useQuery({ queryKey: ["studio-video", workspaceId, watchId], enabled: !!watchId,
    queryFn: () => readStudioVideo(workspaceId, watchId!), retry: 1,
    refetchInterval: (query) => ["queued", "in_progress", "archiving"].includes(query.state.data?.job.status || "") ? 5000 : false });

  useEffect(() => { setQuote(null); }, [source?.kind, source?.id, prompt, duration, resolution, personFree]);
  useEffect(() => {
    if (initialSource?.id) setSource({ id: initialSource.id, kind: initialSource.kind, name: initialSource.name });
  }, [initialSource?.id, initialSource?.kind, initialSource?.name]);
  useEffect(() => {
    if (["ready", "failed", "nsfw", "canceled"].includes(watched.data?.job.status || "")) {
      void cache.invalidateQueries({ queryKey: ["studio-videos", workspaceId] });
    }
  }, [cache, watched.data?.job.status, workspaceId]);

  async function checkPrice() {
    if (!source || !personFree || prompt.trim().length < 3 || !Number.isInteger(duration) || duration < 4 || duration > 10 || busy) return;
    const requestedKey = inputKey;
    setBusy("quote"); setError("");
    try {
      const result = await videoRequest<{ job: StudioVideoJob }>({ action: "quote", workspace_id: workspaceId,
        source_kind: source.kind, source_id: source.id, prompt: prompt.trim(), duration, resolution,
        person_free_attested: true });
      if (currentInputKey.current === requestedKey) setQuote(result.job);
      await cache.invalidateQueries({ queryKey: ["studio-videos", workspaceId] });
    } catch (e) { setError(e instanceof Error ? e.message : "Le devis n’a pas pu être obtenu."); }
    finally { setBusy(""); }
  }
  async function generate() {
    if (!quote || !source || !personFree || busy || quote.source_kind !== source.kind || quote.source_id !== source.id ||
      quote.prompt !== prompt.trim() || quote.duration !== duration || quote.resolution !== resolution) return;
    setBusy("submit"); setError("");
    try {
      const result = await videoRequest<{ job: StudioVideoJob; error?: string }>({ action: "submit", workspace_id: workspaceId, job_id: quote.id });
      setQuote(null); setWatchId(result.job.id);
      if (result.error) setError(result.error);
      await cache.invalidateQueries({ queryKey: ["studio-videos", workspaceId] });
    } catch (e) { setError(e instanceof Error ? e.message : "Le lancement a échoué. Consulte les clips avant de réessayer."); }
    finally { setBusy(""); }
  }

  return (
    <section className="space-y-5" aria-label="Clips du Studio">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><Film className="h-5 w-5" /> Clips du Studio</h2>
        <p className="text-sm text-muted-foreground">Anime une image avec Seedance 2.5. Le clip reste ici, même sans Reel.</p>
      </div>
      {writable && showComposer && <div className="rounded-lg border p-4 space-y-3">
        <h3 className="font-medium">Créer un clip</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm">Image : {source?.name || "aucune sélectionnée"}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setPicker(true)}>Choisir une photo</Button>
        </div>
        <label className="block text-sm font-medium" htmlFor="studio-video-prompt">Ce qui doit bouger</label>
        <Textarea id="studio-video-prompt" value={prompt} maxLength={1000} onChange={e => setPrompt(e.target.value)}
          placeholder="Ex. La lumière traverse l’atelier, la caméra avance doucement vers le produit." />
        <div className="flex gap-3 flex-wrap">
          <label className="text-sm">Durée <Input type="number" min={4} max={10} value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-24" /></label>
          <label className="text-sm">Qualité
            <select className="block h-10 rounded-md border bg-background px-3" value={resolution} onChange={e => setResolution(e.target.value as "480p" | "720p")}
              aria-label="Qualité vidéo"><option value="480p">480p, essai économique</option><option value="720p">720p</option></select>
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={personFree} onChange={e => setPersonFree(e.target.checked)} className="mt-1" />
          <span>Je confirme que cette image ne montre aucune personne identifiable et que je peux la transmettre à Higgsfield pour obtenir le prix et créer ce clip.</span>
        </label>
        <p className="text-xs text-muted-foreground">Vérifier le prix transmet l’image à Higgsfield. La génération ne démarre qu’après le clic suivant. La voix du Reel restera dans le montage : ce clip est créé sans son.</p>
        <Button type="button" variant="outline" disabled={!source || !personFree || prompt.trim().length < 3 || !Number.isInteger(duration) || duration < 4 || duration > 10 || !!busy}
          onClick={checkPrice}>{busy === "quote" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Vérifier le prix</Button>
        {quote && <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2" role="status">
          <p className="text-sm">Devis Higgsfield : <strong>{Number(quote.estimated_usd).toFixed(2)} $</strong> pour {quote.duration} s en {quote.resolution} ({quote.estimated_credits} crédits API). Le montant est réservé dans le plafond vidéo au lancement.</p>
          <p className="text-xs text-muted-foreground">Une nouvelle tentative serait facturée séparément si ce clip est créé mais ne convient pas.</p>
          <Button type="button" disabled={!!busy || Date.parse(quote.quote_expires_at) <= Date.now()} onClick={generate}>
            {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Générer ce clip · {Number(quote.estimated_usd).toFixed(2)} $
          </Button>
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>}
      <div className="space-y-2">
        <div className="flex items-center justify-between"><h3 className="font-medium">Mes clips</h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => void jobs.refetch()} aria-label="Actualiser les clips"><RefreshCw className="h-4 w-4" /></Button></div>
        {jobs.isError && <p role="alert" className="text-sm">Impossible de charger les clips. Réessaie.</p>}
        {jobs.isLoading && <p className="text-sm">Chargement des clips…</p>}
        {jobs.data?.jobs.length === 0 && <p className="text-sm text-muted-foreground">Aucun clip conservé pour l’instant.</p>}
        {jobs.data?.jobs.map(job => {
          const current = watched.data?.job.id === job.id ? watched.data.job : job;
          return <article key={job.id} className="rounded-md border p-3 space-y-2">
            <p className="text-sm font-medium">{job.source_name} · {job.duration} s · {job.resolution}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{job.prompt}</p>
            {current.status === "ready" && current.video_url && <video src={current.video_url} controls playsInline preload="metadata" className="w-full max-w-sm rounded bg-black" />}
            {current.status === "submitting_uncertain" && <p role="status" className="text-sm text-amber-700">Réponse du fournisseur incertaine : aucune seconde génération ne sera lancée automatiquement.</p>}
            {current.status === "nsfw" && <p role="status" className="text-sm">Higgsfield a refusé ce contenu. Aucun clip n’a été facturé.</p>}
            {current.status === "failed" && <p role="status" className="text-sm">La génération a échoué. Aucun clip n’a été facturé.</p>}
            {["queued", "in_progress", "archiving"].includes(current.status) && <p role="status" className="text-sm">{current.status === "archiving" ? "Enregistrement du clip…" : "Génération en cours…"}</p>}
            {current.status !== "quoted" && current.status !== "ready" && current.status !== "submitting_uncertain" && <Button type="button" variant="outline" size="sm"
              onClick={() => { setWatchId(job.id); void readStudioVideo(workspaceId, job.id).then(() => { void jobs.refetch(); void watched.refetch(); }).catch(e => setError(e.message)); }}>
              Vérifier le résultat
            </Button>}
            {current.status === "ready" && current.video_url && onPickClip && <Button type="button" size="sm" onClick={() => onPickClip(current)}>Prévisualiser dans mon Reel</Button>}
          </article>;
        })}
      </div>
      {picker && <PhotoLibraryPickerDialog open={picker} onOpenChange={setPicker} maxSelectable={1}
        onConfirm={photos => { const photo = photos[0]; if (photo) { setSource({ kind: "photo", id: photo.id, name: photo.name || "Photo" }); setPicker(false); } }} />
      }
    </section>
  );
}
