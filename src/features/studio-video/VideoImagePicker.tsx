import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Image as ImageIcon, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUploadLibraryPhotos, useUserPhotos } from "@/hooks/use-user-photos";
import { getSignedPhotoUrls } from "@/lib/photo-storage";
import { savedStudioVersions } from "./library-sources";
import { listStudioVideoSources } from "./api";
import { MAX_VIDEO_IMAGES, sourceKey, type VideoReference, type VideoSource } from "./sources";

export function VideoImagePicker({ workspaceId, initialImages, onConfirm, onClose }: {
  workspaceId: string; initialImages: VideoReference[];
  onConfirm: (images: VideoReference[]) => void; onClose: () => void;
}) {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [selected, setSelected] = useState(initialImages);
  const [limit, setLimit] = useState(200);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [importedIds, setImportedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const photos = useUserPhotos(limit);
  const ready = (photos.data || []).filter(p => p.status === "ready");
  const savedVersions = useQuery({ queryKey: ["video-saved-studio", workspaceId, ready.map(p => p.id).join(",")],
    queryFn: () => savedStudioVersions(workspaceId, ready.map(p => p.id)), enabled: ready.length > 0 });
  useEffect(() => {
    if (!savedVersions.data?.size) return;
    setSelected(current => current.map(ref => {
      const version = ref.kind === "photo" ? savedVersions.data.get(ref.id) : null;
      return version ? { ...ref, kind: "studio_version", id: version.id } : ref;
    }));
  }, [savedVersions.data]);
  const upload = useUploadLibraryPhotos();
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let active = true;
    void getSignedPhotoUrls((photos.data || []).filter(p => p.status === "ready").map(p => p.storage_path))
      .then(result => { if (active) setUrls(result); }).catch(() => { if (active) setUrls(new Map()); });
    return () => { active = false; };
  }, [photos.data]);
  const studioSources = useQuery({ queryKey: ["video-studio-sources", workspaceId],
    queryFn: () => listStudioVideoSources(workspaceId), staleTime: 5 * 60_000 });
  function toggle(source: VideoSource) {
    setSelected(current => current.some(r => sourceKey(r) === sourceKey(source))
      ? current.filter(r => sourceKey(r) !== sourceKey(source))
      : current.length < MAX_VIDEO_IMAGES ? [...current, { ...source, role: "" }] : current);
  }
  function card(source: VideoSource, unavailable = false) {
    const checked = selected.some(r => sourceKey(r) === sourceKey(source));
    return <button type="button" key={sourceKey(source)} aria-label={source.name} aria-pressed={checked}
      disabled={uploading || (!checked && (unavailable || selected.length >= MAX_VIDEO_IMAGES))} onClick={() => toggle(source)}
      className={`relative min-w-0 rounded-lg border p-2 text-left disabled:opacity-50 ${checked ? "ring-2 ring-primary" : ""}`}>
      {source.previewUrl ? <img src={source.previewUrl} alt="" className="aspect-square w-full rounded object-cover" />
        : <ImageIcon aria-hidden className="aspect-square w-full p-8 bg-muted rounded" />}
      {checked && <Check aria-hidden className="absolute right-3 top-3 rounded-full bg-primary text-primary-foreground" />}
      <span className="mt-2 line-clamp-2 break-words text-xs" title={source.name}>{source.name}</span>
      {unavailable && <span className="block text-xs">Référence classée comme portrait : indisponible pour cet essai.</span>}
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
      if (result.photoIds.length) {
        setImportedIds(current => [...current, ...result.photoIds]);
        setSelected(current => [...current,
          ...result.photoIds.map(id => ({ kind: "photo" as const, id, name: "Photo importée", role: "" as const }))]);
      }
      if (result.failed) setError(`${result.failed} photo(s) n’ont pas pu être importées. Les autres sont conservées.`);
      await photos.refetch();
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "L’import a échoué."); }
    finally { if (alive.current) setUploading(false); }
  }
  const visible = ready.filter(p => (p.name || "Photo").toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const pendingImports = importedIds.some(id => selected.some(r => r.kind === "photo" && r.id === id) &&
    !ready.some(p => p.id === id));
  return <Dialog open onOpenChange={open => { if (!open && !uploading) onClose(); }}>
    <DialogContent className="grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto] max-w-3xl max-h-[90dvh] overflow-hidden">
      <DialogHeader><DialogTitle>Choisir les images de la vidéo</DialogTitle>
        <DialogDescription>Sélectionne jusqu’à 4 images, puis clique sur « Ajouter ces images ». Tu indiqueras ensuite ce que représente chacune dans la vidéo.</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-y-auto space-y-4 pr-1">
      <div className="space-y-3">
        <p className="text-sm font-medium">Ma bibliothèque</p>
        {savedVersions.isError && <p role="alert" className="text-xs">Impossible de vérifier les créations du Studio enregistrées ici. <button className="underline" onClick={() => void savedVersions.refetch()}>Réessayer</button></p>}
        <Input aria-label="Rechercher une image" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une image…" />
        {photos.isLoading ? <p>Chargement des photos…</p> : photos.isError ? <p role="alert">Bibliothèque indisponible. <button onClick={() => void photos.refetch()}>Réessayer</button></p> :
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{visible.map(p => {
            const studioVersion = savedVersions.data?.get(p.id);
            return card({ kind: studioVersion ? "studio_version" : "photo", id: studioVersion?.id || p.id,
              name: p.name || "Photo", previewUrl: urls.get(p.storage_path) },
              ["portrait", "produit_porte"].includes(p.kind) && !studioVersion);
          })}</div>}
        {!photos.isLoading && !photos.isError && !visible.length && <p>Aucune photo dans la bibliothèque pour cette recherche.</p>}
        {(photos.data?.length || 0) >= limit && <Button variant="outline" onClick={() => setLimit(n => n + 200)}>Afficher plus de photos</Button>}
        <label className="block text-sm space-y-2">Importer depuis mon appareil
          <input aria-label="Importer des photos" type="file" accept="image/*" multiple disabled={uploading || selected.length >= MAX_VIDEO_IMAGES}
            onChange={e => { void importFiles(Array.from(e.target.files || [])); e.target.value = ""; }} className="block max-w-full" />
        </label>
      </div>
      {studioSources.isLoading && <p className="text-sm">Chargement des créations du Studio…</p>}
      {studioSources.isError && <p role="alert" className="text-sm">Créations du Studio indisponibles. <button className="underline" onClick={() => void studioSources.refetch()}>Réessayer</button></p>}
      {!!studioSources.data?.sources.filter(s => s.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).length && <div className="space-y-3">
        <p className="text-sm font-medium">Créations du Studio Photo</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{studioSources.data.sources
          .filter(s => s.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(s => card(s))}</div>
      </div>}
      <div className="space-y-2" aria-label="Images sélectionnées">
        <p className="text-sm font-medium">{selected.length} / {MAX_VIDEO_IMAGES} images sélectionnées</p>
        {selected.map((r, i) => <div key={sourceKey(r)} className="flex gap-2 items-center text-sm"><span className="flex-1 min-w-0 truncate">{i + 1}. {r.name}</span>
          <Button size="sm" variant="ghost" aria-label={`Retirer ${r.name}`} disabled={uploading} onClick={() => toggle(r)}>Retirer</Button></div>)}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {pendingImports && <p role="status" className="text-sm">Tes nouvelles photos se préparent. Tu pourras les ajouter dès que leurs vignettes apparaîtront.</p>}
      </div>
      <DialogFooter>
        <Button variant="ghost" disabled={uploading} onClick={onClose}>Annuler</Button>
        <Button disabled={uploading || pendingImports} onClick={() => onConfirm(selected.map(ref => {
          const photo = ref.kind === "photo" ? ready.find(p => p.id === ref.id) : null;
          return photo ? { ...ref, name: photo.name || ref.name, previewUrl: urls.get(photo.storage_path) || ref.previewUrl } : ref;
        }))}>{uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ajouter ces images ({selected.length})</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
