import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Image as ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VideoImagePicker } from "./VideoImagePicker";
import { readVideoDraft, writeVideoDraft, readPreparedVideo, writePreparedVideo, sourceKey, type VideoSource, type VideoReference, type PreparedVideo } from "./sources";
import { cameraOptions, lightOptions, shotOptions, videoPrompt, type Camera, type Light, type Shot } from "./direction";
export type { VideoSource } from "./sources";
import { getVideoSession, listStudioVideos, listVideoLibrary, readStudioVideo, saveVideoSession, videoRequest, videoTitle, type StudioVideoJob, type StudioVideoEvent } from "./api";
import type { VideoDraft } from "./sources";
import { videoReferencePreviews } from "./library-sources";
import { useBrandCharter } from "@/hooks/use-branding";
import { useWorkspaceId } from "@/hooks/use-workspace-query";

// Taux indicatif pour l'affichage : Higgsfield facture en dollars, on montre l'équivalent en euros.
const USD_TO_EUR = 0.92;

interface Props {
  workspaceId: string; writable: boolean; initialSource?: VideoSource | null;
  initialPrompt?: string; onPickClip?: (job: StudioVideoJob) => void;
  showComposer?: boolean; draftKey?: string;
  sessionId?: string | null; sessionDraft?: Record<string, unknown>; sessionTitle?: string;
  studioLayout?: boolean; initialJob?: StudioVideoJob | null;
  initialDraft?: VideoDraft | null; legacyDraftKey?: string;
}
export function StudioVideoPanel(props: Props) {
  return <VideoComposer key={`${props.workspaceId}:${props.sessionId || props.draftKey || "default"}`} {...props} />;
}
function VideoComposer({ workspaceId, writable, initialSource, initialPrompt = "", onPickClip, showComposer = true,
  draftKey, sessionId, sessionDraft, sessionTitle, studioLayout = false, initialJob, initialDraft, legacyDraftKey }: Props) {
  const cache = useQueryClient();
  const activeWorkspaceId = useWorkspaceId();
  const { data: charter } = useBrandCharter();
  const direction = charter?.visual_direction && typeof charter.visual_direction === "object" && !Array.isArray(charter.visual_direction)
    ? charter.visual_direction as Record<string, unknown> : {};
  const videoStyle = activeWorkspaceId === workspaceId ? [direction.video_motion, direction.light, direction.framing]
    .filter((value): value is string => typeof value === "string" && !!value.trim())
    .map(value => value.trim()).join(" ; ") : "";
  const [draft] = useState(() => (typeof sessionDraft?.prompt === "string" ? sessionDraft as unknown as VideoDraft : initialDraft || readVideoDraft(draftKey)));
  const inheritedReferences: VideoReference[] = initialJob?.source_refs?.length
    ? initialJob.source_refs.map(ref => ({ ...ref, role: ref.role as VideoReference["role"] }))
    : initialJob?.source_id && ["photo", "studio_version"].includes(initialJob.source_kind)
      ? [{ kind: initialJob.source_kind as VideoSource["kind"], id: initialJob.source_id,
        name: initialJob.source_name, role: "subject" }] : [];
  const [references, setReferences] = useState<VideoReference[]>(draft?.images || (initialSource ? [{ ...initialSource, role: "subject" }] : inheritedReferences));
  const [useImages, setUseImages] = useState(draft?.useImages ?? (!!initialSource || inheritedReferences.length > 0));
  const mode = !useImages ? "text" : references.length > 1 ? "references" : "image";
  const source = references[0];
  const [picker, setPicker] = useState(false);
  const [prompt, setPrompt] = useState(draft?.prompt ?? initialJob?.preparation?.idea ?? initialPrompt);
  const [duration, setDuration] = useState(draft?.duration ?? initialJob?.duration ?? 5);
  const [resolution, setResolution] = useState<"480p" | "720p">(draft?.resolution ?? initialJob?.resolution ?? "480p");
  const [usageRightsConfirmed, setUsageRightsConfirmed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">(draft?.aspectRatio ?? initialJob?.aspect_ratio ?? "9:16");
  const [shot, setShot] = useState<Shot>(draft?.shot ?? "");
  const [camera, setCamera] = useState<Camera>(draft?.camera ?? "");
  const [light, setLight] = useState<Light>(draft?.light ?? "");
  const composedPrompt = videoPrompt(prompt, shot, camera, light);
  const promptLimit = 1000;
  const promptTooLong = composedPrompt.length > promptLimit;
  const briefKey = JSON.stringify([workspaceId, mode, mode === "image" ? [source?.kind, source?.id] : null,
    mode === "references" ? references.map(r => [r.kind, r.id, r.role]) : null,
    composedPrompt, duration, resolution, aspectRatio]);
  const referenceKey = references.map(sourceKey).join(",");
  const previews = useQuery({ queryKey: ["video-reference-previews", workspaceId, referenceKey],
    queryFn: () => videoReferencePreviews(workspaceId, references), enabled: useImages && references.length > 0,
    staleTime: 5 * 60_000 });
  const missingRoles = references.length > 1 && references.some(ref => !ref.role);
  const formId = useId();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { writeVideoDraft(draftKey, { images: references, useImages, prompt, duration, resolution, aspectRatio, shot, camera, light }); },
    [draftKey, references, useImages, prompt, duration, resolution, aspectRatio, shot, camera, light]);
  const [saveError, setSaveError] = useState("");
  const draftMounted = useRef(false);
  const needsFirstSave = useRef(!!(initialDraft || initialJob || initialSource));
  const titleRef = useRef(sessionTitle);
  titleRef.current = sessionTitle;
  useEffect(() => {
    if (!sessionId || !writable) return;
    if (!draftMounted.current) {
      draftMounted.current = true;
      if (!needsFirstSave.current) return;
    }
    const timer = window.setTimeout(() => {
      const currentDraft = { images: references.map(({ kind, id, name, role }) => ({ kind, id, name, role })),
        useImages, prompt, duration, resolution, aspectRatio, shot, camera, light };
      void saveVideoSession(workspaceId, sessionId, currentDraft,
        titleRef.current === "Nouvelle idée" && prompt.trim() ? prompt.trim().slice(0, 120) : undefined)
        .then(({ session }) => {
          cache.setQueryData<Awaited<ReturnType<typeof getVideoSession>>>(
            ["studio-videos", workspaceId, sessionId, "studio", 0], old => old ? { ...old, session } : old);
          void cache.invalidateQueries({ queryKey: ["video-sessions", workspaceId] });
          if (alive.current) setSaveError("");
        })
        .catch(() => { if (alive.current) setSaveError("Le brouillon n’a pas pu être synchronisé. Il reste sur cet appareil."); });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [sessionId, workspaceId, writable, references, useImages, prompt, duration, resolution, aspectRatio, shot, camera, light, cache]);
  useEffect(() => { setUsageRightsConfirmed(false); }, [referenceKey]);
  const [quote, setQuote] = useState<StudioVideoJob | null>(null);
  const [quoteKey, setQuoteKey] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedVideo | null>(() =>
    readPreparedVideo(draftKey, briefKey) || readPreparedVideo(legacyDraftKey, briefKey));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [watchId, setWatchId] = useState<string | null>(null);
  const [libraryPage, setLibraryPage] = useState(0);
  const inputKey = JSON.stringify([briefKey, prepared?.token, usageRightsConfirmed]);
  const currentBriefKey = useRef(briefKey);
  currentBriefKey.current = briefKey;
  const currentInputKey = useRef(inputKey);
  currentInputKey.current = inputKey;
  const jobs = useQuery({ queryKey: ["studio-videos", workspaceId, sessionId || "all", showComposer ? "studio" : "picker", libraryPage],
    queryFn: () => sessionId ? getVideoSession(workspaceId, sessionId)
      : showComposer ? listStudioVideos(workspaceId) : listVideoLibrary(workspaceId, libraryPage, "", "newest"), retry: 1 });
  const events: StudioVideoEvent[] = jobs.data && "events" in jobs.data && Array.isArray(jobs.data.events)
    ? jobs.data.events as StudioVideoEvent[] : [];
  const libraryTotal = jobs.data && "total" in jobs.data && typeof jobs.data.total === "number" ? jobs.data.total : 0;
  const watched = useQuery({ queryKey: ["studio-video", workspaceId, watchId], enabled: !!watchId,
    queryFn: () => readStudioVideo(workspaceId, watchId!), retry: 1,
    refetchInterval: (query) => ["submitting_uncertain", "queued", "in_progress", "archiving"].includes(query.state.data?.job.status || "") ? 5000 : false });

  useEffect(() => { setQuote(null); setQuoteKey(null); }, [inputKey]);
  useEffect(() => { setConfirmed(false); }, [briefKey]);
  useEffect(() => {
    if (["ready", "failed", "nsfw", "canceled"].includes(watched.data?.job.status || "")) {
      void cache.invalidateQueries({ queryKey: ["studio-videos", workspaceId] });
      void cache.invalidateQueries({ queryKey: ["video-library", workspaceId] });
    }
  }, [cache, watched.data?.job.status, workspaceId]);

  async function prepareClip() {
    if ((mode === "image" && !source) || (mode === "references" && (references.length < 2 || missingRoles)) ||
      promptTooLong || (mode !== "text" && !usageRightsConfirmed) || prompt.trim().length < 3 || !Number.isInteger(duration) || duration < 4 || duration > 10 || busy) return;
    const requestedKey = briefKey;
    setBusy("prepare"); setError(""); setPrepared(null); writePreparedVideo(draftKey, null); setConfirmed(false); setQuote(null);
    try {
      const result = await videoRequest<{ summary: string; continuity: string[];
        allowed_changes: string; forbidden_changes: string; prompt: string; prepared_token: string }>({
        action: "prepare", workspace_id: workspaceId, session_id: sessionId || undefined,
        source_kind: mode === "image" ? source!.kind : mode,
        source_id: mode === "image" ? source!.id : undefined,
        references: mode === "references" ? references.map(({ kind, id, role }) => ({ kind, id, role })) : undefined,
        prompt: composedPrompt, user_idea: prompt.trim(), duration, resolution, aspect_ratio: aspectRatio,
        person_free_attested: mode === "text" ? false : usageRightsConfirmed,
      });
      if (alive.current && currentBriefKey.current === requestedKey) {
        const next = { summary: result.summary, continuity: result.continuity,
          allowedChanges: result.allowed_changes, forbiddenChanges: result.forbidden_changes,
          prompt: result.prompt, token: result.prepared_token, key: requestedKey };
        setPrepared(next);
        writePreparedVideo(draftKey, next);
        void cache.invalidateQueries({ queryKey: ["studio-videos", workspaceId, sessionId || "all"] });
      }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Claude n’a pas pu préparer le clip."); }
    finally { if (alive.current) setBusy(""); }
  }
  async function checkPrice() {
    if ((mode === "image" && !source) || (mode === "references" && (references.length < 2 || missingRoles)) || promptTooLong ||
      (mode !== "text" && !usageRightsConfirmed) || !prepared || prepared.key !== briefKey ||
      Number(prepared.token.split(".")[0]) <= Date.now() || !confirmed ||
      !Number.isInteger(duration) || duration < 4 || duration > 10 || busy) return;
    const requestedKey = inputKey;
    setBusy("quote"); setError("");
    try {
      const result = await videoRequest<{ job: StudioVideoJob }>({ action: "quote", workspace_id: workspaceId,
        session_id: sessionId || undefined,
        source_kind: mode === "image" ? source!.kind : mode,
        source_id: mode === "image" ? source!.id : undefined,
        references: mode === "references" ? references.map(({ kind, id, role }) => ({ kind, id, role })) : undefined,
        idea: composedPrompt, display_name: prompt.trim().slice(0, 120), prompt: prepared.prompt, summary: prepared.summary, continuity: prepared.continuity,
        allowed_changes: prepared.allowedChanges, forbidden_changes: prepared.forbiddenChanges,
        prepared_token: prepared.token, duration, resolution, aspect_ratio: aspectRatio,
        person_free_attested: mode === "text" ? false : usageRightsConfirmed });
      if (alive.current && currentInputKey.current === requestedKey) { setQuote(result.job); setQuoteKey(requestedKey); }
      await cache.invalidateQueries({ queryKey: ["studio-videos", workspaceId] });
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Le devis n’a pas pu être obtenu."); }
    finally { if (alive.current) setBusy(""); }
  }
  async function generate(savedQuote?: StudioVideoJob) {
    const offer = savedQuote || quote;
    if (!offer || (!savedQuote && quoteKey !== inputKey) || (savedQuote && !savedQuote.can_submit) ||
      busy || Date.parse(offer.quote_expires_at) <= Date.now()) return;
    setBusy("submit"); setError("");
    try {
      const result = await videoRequest<{ job: StudioVideoJob; error?: string }>({ action: "submit", workspace_id: workspaceId, job_id: offer.id });
      if (!alive.current) return;
      setQuote(null); setWatchId(result.job.id);
      if (result.error) setError(result.error);
      await cache.invalidateQueries({ queryKey: ["studio-videos", workspaceId] });
      void cache.invalidateQueries({ queryKey: ["video-library", workspaceId] });
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Le lancement a échoué. Consulte les clips avant de réessayer."); }
    finally { if (alive.current) setBusy(""); }
  }

  return (
    <section className="space-y-5" aria-label="Clips du Studio">
      {!studioLayout && <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><Film className="h-5 w-5" /> Clips du Studio</h2>
        <p className="text-sm text-muted-foreground">Crée un clip depuis une idée ou des images avec Seedance 2.5. Il reste ici, même sans Reel.</p>
      </div>}
      {jobs.data?.enabled === false && <p role="status" className="rounded-md border p-3 text-sm">La création vidéo sera disponible après l’activation du Studio. Tes clips déjà créés restent accessibles ici.</p>}
      {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
      {studioLayout && <a href="/photos?tab=videos" className="text-sm text-primary underline">Voir tous mes clips terminés dans Ma bibliothèque</a>}
      {studioLayout && <a href="#video-results" className="block text-sm text-primary underline lg:hidden">Aller aux résultats de cette session</a>}
      {initialJob && <p className="rounded-md border p-3 text-sm">Nouvelle demande à partir de « {videoTitle(initialJob)} ». Ce clip historique reste indépendant de cette session ; vérifie l’idée, les références et les droits avant toute préparation.</p>}
      <div className={studioLayout ? "grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(330px,0.9fr)]" : "space-y-5"}>
      <div className="min-w-0 space-y-4">
      {studioLayout && <div className="space-y-3" aria-label="Conversation vidéo">
        <h3 className="font-medium">Conversation</h3>
        {events.length === 0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">Décris ton idée ci-dessous. Chaque proposition validée et chaque version restent dans cette session.</p>}
        {events.map(event => <div key={event.id} className={`rounded-xl border p-3 text-sm ${event.kind === "request" ? "ml-5 bg-primary/5" : "mr-5 bg-muted/40"}`}>
          <p className="mb-1 text-xs font-medium">{event.kind === "request" ? "Toi" : "Proposition du Studio"} · {new Date(event.created_at).toLocaleString("fr-FR")}</p>
          <p className="whitespace-pre-line">{event.kind === "request" ? event.content.idea : event.content.summary}</p>
          {event.kind === "request" && !!event.content.references?.length && <p className="mt-1 text-xs text-muted-foreground">Références dans l’ordre : {event.content.references.map((ref, i) => `${i + 1}. ${ref.name || ref.kind} (${ref.role})`).join(" · ")}</p>}
        </div>)}
      </div>}
      {writable && showComposer && jobs.data?.enabled === true && <div className="rounded-lg border p-4 space-y-3">
        <h3 className="font-medium">{studioLayout ? "Écris ton prochain message" : "Créer un clip"}</h3>
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <legend className="font-medium mb-2">Point de départ</legend>
          <label className="flex items-center gap-1"><input type="radio" name={formId} checked={!useImages} onChange={() => setUseImages(false)} />Une idée</label>
          <label className="flex items-center gap-1"><input type="radio" name={formId} checked={useImages} onChange={() => setUseImages(true)} />Une ou plusieurs images</label>
        </fieldset>
        {useImages && <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">1. Ajoute tes images</p>
            <p className="text-xs text-muted-foreground">Choisis un produit, un mannequin fictif, un décor… depuis ta bibliothèque ou ton appareil. Tu peux en ajouter jusqu’à 4.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => setPicker(true)}>{references.length ? "Ajouter ou changer mes images" : "Ajouter mes images"} ({references.length}/4)</Button>
          {references.length > 0 && <div className="space-y-2">
            <p className="text-sm font-medium">2. Indique ce que montre chaque image</p>
            {references.length === 1 && <p className="text-xs text-muted-foreground">Cette image sera animée telle quelle. Ajoute une autre image pour composer une scène avec plusieurs rôles.</p>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {references.map((ref, index) => {
                const preview = previews.data?.get(sourceKey(ref)) || ref.previewUrl;
                return <article key={sourceKey(ref)} className="min-w-0 overflow-hidden rounded-lg border bg-background">
                  <div className="relative aspect-square bg-muted">
                    {preview ? <img src={preview} alt={ref.name} className="h-full w-full object-cover" />
                      : <div role="img" aria-label={ref.name} className="h-full w-full"><ImageIcon aria-hidden className="h-full w-full p-10 text-muted-foreground" /></div>}
                    <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-semibold">{index + 1}</span>
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="truncate text-xs text-muted-foreground" title={ref.name}>{ref.name}</p>
                    {references.length > 1 && <label className="block text-sm font-medium">Cette image est…
                      <select aria-label={`Rôle de ${ref.name}`} value={ref.role}
                        onChange={e => setReferences(current => current.map((r, i) => i === index ? { ...r, role: e.target.value as VideoReference["role"] } : r))}
                        className="mt-1 h-10 w-full rounded-md border bg-background px-2">
                        <option value="">Choisir un rôle</option><option value="product">Le produit</option>
                        <option value="casting">Le mannequin fictif</option><option value="background">Le décor</option>
                        <option value="subject">Le sujet principal</option><option value="style">L’ambiance et la lumière</option>
                        <option value="composition">La composition</option>
                      </select>
                    </label>}
                    <div className="flex flex-wrap gap-1">
                      {index > 0 && <Button type="button" variant="ghost" size="sm" aria-label={`Avancer ${ref.name}`} onClick={() => setReferences(current => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>Avancer</Button>}
                      <Button type="button" variant="ghost" size="sm" aria-label={`Retirer ${ref.name}`} onClick={() => setReferences(current => current.filter((_, i) => i !== index))}>Retirer</Button>
                    </div>
                  </div>
                </article>;
              })}
            </div>
            {missingRoles && <p className="text-xs text-muted-foreground">Choisis le rôle de chaque image avant de vérifier le prix.</p>}
          </div>}
        </div>}
        <label className="block text-sm font-medium" htmlFor={`${formId}-prompt`}>{mode === "image" ? "Ce qui doit bouger" : "Quelle vidéo veux-tu créer ?"}</label>
        <Textarea id={`${formId}-prompt`} value={prompt} maxLength={1000} onChange={e => setPrompt(e.target.value)}
          placeholder="Ex. Le mannequin prend le bol et le pose doucement sur la table." />
        {videoStyle && <button type="button" className="text-left text-xs text-primary underline" onClick={() => setPrompt(current => [current.trim(), `Style de ma marque : ${videoStyle}`].filter(Boolean).join("\n"))}>
          Reprendre mon style vidéo dans cette consigne
        </button>}
        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Ajuster le plan, la caméra et la lumière (facultatif){shot || camera || light ? " · réglages actifs" : ""}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm">Type de plan
            <select className="block h-10 w-full rounded-md border bg-background px-2" value={shot} onChange={e => setShot(e.target.value as Shot)}>
              {Object.entries(shotOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm">Mouvement de caméra
            <select className="block h-10 w-full rounded-md border bg-background px-2" value={camera} onChange={e => setCamera(e.target.value as Camera)}>
              {Object.entries(cameraOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm">Lumière
            <select className="block h-10 w-full rounded-md border bg-background px-2" value={light} onChange={e => setLight(e.target.value as Light)}>
              {Object.entries(lightOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
          <p className="mt-2 text-xs text-muted-foreground">Ces réglages guident le modèle sans garantir le résultat exact. Un geste simple et un plan court facilitent la continuité.</p>
        </details>
        {promptTooLong && <p className="text-xs text-destructive">La consigne complète dépasse {promptLimit} caractères. Raccourcis le texte ou retire un réglage.</p>}
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
          <input type="checkbox" checked={usageRightsConfirmed} onChange={e => setUsageRightsConfirmed(e.target.checked)} className="mt-1" />
          <span>Je confirme avoir le droit d’utiliser ces images et de les transmettre à Claude pour préparer le clip, puis à Higgsfield pour obtenir le prix et le créer.</span>
        </label>}
        <p className="text-xs text-muted-foreground">Claude prépare la description à valider. Vérifier le prix transmet ensuite {mode === "text" ? "la consigne" : "les images et la consigne"} à Higgsfield. La génération ne démarre qu’après le clic suivant. Ce clip est créé sans son ; la voix du Reel reste dans le montage.</p>
        <Button type="button" variant="outline" disabled={(mode === "image" && !source) || (mode === "references" && (references.length < 2 || missingRoles)) ||
          promptTooLong || (mode !== "text" && !usageRightsConfirmed) || prompt.trim().length < 3 || !Number.isInteger(duration) || duration < 4 || duration > 10 || !!busy}
          onClick={prepareClip}>{busy === "prepare" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Préparer avec Claude</Button>
        {prepared?.key === briefKey && Number(prepared.token.split(".")[0]) > Date.now() && <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
          <p className="text-sm font-medium">Est-ce bien le clip que tu veux ?</p>
          <p className="text-sm whitespace-pre-line break-words">{prepared.summary}</p>
          <div className="rounded-md border bg-background p-3 text-sm space-y-1">
            <p className="font-medium">À vérifier avant le devis</p>
            <ul className="list-disc pl-5 space-y-1">{prepared.continuity.map((rule, index) => <li key={index}>{rule}</li>)}</ul>
            <p><strong>Ce qui peut changer :</strong> {prepared.allowedChanges}</p>
            <p><strong>Ce qui ne doit pas changer :</strong> {prepared.forbiddenChanges}</p>
          </div>
          <details className="text-sm"><summary className="cursor-pointer">Lire la consigne technique exacte du devis et de la génération</summary>
            <p className="mt-2 whitespace-pre-line break-words">{prepared.prompt}</p></details>
          <p className="text-xs text-muted-foreground">Pour une continuité stricte, un geste simple, un plan court et une caméra fixe sont souvent plus faciles à contrôler. Relis le rendu avant de l’utiliser : ces consignes ne garantissent pas un résultat sans faux raccord.</p>
          <p className="text-xs text-muted-foreground">Pour corriger cette proposition, modifie ton idée ou les réglages ci-dessus, puis demande une nouvelle préparation.</p>
          <Button type="button" variant={confirmed ? "outline" : "default"} disabled={!!busy}
            onClick={() => setConfirmed(true)}>{confirmed ? "Description validée" : "Oui, c’est bien ça"}</Button>
        </div>}
        <Button type="button" variant="outline" disabled={(mode === "image" && !source) || (mode === "references" && (references.length < 2 || missingRoles)) || promptTooLong ||
          (mode !== "text" && !usageRightsConfirmed) || !prepared || prepared.key !== briefKey || Number(prepared.token.split(".")[0]) <= Date.now() || !confirmed ||
          !Number.isInteger(duration) || duration < 4 || duration > 10 || !!busy}
          onClick={checkPrice}>{busy === "quote" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Vérifier le prix</Button>
        {quote && <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2" role="status">
          <p className="text-sm">Devis Higgsfield : <strong>{(Number(quote.estimated_usd) * USD_TO_EUR).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</strong> pour {quote.duration} s en {quote.resolution} ({Number(quote.estimated_usd).toFixed(2)} $ · {quote.estimated_credits} crédits API). Le montant est réservé dans le plafond vidéo au lancement.</p>
          <p className="text-xs text-muted-foreground">Si le devis expire, vérifie à nouveau le prix avant de générer. Une nouvelle tentative serait facturée séparément si ce clip est créé mais ne convient pas.</p>
          <Button type="button" disabled={!!busy || Date.parse(quote.quote_expires_at) <= Date.now()} onClick={() => void generate()}>
            {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Générer ce clip · {(Number(quote.estimated_usd) * USD_TO_EUR).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
          </Button>
        </div>}

      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <div id={studioLayout ? "video-results" : undefined} className="min-w-0 space-y-2">
        <div className="flex items-center justify-between"><h3 className="font-medium">{studioLayout ? "Résultats de la session" : "Mes clips"}</h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => void jobs.refetch()} aria-label="Actualiser les clips"><RefreshCw className="h-4 w-4" /></Button></div>
        {jobs.isError && <p role="alert" className="text-sm">Impossible de charger les clips. Réessaie.</p>}
        {jobs.isLoading && <p className="text-sm">Chargement des clips…</p>}
        {jobs.data?.jobs.length === 0 && <p className="text-sm text-muted-foreground">Aucun rendu pour l’instant. Les nouveaux clips apparaîtront ici dans l’ordre.</p>}
        {jobs.data?.jobs.map(job => {
          const current = watched.data?.job.id === job.id ? watched.data.job : job;
          return <article key={job.id} className="rounded-md border p-3 space-y-2">
            <p className="text-sm font-medium">{videoTitle(job)} · {job.duration} s · {job.resolution}</p>
            <p className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleString("fr-FR")} · {job.aspect_ratio || "format source"}</p>
            {job.preparation?.summary && <details className="text-sm"><summary className="cursor-pointer">Revoir la description et les contraintes confirmées</summary>
              {job.preparation.idea && <p className="mt-2"><strong>Idée donnée :</strong> {job.preparation.idea}</p>}
              <p className="mt-2 whitespace-pre-line">{job.preparation.summary}</p>
              <ul className="mt-2 list-disc pl-5">{job.preparation.continuity?.map((rule, index) => <li key={index}>{rule}</li>)}</ul>
              <p className="mt-2"><strong>Consigne transmise :</strong> {job.prompt}</p>
            </details>}
            {current.status === "ready" && current.video_url && <video src={current.video_url} controls playsInline preload="metadata" className="w-full max-w-sm rounded bg-black" />}
            {current.status === "quoted" && <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Devis conservé · génération non lancée · {(Number(current.estimated_usd) * USD_TO_EUR).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}.</p>
              {!!current.source_refs?.length && <p>Images prévues : {current.source_refs.map((ref, index) => `${index + 1}. ${ref.name} (${({ subject: "sujet", product: "produit", casting: "mannequin", background: "décor", style: "ambiance", composition: "composition" } as Record<string, string>)[ref.role] || ref.role})`).join(" · ")}</p>}
              {writable && jobs.data?.enabled && current.can_submit && current.id !== quote?.id && Date.parse(current.quote_expires_at) > Date.now() && <Button type="button" variant="outline" size="sm" disabled={!!busy}
                onClick={() => void generate(current)}>Générer ce clip avec ce devis</Button>}
              {Date.parse(current.quote_expires_at) <= Date.now() && <p>Devis expiré. Prépare le clip à nouveau pour vérifier son prix.</p>}
            </div>}
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
        {!showComposer && libraryTotal > 24 && <div className="flex gap-2 items-center text-xs">
          <Button variant="outline" size="sm" disabled={libraryPage === 0} onClick={() => setLibraryPage(libraryPage - 1)}>Précédents</Button>
          Page {libraryPage + 1} sur {Math.ceil(libraryTotal / 24)}
          <Button variant="outline" size="sm" disabled={(libraryPage + 1) * 24 >= libraryTotal} onClick={() => setLibraryPage(libraryPage + 1)}>Suivants</Button>
        </div>}
      </div>
      </div>
      {picker && <VideoImagePicker workspaceId={workspaceId} initialImages={references.map(ref => ({
        ...ref, previewUrl: previews.data?.get(sourceKey(ref)) || ref.previewUrl,
      }))}
        onClose={() => setPicker(false)} onConfirm={images => { setReferences(images); void cache.invalidateQueries({ queryKey: ["video-reference-previews", workspaceId] }); setPicker(false); }} />}

    </section>
  );
}
