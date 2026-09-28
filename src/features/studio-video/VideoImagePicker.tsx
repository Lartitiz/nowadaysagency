import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Image as ImageIcon, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUploadLibraryPhotos, useUserPhotos } from "@/hooks/use-user-photos";
import { getSignedPhotoUrls } from "@/lib/photo-storage";
import { listStudioSessions, studioRequest } from "@/features/visual-studio/api";
import { MAX_VIDEO_IMAGES, sourceKey, type VideoReference, type VideoSource } from "./sources";

export function VideoImagePicker({ workspaceId, initialImages, onConfirm, onClose }: {
  workspaceId: string; initialImages: VideoReference[];
  onConfirm: (images: VideoReference[]) => void; onClose: () => void;
}) {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [selected, setSelected] = useState(initialImages);
  const [tab, setTab] = useState<"library" | "studio">("library");
  const [limit, setLimit] = useState(200);
  const [search, setSearch] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const photos = useUserPhotos(limit);
  const upload = useUploadLibraryPhotos();
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let active = true;
    void getSignedPhotoUrls((photos.data || []).filter(p => p.status === "ready").map(p => p.storage_path))
      .then(result => { if (active) setUrls(result); }).catch(() => { if (active) setUrls(new Map()); });
    return () => { active = false; };
  }, [photos.data]);
  const sessions = useQuery({ queryKey: ["video-photo-sessions", workspaceId],
    queryFn: () => listStudioSessions(workspaceId), enabled: tab === "studio" });
  const studio = useQuery({ queryKey: ["video-photo-session", workspaceId, sessionId],
    queryFn: () => studioRequest({ action: "read", workspace_id: workspaceId, session_id: sessionId }),
    enabled: tab === "studio" && !!sessionId });
  function toggle(source: VideoSource) {
    setSelected(current => current.some(r => sourceKey(r) === sourceKey(source))
      ? current.filter(r => sourceKey(r) !== sourceKey(source))
      : current.length < MAX_VIDEO_IMAGES ? [...current, { ...source, role: "subject" }] : current);
  }
  function card(source: VideoSource, unavailable = false) {
    const checked = selected.some(r => sourceKey(r) === sourceKey(source));
    return <button type="button" key={sourceKey(source)} aria-label={source.name} aria-pressed={checked}
      disabled={uploading || (!checked && (unavailable || selected.length >= MAX_VIDEO_IMAGES))} onClick={() => toggle(source)}
      className={`relative min-w-0 rounded-lg border p-2 text-left disabled:opacity-50 ${checked ? "ring-2 ring-primary" : ""}`}>
      {source.previewUrl ? <img src={source.previewUrl} alt="" className="aspect-square w-full rounded object-cover" />
        : <ImageIcon aria-hidden className="aspect-square w-full p-8 bg-muted rounded" />}
      {checked && <Check aria-hidden className="absolute right-3 top-3 rounded-full bg-primary text-primary-foreground" />}
      <span className="block text-xs mt-2 break-words line-clamp-2">{source.name}</span>
      {unavailable && <span className="block text-xs">Personne identifiable : indisponible pour cet essai.</span>}
    </button>;
  }
  async function importFiles(files: File[]) {
    if (!files.length || uploading) return;
    const remaining = MAX_VIDEO_IMAGES - selected.length;
    if (files.length > remaining) { setError(`Il reste ${remaining} place${remaining > 1 ? "s" : ""}. Choisis moins de fichiers ou retire une référence.`); return; }
    setUploading(true); setError("");
    try {
      const result = await upload.mutate(files);
      if (!alive.current) return;
      if (result.photoIds.length) setSelected(current => [...current,
        ...result.photoIds.map(id => ({ kind: "photo" as const, id, name: "Photo importée", role: "subject" as const }))]);
      if (result.failed) setError(`${result.failed} photo(s) n’ont pas pu être importées. Les autres sont conservées.`);
      await photos.refetch();
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "L’import a échoué."); }
    finally { if (alive.current) setUploading(false); }
  }
  const ready = (photos.data || []).filter(p => p.status === "ready");
  const visible = ready.filter(p => (p.name || "Photo").toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <Dialog open onOpenChange={open => { if (!open && !uploading) onClose(); }}>
    <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Choisir les images de la vidéo</DialogTitle>
        <DialogDescription>Une image pour animer une scène, ou 2 à 4 références pour guider la même vidéo. Tes choix restent cochés.</DialogDescription></DialogHeader>
      <div className="flex gap-2 flex-wrap">
        <Button type="button" variant={tab === "library" ? "default" : "outline"} onClick={() => setTab("library")}>Ma bibliothèque</Button>
        <Button type="button" variant={tab === "studio" ? "default" : "outline"} onClick={() => setTab("studio")}>Créations du Studio Photo</Button>
      </div>
      {tab === "library" ? <>
        <Input aria-label="Rechercher une image" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une image…" />
        {photos.isLoading ? <p>Chargement des photos…</p> : photos.isError ? <p role="alert">Bibliothèque indisponible. <button onClick={() => void photos.refetch()}>Réessayer</button></p> :
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{visible.map(p => card({ kind: "photo", id: p.id,
            name: p.name || "Photo", previewUrl: urls.get(p.storage_path) }, ["portrait", "produit_porte"].includes(p.kind)))}</div>}
        {!photos.isLoading && !photos.isError && !visible.length && <p>Aucune image disponible. Importe des photos ou choisis une création du Studio Photo.</p>}
        {(photos.data?.length || 0) >= limit && <Button variant="outline" onClick={() => setLimit(n => n + 200)}>Afficher plus de photos</Button>}
        <label className="block text-sm space-y-2">Importer depuis mon appareil
          <input aria-label="Importer des photos" type="file" accept="image/*" multiple disabled={uploading || selected.length >= MAX_VIDEO_IMAGES}
            onChange={e => { void importFiles(Array.from(e.target.files || [])); e.target.value = ""; }} className="block max-w-full" />
        </label>
      </> : <>
        {sessions.isError && <p role="alert">Sessions indisponibles. <button onClick={() => void sessions.refetch()}>Réessayer</button></p>}
        <label className="text-sm">Session Photo
          <select aria-label="Session Photo" className="block w-full h-10 border rounded bg-background px-2" value={sessionId} onChange={e => setSessionId(e.target.value)}>
            <option value="">{sessions.isLoading ? "Chargement…" : "Choisir une session"}</option>
            {[...(sessions.data?.active || []), ...(sessions.data?.archived || [])].map(s => <option key={s.id} value={s.id}>{s.name}{s.archived_at ? " · archivée" : ""}</option>)}
          </select>
        </label>
        {studio.isFetching && <p>Chargement des créations…</p>}
        {studio.isError && <p role="alert">Créations indisponibles. <button onClick={() => void studio.refetch()}>Réessayer</button></p>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{studio.data?.versions.filter(v => v.status === "ready").map((v, i) => card({ kind: "studio_version", id: v.id,
          name: `${studio.data.session.name} · version ${i + 1}`, previewUrl: v.url }, (v.proposal as { requires_real_subject?: boolean; subject_kind?: string } | null)?.requires_real_subject === true || (v.proposal as { subject_kind?: string } | null)?.subject_kind === "portrait"))}</div>
        {studio.data && !studio.data.versions.some(v => v.status === "ready") && <p>Cette session n’a pas encore d’image terminée.</p>}
      </>}
      <div className="space-y-2" aria-label="Images sélectionnées">
        <p className="text-sm font-medium">{selected.length} / {MAX_VIDEO_IMAGES} images sélectionnées</p>
        {selected.map((r, i) => <div key={sourceKey(r)} className="flex gap-2 items-center text-sm"><span className="flex-1 min-w-0 truncate">{i + 1}. {r.name}</span>
          <Button size="sm" variant="ghost" aria-label={`Retirer ${r.name}`} disabled={uploading} onClick={() => toggle(r)}>Retirer</Button></div>)}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button variant="ghost" disabled={uploading} onClick={onClose}>Annuler</Button>
        <Button disabled={uploading} onClick={() => onConfirm(selected)}>{uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Utiliser la sélection ({selected.length})</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
