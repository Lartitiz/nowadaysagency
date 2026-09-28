import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VideoImagePicker } from "./VideoImagePicker";
import { readVideoDraft, writeVideoDraft, sourceKey, type VideoSource, type VideoReference } from "./sources";
export type { VideoSource } from "./sources";
import { listStudioVideos, readStudioVideo, videoRequest, type StudioVideoJob } from "./api";

interface Props {
  workspaceId: string; writable: boolean; initialSource?: VideoSource | null;
  initialPrompt?: string; onPickClip?: (job: StudioVideoJob) => void;
  showComposer?: boolean; draftKey?: string;
}
export function StudioVideoPanel(props: Props) {
  return <VideoComposer key={`${props.workspaceId}:${props.draftKey || "default"}`} {...props} />;
}
function VideoComposer({ workspaceId, writable, initialSource, initialPrompt = "", onPickClip, showComposer = true, draftKey }: Props) {
  const cache = useQueryClient();
  const [draft] = useState(() => readVideoDraft(draftKey));
  const [references, setReferences] = useState<VideoReference[]>(draft?.images || (initialSource ? [{ ...initialSource, role: "subject" }] : []));
  const [useImages, setUseImages] = useState(draft?.useImages ?? !!initialSource);
  const mode = !useImages ? "text" : references.length > 1 ? "references" : "image";
  const source = references[0];
  const [picker, setPicker] = useState(false);
  const [prompt, setPrompt] = useState(draft?.prompt ?? initialPrompt);
  const [duration, setDuration] = useState(draft?.duration ?? 5);
  const [resolution, setResolution] = useState<"480p" | "720p">(draft?.resolution ?? "480p");
  const [personFree, setPersonFree] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">(draft?.aspectRatio ?? "9:16");
  const formId = useId();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { writeVideoDraft(draftKey, { images: references, useImages, prompt, duration, resolution, aspectRatio }); },
    [draftKey, references, useImages, prompt, duration, resolution, aspectRatio]);
  useEffect(() => { setPersonFree(false); }, [references.map(sourceKey).join(",")]);
  const [quote, setQuote] = useState<StudioVideoJob | null>(null);
  const [quoteKey, setQuoteKey] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [watchId, setWatchId] = useState<string | null>(null);
  const inputKey = JSON.stringify([workspaceId, mode, mode === "image" ? [source?.kind, source?.id] : null,
    mode === "references" ? references.map(r => [r.kind, r.id, r.role]) : null,
    prompt.trim(), duration, resolution, aspectRatio, personFree]);
  const currentInputKey = useRef(inputKey);
  currentInputKey.current = inputKey;
  const jobs = useQuery({ queryKey: ["studio-videos", workspaceId], queryFn: () => listStudioVideos(workspaceId), retry: 1 });
  const watched = useQuery({ queryKey: ["studio-video", workspaceId, watchId], enabled: !!watchId,
    queryFn: () => readStudioVideo(workspaceId, watchId!), retry: 1,
    refetchInterval: (query) => ["queued", "in_progress", "archiving"].includes(query.state.data?.job.status || "") ? 5000 : false });

  useEffect(() => { setQuote(null); setQuoteKey(null); }, [inputKey]);
  useEffect(() => {
    if (["ready", "failed", "nsfw", "canceled"].includes(watched.data?.job.status || "")) {
      void cache.invalidateQueries({ queryKey: ["studio-videos", workspaceId] });
    }
  }, [cache, watched.data?.job.status, workspaceId]);

  async function checkPrice() {
    if ((mode === "image" && !source) || (mode === "references" && (references.length < 2 || prompt.trim().length > 800)) ||
      (mode !== "text" && !personFree) || prompt.trim().length < 3 || !Number.isInteger(duration) || duration < 4 || duration > 10 || busy) return;
    const requestedKey = inputKey;
    setBusy("quote"); setError("");
    try {
      const result = await videoRequest<{ job: StudioVideoJob }>({ action: "quote", workspace_id: workspaceId,
        source_kind: mode === "image" ? source!.kind : mode,
        source_id: mode === "image" ? source!.id : undefined,
        references: mode === "references" ? references.map(({ kind, id, role }) => ({ kind, id, role })) : undefined,
        prompt: prompt.trim(), duration, resolution, aspect_ratio: aspectRatio,
        person_free_attested: mode === "text" ? false : personFree });
      if (alive.current && currentInputKey.current === requestedKey) { setQuote(result.job); setQuoteKey(requestedKey); }
      await cache.invalidateQueries({ queryKey: ["studio-videos", workspaceId] });
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Le devis n’a pas pu être obtenu."); }
    finally { if (alive.current) setBusy(""); }
  }
  async function generate() {
    if (!quote || quoteKey !== inputKey || busy || Date.parse(quote.quote_expires_at) <= Date.now()) return;
    setBusy("submit"); setError("");
    try {
      const result = await videoRequest<{ job: StudioVideoJob; error?: string }>({ action: "submit", workspace_id: workspaceId, job_id: quote.id });
      if (!alive.current) return;
      setQuote(null); setWatchId(result.job.id);
      if (result.error) setError(result.error);
      await cache.invalidateQueries({ queryKey: ["studio-videos", workspaceId] });
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Le lancement a échoué. Consulte les clips avant de réessayer."); }
    finally { if (alive.current) setBusy(""); }
  }

  return (
    <section className="space-y-5" aria-label="Clips du Studio">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><Film className="h-5 w-5" /> Clips du Studio</h2>
        <p className="text-sm text-muted-foreground">Crée un clip depuis une idée ou des images avec Seedance 2.5. Il reste ici, même sans Reel.</p>
      </div>
      {jobs.data?.enabled === false && <p role="status" className="rounded-md border p-3 text-sm">La création vidéo sera disponible après l’activation du Studio. Tes clips déjà créés restent accessibles ici.</p>}
      {writable && showComposer && jobs.data?.enabled === true && <div className="rounded-lg border p-4 space-y-3">
        <h3 className="font-medium">Créer un clip</h3>
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <legend className="font-medium mb-2">Point de départ</legend>
          <label className="flex items-center gap-1"><input type="radio" name={formId} checked={!useImages} onChange={() => setUseImages(false)} />Une idée</label>
          <label className="flex items-center gap-1"><input type="radio" name={formId} checked={useImages} onChange={() => setUseImages(true)} />Une ou plusieurs images</label>
        </fieldset>
        {useImages && <div className="space-y-2">
          <p className="text-sm">Choisis 1 à 4 images. Avec plusieurs références, précise le rôle de chacune : elles guideront les éléments d’une même scène.</p>
          {references.map((ref, index) => <div key={`${ref.kind}:${ref.id}`} className="flex items-center gap-2 flex-wrap text-sm">
            <span className="min-w-0 break-words">{index + 1}. {ref.name}</span>
            {ref.previewUrl && <img src={ref.previewUrl} alt="" className="h-14 w-14 object-cover rounded" />}
            {references.length > 1 && <select aria-label={`Rôle de ${ref.name}`} value={ref.role}
              onChange={e => setReferences(current => current.map((r, i) => i === index ? { ...r, role: e.target.value as VideoReference["role"] } : r))}
              className="h-9 rounded-md border bg-background px-2">
              <option value="subject">Sujet</option><option value="product">Produit</option>
              <option value="casting">Mannequin fictif</option><option value="background">Décor</option>
              <option value="style">Ambiance et lumière</option><option value="composition">Composition</option>
            </select>}
            {index > 0 && <Button type="button" variant="ghost" size="sm" aria-label={`Avancer ${ref.name}`} onClick={() => setReferences(current => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>Avancer</Button>}
            <Button type="button" variant="ghost" size="sm" onClick={() => setReferences(current => current.filter((_, i) => i !== index))}>Retirer</Button>
          </div>)}
          <Button type="button" variant="outline" size="sm" onClick={() => setPicker(true)}>Choisir des images ({references.length}/4)</Button>
        </div>}
        <label className="block text-sm font-medium" htmlFor={`${formId}-prompt`}>{mode === "image" ? "Ce qui doit bouger" : "Quelle vidéo veux-tu créer ?"}</label>
        <Textarea id={`${formId}-prompt`} value={prompt} maxLength={mode === "references" ? 800 : 1000} onChange={e => setPrompt(e.target.value)}
          placeholder="Ex. La lumière traverse l’atelier, la caméra avance doucement vers le produit." />
        {mode === "references" && prompt.trim().length > 800 &&
          <p className="text-xs text-destructive">Raccourcis la demande à 800 caractères pour laisser la place aux rôles des images.</p>}
        <details className="text-sm">
          <summary className="cursor-pointer">Aide : mouvement, caméra et lumière</summary>
          <p className="mt-2 text-muted-foreground">Décris une action simple, puis le déplacement de la caméra et la lumière. Ex. « Le produit reste immobile, la caméra tourne lentement autour (plan en orbite), lumière douce venant de gauche. » Pour une personne fictive : indique un geste naturel et discret. Évite plusieurs actions ou mouvements contradictoires dans un clip court.</p>
        </details>
        <div className="flex gap-3 flex-wrap">
          <label className="text-sm">Durée <Input type="number" min={4} max={10} value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-24" /></label>
          <label className="text-sm">Qualité
            <select className="block h-10 rounded-md border bg-background px-3" value={resolution} onChange={e => setResolution(e.target.value as "480p" | "720p")}
              aria-label="Qualité vidéo"><option value="480p">480p, essai économique</option><option value="720p">720p</option></select>
          </label>
          {mode !== "image" && <label className="text-sm">Format
            <select className="block h-10 rounded-md border bg-background px-3" value={aspectRatio}
              onChange={e => setAspectRatio(e.target.value as "9:16" | "16:9" | "1:1")} aria-label="Format vidéo">
              <option value="9:16">Vertical · Reel</option><option value="16:9">Horizontal</option><option value="1:1">Carré</option>
            </select>
          </label>}
        </div>
        {mode === "image" && <p className="text-xs text-muted-foreground">Avec une seule image, le format suit celui de l’image.</p>}
        {mode !== "text" && <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={personFree} onChange={e => setPersonFree(e.target.checked)} className="mt-1" />
          <span>Je confirme que ces images ne montrent aucune personne identifiable et que je peux les transmettre à Higgsfield pour obtenir le prix et créer ce clip.</span>
        </label>}
        <p className="text-xs text-muted-foreground">Vérifier le prix transmet {mode === "text" ? "la consigne" : "les images et la consigne"} à Higgsfield. La génération ne démarre qu’après le clic suivant. Ce clip est créé sans son ; la voix du Reel reste dans le montage.</p>
        <Button type="button" variant="outline" disabled={(mode === "image" && !source) || (mode === "references" && (references.length < 2 || prompt.trim().length > 800)) ||
          (mode !== "text" && !personFree) || prompt.trim().length < 3 || !Number.isInteger(duration) || duration < 4 || duration > 10 || !!busy}
          onClick={checkPrice}>{busy === "quote" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Vérifier le prix</Button>
        {quote && <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2" role="status">
          <p className="text-sm">Devis Higgsfield : <strong>{Number(quote.estimated_usd).toFixed(2)} $</strong> pour {quote.duration} s en {quote.resolution} ({quote.estimated_credits} crédits API). Le montant est réservé dans le plafond vidéo au lancement.</p>
          <p className="text-xs text-muted-foreground">Si le devis expire, vérifie à nouveau le prix avant de générer. Une nouvelle tentative serait facturée séparément si ce clip est créé mais ne convient pas.</p>
          <Button type="button" disabled={!!busy || Date.parse(quote.quote_expires_at) <= Date.now()} onClick={generate}>
            {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Générer ce clip · {Number(quote.estimated_usd).toFixed(2)} $
          </Button>
        </div>}

      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
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
            {current.status === "quoted" && <p className="text-sm text-muted-foreground">Devis conservé · génération non lancée.</p>}
            {current.status === "canceled" && <p className="text-sm text-muted-foreground">Génération annulée.</p>}
            {current.status === "submitting_uncertain" && <p role="status" className="text-sm text-amber-700">Réponse du fournisseur incertaine : aucune seconde génération ne sera lancée automatiquement.</p>}
            {current.status === "nsfw" && <p role="status" className="text-sm">Higgsfield a refusé ce contenu. La facturation dépend du fournisseur.</p>}
            {current.status === "failed" && <p role="status" className="text-sm">La génération a échoué. Vérifie le résultat avant une nouvelle tentative ; la facturation dépend du fournisseur.</p>}
            {["queued", "in_progress", "archiving"].includes(current.status) && <p role="status" className="text-sm">{current.status === "archiving" ? "Enregistrement du clip…" : "Génération en cours…"}</p>}
            {current.status !== "quoted" && current.status !== "ready" && <Button type="button" variant="outline" size="sm"
              onClick={() => { void cache.fetchQuery({ queryKey: ["studio-video", workspaceId, job.id], queryFn: () => readStudioVideo(workspaceId, job.id), staleTime: 0 }).then(() => { if (alive.current) setWatchId(job.id); void cache.invalidateQueries({ queryKey: ["studio-videos", workspaceId] }); }).catch(e => { if (alive.current) setError(e.message); }); }}>
              Vérifier le résultat
            </Button>}
            {current.status === "ready" && current.video_url && <a className="inline-block text-sm underline mr-3" href={current.video_url} target="_blank" rel="noopener noreferrer">Ouvrir / télécharger le clip</a>}
            {current.status === "ready" && current.video_url && onPickClip && <Button type="button" size="sm" onClick={() => onPickClip(current)}>Prévisualiser dans mon Reel</Button>}
          </article>;
        })}
      </div>
      {picker && <VideoImagePicker workspaceId={workspaceId} initialImages={references}
        onClose={() => setPicker(false)} onConfirm={images => { setReferences(images); setPicker(false); }} />}

    </section>
  );
}
