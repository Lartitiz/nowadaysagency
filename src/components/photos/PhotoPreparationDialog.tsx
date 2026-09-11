import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Undo2, Check, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { PhotoCompositionControls } from "./PhotoCompositionControls";
import { PHOTO_FORMATS, cleanDirection, makePhotoRecipe, photoGeometry, loadPhotoImage,
  renderPhotoComposition, confirmedPhotoCopy, sourceWithCutoutMask, type PhotoRecipe, type PhotoFormat } from "@/lib/photo-composition";
import { listPhotoWorkflows, savePhotoWorkflow, saveWorkflowPhoto, saveWorkflowCalendarDraft, readWorkflowSource,
  serialisePreparation, parsePreparation, isCalendarDate, type PhotoWorkflowRow, type WorkflowSource, type PreparedPhotoOutput } from "@/lib/photo-workflows";

export interface PhotoPreparationInput { id: string; name: string; dataUrl?: string; photoId?: string }
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: PhotoPreparationInput[];
  mode?: "single" | "collection" | "kit";
  /** Applies the active rendition to an in-progress post, keeping its caption in the parent. */
  onApply?: (dataUrl: string) => void | Promise<void>;
}
function outputFor(sourceIndex: number, format: PhotoFormat, label?: string): PreparedPhotoOutput {
  return { id: crypto.randomUUID(), sourceIndex, label: label || PHOTO_FORMATS[format].label,
    recipe: makePhotoRecipe(format), enabled: true, approved: false, caption: "", date: "",
    photoId: crypto.randomUUID(), postId: crypto.randomUUID() };
}
function makeOutputs(count: number, mode: Props["mode"]) {
  if (mode !== "kit") return Array.from({ length: count }, (_, i) => outputFor(i, "post", count > 1 ? `Photo ${i + 1}` : undefined));
  const detail = outputFor(0, "square", "Détail visible"); detail.enabled = false;
  detail.recipe.crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  return [outputFor(0, "post", "Visuel principal"), detail, outputFor(0, "story"), outputFor(0, "cover")];
}
export default function PhotoPreparationDialog(props: Props) {
  // Mount an isolated session only while open; avoids hidden effects and stale source mixing.
  const closeRequest = useRef<() => void>(() => props.onOpenChange(false));
  return <Dialog open={props.open} onOpenChange={open => { if (!open) closeRequest.current(); }}>
    {props.open && <PhotoPreparationSession {...props} closeRequest={closeRequest} />}
  </Dialog>;
}
function PhotoPreparationSession({ sources: inputs, mode = "single", onApply, onOpenChange, closeRequest }: Props & { closeRequest: { current: () => void } }) {
  const { user } = useAuth(); const { activeWorkspace, loading: workspaceLoading } = useWorkspace();
  const { isDemoMode } = useDemoContext(); const workspaceId = activeWorkspace?.id || "";
  const scope = `${user?.id || ""}:${workspaceId}`;
  const initialScope = useRef(scope); const alive = useRef(true); const busyRef = useRef(false);
  const queryClient = useQueryClient(); const navigate = useNavigate();
  const [sources, setSources] = useState<WorkflowSource[]>([]);
  const [outputs, setOutputs] = useState<PreparedPhotoOutput[]>(() => makeOutputs(inputs.length, mode));
  const [active, setActive] = useState(0); const [busy, setBusy] = useState("");
  const [loadError, setLoadError] = useState(""); const [loaded, setLoaded] = useState(false);
  const [rendered, setRendered] = useState<{ data: string; recipe: PhotoRecipe; imageUrl: string } | null>(null); const [previewError, setPreviewError] = useState("");
  const [lowResolution, setLowResolution] = useState(false); const [showOriginal, setShowOriginal] = useState(false);
  const [creatorId, setCreatorId] = useState(user?.id || "");
  const [workflowId, setWorkflowId] = useState<string>(() => crypto.randomUUID());
  const [name, setName] = useState(mode === "collection" ? "Ma collection" : inputs[0]?.name || "Ma préparation photo");
  const [directions, setDirections] = useState<PhotoWorkflowRow[]>([]); const [preparations, setPreparations] = useState<PhotoWorkflowRow[]>([]);
  const [directionName, setDirectionName] = useState(""); const [savedAt, setSavedAt] = useState("");
  const [fields, setFields] = useState({ product: "", facts: "", message: "", cta: "" });
  const [history, setHistory] = useState<{ index: number; output: PreparedPhotoOutput }[]>([]);
  const [isKit, setIsKit] = useState(mode === "kit");
  const changed = useRef(false);
  const current = outputs[active]; const source = sources[current?.sourceIndex];
  const scopeValid = scope === initialScope.current && !!workspaceId && !!user && !workspaceLoading;
  const canStore = scopeValid && !isDemoMode;
  const currentImageUrl = current?.recipe.crop ? source?.dataUrl : source?.cutoutUrl || source?.dataUrl;

  const recipe = current?.recipe;
  const preview = rendered?.recipe === recipe && rendered?.imageUrl === currentImageUrl ? rendered.data : "";

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => { if (changed.current || busyRef.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", prevent); return () => window.removeEventListener("beforeunload", prevent);
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const loadedSources = await Promise.all(inputs.map(async input => input.dataUrl
          ? { id: input.id, name: input.name, dataUrl: input.dataUrl, photoId: input.photoId }
          : readWorkflowSource(input.photoId || input.id, workspaceId)));
        if (cancelled) return;
        setSources(loadedSources); setLoaded(true);
        if (canStore) {
          const lists = await Promise.allSettled([listPhotoWorkflows(workspaceId, "direction"), listPhotoWorkflows(workspaceId, "preparation")]);
          if (cancelled) return;
          if (lists[0].status === "fulfilled") setDirections(lists[0].value);
          if (lists[1].status === "fulfilled") setPreparations(lists[1].value);
          if (lists.some(r => r.status === "rejected")) toast.error("Les préparations enregistrées sont indisponibles. Tu peux continuer à cadrer ou télécharger.");
        }
      } catch (error) { if (!cancelled) setLoadError(error instanceof Error ? error.message : "Chargement impossible."); }
    }
    if (scopeValid) void load();
    return () => { cancelled = true; };
    // Inputs are snapshotted for this dialog session, not reloaded on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeValid]);

  useEffect(() => {
    let cancelled = false; setRendered(null); setPreviewError("");
    if (currentImageUrl && recipe) {
      const timer = window.setTimeout(async () => {
        try {
          const image = await loadPhotoImage(currentImageUrl);
          const geometry = photoGeometry(image.naturalWidth, image.naturalHeight, recipe);
          const result = await renderPhotoComposition(image, recipe);
          if (!cancelled) { setRendered({ data: result, recipe, imageUrl: currentImageUrl }); setLowResolution(geometry.lowResolution); }
        } catch (error) { if (!cancelled) setPreviewError(error instanceof Error ? error.message : "Aperçu indisponible."); }
      }, 100);
      return () => { cancelled = true; window.clearTimeout(timer); };
    }
    return () => { cancelled = true; };
  }, [currentImageUrl, recipe]);

  function editOutput(patch: Partial<PreparedPhotoOutput>) {
    if (busyRef.current || !current || current.savedPhoto) return;
    changed.current = true; setSavedAt("");
    setHistory(h => [...h.slice(-19), { index: active, output: current }]);
    setOutputs(rows => rows.map((o, i) => i === active ? { ...o, ...patch,
      ...(patch.recipe && patch.recipe.format !== o.recipe.format && mode !== "collection" && !o.recipe.crop ? { label: PHOTO_FORMATS[patch.recipe.format].label } : {}), approved: false,
      photoId: crypto.randomUUID(), postId: crypto.randomUUID() } : o));
  }
  async function run(label: string, task: () => Promise<void>) {
    if (busyRef.current || !scopeValid) return;
    busyRef.current = true; setBusy(label);
    try { await task(); } catch (error) { toast.error(error instanceof Error ? error.message : "L’opération n’a pas abouti. Réessaie."); }
    finally { busyRef.current = false; if (alive.current) setBusy(""); }
  }
  async function persist(sourceRows = sources, outputRows = outputs) {
    if (!canStore) throw new Error("Connecte-toi à ton espace pour enregistrer.");
    // Save stable source IDs before any output; original bytes stay in their own library entries.
    const stable = [...sourceRows];
    for (let i = 0; i < stable.length; i++) {
      const s = { ...stable[i] };
      {
        s.photoId ||= crypto.randomUUID();
        stable[i] = s; setSources([...stable]);
        await saveWorkflowPhoto({ id: s.photoId, userId: user!.id, workspaceId, name: s.name, dataUrl: s.dataUrl,
          description: s.description, kind: s.kind });
      }
      if (s.cutoutUrl) {
        s.cutoutId ||= crypto.randomUUID(); stable[i] = s; setSources([...stable]);
        await saveWorkflowPhoto({ id: s.cutoutId, userId: user!.id, workspaceId, name: `${s.name} — détourage`, dataUrl: s.cutoutUrl,
          description: s.description, kind: s.kind });
      }
      stable[i] = s;
    }
    await savePhotoWorkflow({ id: workflowId, user_id: creatorId, workspace_id: workspaceId, kind: "preparation",
      name: name.trim().slice(0, 120) || "Ma préparation photo", data: serialisePreparation(stable, outputRows, { ...fields, isKit: String(isKit) }) });
    setSources(stable); setSavedAt("Préparation enregistrée"); changed.current = false;
    queryClient.invalidateQueries({ queryKey: ["user-photos"] });
    return stable;
  }
  async function saveOutputs(calendar: boolean) {
    const selected = outputs.filter(o => o.enabled);
    if (!selected.length || selected.some(o => !o.approved)) throw new Error("Vérifie et valide chaque visuel sélectionné avant l’enregistrement.");
    const schedulable = selected.filter(o => !["cover", "banner"].includes(o.recipe.format));
    if (calendar && (!schedulable.length || schedulable.some(o => !isCalendarDate(o.date)))) throw new Error("Choisis une date pour chaque post ou story sélectionné.");
    const stable = await persist(); const next = [...outputs];
    for (let i = 0; i < next.length; i++) {
      let o = next[i]; if (!o.enabled) continue;
      const s = stable[o.sourceIndex];
      if (!o.savedPhoto) {
        const image = await loadPhotoImage(o.recipe.crop ? s.dataUrl : s.cutoutUrl || s.dataUrl);
        const dataUrl = await renderPhotoComposition(image, o.recipe);
        await saveWorkflowPhoto({ id: o.photoId, userId: user!.id, workspaceId, name: `${name} — ${o.label}`, dataUrl,
          description: s.description || s.name, kind: s.kind });
        o = { ...o, savedPhoto: true }; next[i] = o; setOutputs([...next]);
        await persist(stable, next);
      }
      if (calendar && !["cover", "banner"].includes(o.recipe.format) && !o.savedPost) {
        await saveWorkflowCalendarDraft(o, { userId: user!.id, workspaceId, name, workflowId });
        next[i] = { ...o, savedPost: true }; setOutputs([...next]); await persist(stable, next);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
    toast.success(calendar ? "Les brouillons sont dans ton calendrier. Aucune publication automatique." : "Les copies validées sont dans Mes photos.");
  }
  async function restore(row: PhotoWorkflowRow) {
    if (changed.current && !window.confirm("Remplacer la préparation ouverte par celle enregistrée ? Les changements non enregistrés seront perdus.")) return;
    const parsed = parsePreparation(row.data);
    const restored = await Promise.all(parsed.sources.map(async r => {
      const s = await readWorkflowSource(r.photoId, workspaceId);
      if (r.cutoutId) { s.cutoutUrl = (await readWorkflowSource(r.cutoutId, workspaceId)).dataUrl; s.cutoutId = r.cutoutId; }
      return s;
    }));
    // Recover a saved image/post even if its success response or preparation update was lost.
    const ids = parsed.outputs.map(o => o.photoId), postIds = parsed.outputs.map(o => o.postId);
    const [photos, posts] = await Promise.all([
      supabase.from("user_photos").select("id").eq("workspace_id", workspaceId).eq("status", "ready").in("id", ids),
      supabase.from("calendar_posts").select("id").eq("workspace_id", workspaceId).in("id", postIds),
    ]);
    if (photos.error || posts.error) throw new Error("Impossible de vérifier les enregistrements précédents. Réessaie.");
    setSources(restored); setOutputs(parsed.outputs.map(o => ({ ...o,
      savedPhoto: photos.data.some(p => p.id === o.photoId), savedPost: posts.data.some(p => p.id === o.postId) })));
    setFields({ product: String(parsed.fields.product || ""), facts: String(parsed.fields.facts || ""),
      message: String(parsed.fields.message || ""), cta: String(parsed.fields.cta || "") });
    setCreatorId(row.user_id); setWorkflowId(row.id); setName(row.name); setIsKit(parsed.fields.isKit === "true"); setActive(0); setHistory([]);
    changed.current = false; setSavedAt("Préparation retrouvée");
  }
  function startKit() {
    if (outputs.some(o => o.savedPhoto)) return;
    if (changed.current && !window.confirm("Préparer plusieurs formats à partir de cette photo ? Les réglages du visuel courant seront repris.")) return;
    const kit = makeOutputs(1, "kit").map(o => ({ ...o, sourceIndex: current.sourceIndex,
      recipe: { ...o.recipe, exposure: current.recipe.exposure, contrast: current.recipe.contrast, direction: { ...current.recipe.direction, textPosition: o.recipe.format === "story" || o.recipe.format === "cover" ? "top" as const : current.recipe.direction.textPosition } } }));
    setOutputs(kit); setActive(0); setIsKit(true); changed.current = true; setSavedAt("");
  }
  const close = () => {
    if (busyRef.current) return;
    if (changed.current && !window.confirm("Fermer sans enregistrer les derniers changements ?")) return;
    onOpenChange(false);
  };
  closeRequest.current = close;
  if (!scopeValid) return <DialogContent><DialogHeader><DialogTitle>Préparer mes photos</DialogTitle><DialogDescription>L’espace a changé ou est en cours de chargement. Rouvre la photo dans le bon espace.</DialogDescription></DialogHeader><Button onClick={() => onOpenChange(false)}>Fermer</Button></DialogContent>;
  return <DialogContent className="sm:max-w-5xl max-h-[92dvh] overflow-y-auto" onEscapeKeyDown={e => { e.preventDefault(); close(); }} onInteractOutside={e => e.preventDefault()}>
    <DialogHeader><DialogTitle>{isKit ? "Une photo, plusieurs contenus" : mode === "collection" ? "Harmoniser ma collection" : "Adapter ma photo"}</DialogTitle>
      <DialogDescription>Cadre, lumière et texte : prépare tes visuels en conservant tes sources.</DialogDescription></DialogHeader>
    {loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : !loaded ? <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Chargement des sources…</p> : current && source && <>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-0 text-xs">Nom de la préparation<Input value={name} disabled={!!busy} maxLength={120} onChange={e => { setName(e.target.value); changed.current = true; }} /></label>
        {preparations.length > 0 && <label className="text-xs">Reprendre une préparation<select className="block min-h-10 max-w-[230px] rounded border bg-background px-2" aria-label="Reprendre une préparation" value="" disabled={!!busy} onChange={e => {
          const row = preparations.find(p => p.id === e.target.value); if (row) void run("Reprise…", () => restore(row));
        }}><option value="">Choisir…</option>{preparations.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      </div>
      <div className="flex gap-2 overflow-x-auto py-1" aria-label="Visuels de la préparation">
        {outputs.map((o, i) => <button key={o.id} type="button" disabled={!!busy} aria-pressed={i === active} onClick={() => { setActive(i); setShowOriginal(false); }}
          className={`shrink-0 min-h-10 rounded-lg border px-3 text-sm ${i === active ? "border-primary bg-primary/10" : "bg-background"} ${!o.enabled ? "opacity-50" : ""}`}>
          {o.approved && <Check className="inline h-3 w-3 mr-1" />}{o.label}{o.savedPhoto ? " · enregistré" : ""}</button>)}
      </div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
        <div className="min-w-0 space-y-3">
          <div className="rounded-xl border bg-muted/30 p-3 min-h-[200px] flex justify-center items-center">
            {showOriginal ? <div className="relative max-h-[48vh] max-w-full"><img src={source.dataUrl} alt={`Source : ${source.name}`} className="max-h-[48vh] max-w-full object-contain" />
              {current.recipe.crop && <div aria-label="Zone du détail" className="absolute border-2 border-primary bg-primary/15 pointer-events-none" style={{ left: `${current.recipe.crop.x * 100}%`, top: `${current.recipe.crop.y * 100}%`, width: `${current.recipe.crop.width * 100}%`, height: `${current.recipe.crop.height * 100}%` }} />}</div>
              : preview ? <img src={preview} alt={`Aperçu : ${current.label}`} className="max-h-[48vh] max-w-full object-contain" />
              : previewError ? <p role="alert" className="text-sm text-destructive">{previewError}</p> : <Loader2 aria-label="Préparation de l’aperçu" className="h-5 w-5 animate-spin" />}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowOriginal(v => !v)}>{showOriginal ? "Voir le résultat" : "Comparer avec la source"}</Button>
            <Button variant="ghost" className="text-foreground" size="sm" disabled={!!busy || !history.length || current.savedPhoto} onClick={() => {
              const last = history[history.length - 1]; if (!last || outputs[last.index]?.savedPhoto) return;
              setOutputs(rows => rows.map((o, i) => i === last.index ? last.output : o)); setActive(last.index); setHistory(h => h.slice(0, -1)); changed.current = true;
            }}><Undo2 className="h-3 w-3 mr-1" /> Annuler le dernier réglage</Button>
          </div>
          {lowResolution && !current.recipe.crop && <p className="text-xs text-muted-foreground">La source est petite pour ce format : vérifie la netteté du produit.</p>}
          <p className="text-xs text-muted-foreground">{current.recipe.crop ? "Le détail provient uniquement de la zone choisie." : "Toute la photo est conservée, même si cela ajoute des marges. Une partie de produit absente reste absente."}</p>
          <div className="rounded-lg border p-3 space-y-2">
            <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={current.enabled} disabled={!!busy || current.savedPhoto} onChange={e => editOutput({ enabled: e.target.checked })} /> Garder ce visuel dans la préparation</label>
            <label className="flex gap-2 items-start text-sm"><input className="mt-1" type="checkbox" checked={current.approved} disabled={!!busy || !preview || !!previewError || !current.enabled || current.savedPhoto} onChange={e => {
              const approved = e.target.checked; changed.current = true; setOutputs(rows => rows.map((o, i) => i === active ? { ...o, approved } : o));
            }} /> J’ai vérifié le produit, le cadrage et le texte de ce visuel</label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!preview || !!busy} onClick={() => {
              const a = document.createElement("a"); a.href = preview; a.download = `${name.replace(/[^\p{L}\p{N}-]/gu, "-").slice(0, 60)}-${current.recipe.format}.png`; a.click();
            }}><Download className="h-4 w-4 mr-2" /> Télécharger ce visuel</Button>
            {onApply && <Button disabled={!preview || !current.approved || !!busy} onClick={() => void run("Application…", async () => { await onApply(preview); changed.current = false; onOpenChange(false); })}>Utiliser dans mon contenu</Button>}
          </div>
          {current.savedPhoto && <p className="text-xs text-muted-foreground">Cette copie est enregistrée. Pour la modifier, crée une nouvelle variante ; les brouillons existants resteront intacts.</p>}
          {current.savedPhoto && <Button variant="outline" size="sm" disabled={!!busy || outputs.length >= 40} onClick={() => {
            const copy = { ...current, id: crypto.randomUUID(), photoId: crypto.randomUUID(), postId: crypto.randomUUID(),
              label: `${current.label} · variante`, savedPhoto: false, savedPost: false, approved: false };
            setOutputs(rows => [...rows, copy]); setActive(outputs.length); changed.current = true;
          }}>Créer une variante</Button>}
        </div>
        <div className="min-w-0 space-y-4">
          <PhotoCompositionControls recipe={current.recipe} disabled={!!busy || !!current.savedPhoto} onChange={recipe => editOutput({ recipe })} />
          {mode === "collection" && <Button variant="outline" className="w-full whitespace-normal h-auto min-h-10" disabled={!!busy} onClick={() => {
            setOutputs(rows => rows.map(o => o.savedPhoto ? o : { ...o, approved: false, photoId: crypto.randomUUID(),
              recipe: { ...o.recipe, format: current.recipe.format, width: current.recipe.width, height: current.recipe.height, direction: current.recipe.direction } }));
            changed.current = true;
          }}>Appliquer ce cadre aux autres photos</Button>}
          {!current.recipe.crop && !outputs.some(o => o.sourceIndex === current.sourceIndex && o.savedPhoto) && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Harmoniser aussi le fond</summary>
            <p className="text-xs text-muted-foreground my-2">Le cadre seul conserve le décor de la photo. Un détourage permet d’appliquer un fond uni ; vérifie les chaînes fines, anses et tissus transparents.</p>
            {source.cutoutUrl ? <Button size="sm" variant="outline" disabled={!!busy} onClick={() => {
              setSources(rows => rows.map((s, i) => i === current.sourceIndex ? { ...s, cutoutUrl: undefined, cutoutId: undefined } : s));
              setOutputs(rows => rows.map(o => o.sourceIndex === current.sourceIndex && !o.savedPhoto ? { ...o, approved: false, photoId: crypto.randomUUID() } : o)); changed.current = true;
            }}>Revenir au fond source</Button> : <Button size="sm" variant="outline" disabled={!!busy || !canStore} onClick={() => void run("Détourage…", async () => {
              const { data, error } = await invokeWithTimeout("photoroom-edit", { body: { image_base64: source.dataUrl, mode: "remove_bg", workspace_id: workspaceId } }, 130_000);
              if (error || !data?.image_base64) throw new Error(error?.message || data?.error || "Détourage indisponible.");
              const cutoutUrl = await sourceWithCutoutMask(await loadPhotoImage(source.dataUrl), data.image_base64);
              setSources(rows => rows.map((s, i) => i === current.sourceIndex ? { ...s, cutoutUrl, cutoutId: undefined } : s));
              setOutputs(rows => rows.map(o => o.sourceIndex === current.sourceIndex && !o.savedPhoto ? { ...o, approved: false, photoId: crypto.randomUUID() } : o)); changed.current = true;
            })}>Détourer cette photo · 1 crédit</Button>}
          </details>}
          <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Ma direction visuelle</summary>
            <p className="text-xs text-muted-foreground my-2">Retrouve le fond, les marges et la place du texte pour une collection ou une occasion.</p>
            {directions.length > 0 && <select aria-label="Direction enregistrée" className="w-full min-h-10 rounded border bg-background px-2 text-sm mb-2" value="" disabled={!!busy || current.savedPhoto} onChange={e => {
              const d = directions.find(d => d.id === e.target.value); if (d) editOutput({ recipe: { ...current.recipe, direction: cleanDirection(d.data) } });
            }}><option value="">Réutiliser une direction…</option>{directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
            <label className="text-xs">Décor souhaité pour les mises en scène (facultatif)<Textarea value={current.recipe.direction.scenePrompt} disabled={!!busy || current.savedPhoto} maxLength={400} placeholder="Une ambiance sobre, sans accessoire ni emballage ajouté…" onChange={e => editOutput({ recipe: { ...current.recipe, direction: { ...current.recipe.direction, scenePrompt: e.target.value } } })} /></label>
            <label className="text-xs">Nom de la direction<Input value={directionName} maxLength={120} disabled={!!busy} onChange={e => setDirectionName(e.target.value)} placeholder="Ma collection de septembre" /></label>
            <Button className="mt-2 w-full" size="sm" variant="outline" disabled={!!busy || !canStore || !directionName.trim()} onClick={() => void run("Enregistrement…", async () => {
              await savePhotoWorkflow({ id: crypto.randomUUID(), user_id: user!.id, workspace_id: workspaceId, kind: "direction",
                name: directionName.trim(), data: { ...current.recipe.direction } });
              setDirections(await listPhotoWorkflows(workspaceId, "direction")); setDirectionName(""); toast.success("Direction visuelle enregistrée.");
            })}>Enregistrer cette direction</Button>
          </details>
        </div>
      </div>
      {!isKit && sources.length === 1 && !outputs.some(o => o.savedPhoto) && <Button variant="outline" disabled={!!busy} onClick={startKit}>Préparer plusieurs formats et leurs textes</Button>}
      {isKit && <div className="rounded-xl border p-4 space-y-3">
        <p className="text-sm font-medium">Le message et les informations confirmées</p>
        <p className="text-xs text-muted-foreground">Renseigne ce que tu sais du produit. Une matière, un prix ou une disponibilité inconnus restent absents. Les textes proposés reprennent tes mots. Si le message est long, seul le nom du produit apparaît sur le visuel ; le texte complet reste dans la légende.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Nom du produit<Input value={fields.product} maxLength={120} disabled={!!busy} onChange={e => { const value = e.target.value; setFields(f => ({ ...f, product: value })); changed.current = true; }} /></label>
          <label className="text-sm">Message à partager<Input value={fields.message} maxLength={400} disabled={!!busy} onChange={e => { const value = e.target.value; setFields(f => ({ ...f, message: value })); changed.current = true; }} /></label>
          <label className="text-sm">Informations confirmées, une par ligne<Textarea value={fields.facts} maxLength={2000} disabled={!!busy} onChange={e => { const value = e.target.value; setFields(f => ({ ...f, facts: value })); changed.current = true; }} /></label>
          <label className="text-sm">Invitation à agir, si tu en souhaites une<Textarea value={fields.cta} maxLength={300} disabled={!!busy} onChange={e => { const value = e.target.value; setFields(f => ({ ...f, cta: value })); changed.current = true; }} /></label>
        </div>
        <Button variant="outline" disabled={!!busy || !fields.product.trim()} onClick={() => {
          if (outputs.some(o => o.caption) && !window.confirm("Remplacer les textes des visuels non enregistrés par tes informations actuelles ?")) return;
          const copy = confirmedPhotoCopy(fields.product, fields.facts, fields.message, fields.cta);
          setOutputs(rows => rows.map(o => o.savedPhoto ? o : { ...o, approved: false, photoId: crypto.randomUUID(),
            caption: o.recipe.format === "story" || o.recipe.format === "cover" ? copy.short : copy.caption,
            recipe: { ...o.recipe, text: o.recipe.format === "story" || o.recipe.format === "cover" ? (copy.short.length <= 240 ? copy.short : copy.title) : o.recipe.text,
              direction: { ...o.recipe.direction, textPosition: o.recipe.format === "story" || o.recipe.format === "cover" ? "top" : o.recipe.direction.textPosition } } })); changed.current = true;
        }}>Préparer les textes avec ces informations</Button>
        <label className="block text-sm">Texte associé à « {current.label} »<Textarea value={current.caption} maxLength={5000} disabled={!!busy || current.savedPhoto} onChange={e => editOutput({ caption: e.target.value })} /></label>
        {["cover", "banner"].includes(current.recipe.format) ? <p className="text-xs text-muted-foreground">Ce visuel se conserve dans Mes photos ou se télécharge. Une couverture seule n’est pas un Reel vidéo.</p> :
          <label className="block max-w-xs text-sm">Date du brouillon<Input type="date" value={current.date} disabled={!!busy || current.savedPost} onChange={e => {
            const date = e.target.value; setOutputs(rows => rows.map((o, i) => i === active ? { ...o, date } : o)); changed.current = true;
          }} /></label>}
      </div>}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button variant="outline" disabled={!!busy || !canStore} onClick={() => void run("Enregistrement…", async () => { await persist(); toast.success("Préparation enregistrée, tu peux la reprendre plus tard."); })}><FolderOpen className="h-4 w-4 mr-2" /> Enregistrer la préparation</Button>
        <Button disabled={!!busy || !canStore} onClick={() => void run("Enregistrement des copies…", () => saveOutputs(false))}>Enregistrer les copies validées</Button>
        {isKit && <Button disabled={!!busy || !canStore} onClick={() => void run("Création des brouillons…", () => saveOutputs(true))}>Enregistrer dans le calendrier</Button>}
        {outputs.some(o => o.savedPost) && <Button variant="outline" disabled={!!busy} onClick={() => {
          const post = outputs.find(o => o.savedPost)!; if (changed.current && !window.confirm("Ouvrir le calendrier sans enregistrer les derniers changements ?")) return;
          onOpenChange(false); navigate(`/calendrier?date=${post.date}&post=${post.postId}`);
        }}>Voir mes brouillons</Button>}
        <Button variant="ghost" className="text-foreground" disabled={!!busy} onClick={close}>Fermer</Button>
      </div>
      {(busy || savedAt) && <p role="status" className="text-xs text-muted-foreground flex items-center gap-2">{busy && <Loader2 className="h-3 w-3 animate-spin" />}{busy || savedAt}</p>}
    </>}
  </DialogContent>;
}
