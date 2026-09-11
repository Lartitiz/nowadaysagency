import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PhotoEditDialog } from "./PhotoEditDialog";
import PhotoSwapDialog from "./PhotoSwapDialog";
import type { PhotoItem } from "./PhotoUploadZone";
import { urlToDataUrl } from "@/lib/story-photos";

type EditablePhoto = Partial<PhotoItem>;

/** Edits one photo without regenerating or replacing the post's caption. */
export default function PostPhotoEditor({ photo, onChange }: {
  photo: EditablePhoto;
  onChange: (photo: PhotoItem) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState("");
  const asDataUrl = (value: string, mime = "image/jpeg") => value.startsWith("data:") ? value : `data:${mime};base64,${value}`;
  const currentData = async () => {
    const data = photo.base64 ? asDataUrl(photo.base64, photo.mimeType) : photo.preview ? await urlToDataUrl(photo.preview) : null;
    if (!data) throw new Error("Impossible de charger cette photo. Réessaie.");
    return data;
  };
  const beginEdit = async () => {
    setBusy(true);
    try { setSource(await currentData()); setEditing(true); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Photo indisponible."); }
    finally { setBusy(false); }
  };
  const apply = async (next: PhotoItem) => {
    setBusy(true);
    try {
      const original = next.originalBase64 || photo.originalBase64 || await currentData();
      await onChange({ ...next, originalBase64: original,
        originalMimeType: next.originalMimeType || photo.originalMimeType || photo.mimeType || original.match(/^data:([^;]+)/)?.[1] || "image/jpeg",
        edited: next.edited !== false,
      });
      setEditing(false); setReplacing(false);
      toast.success("Photo mise à jour, ta légende est conservée.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "La photo n'a pas pu être enregistrée. Réessaie."); }
    finally { setBusy(false); }
  };
  const applyEdit = (data: string) => apply({
    ...photo, id: photo.id || crypto.randomUUID(), name: photo.name || "Photo du post",
    base64: data, preview: data, mimeType: data.match(/^data:([^;]+)/)?.[1] || "image/jpeg",
    originalBase64: photo.originalBase64 || source,
    originalMimeType: photo.originalMimeType || photo.mimeType || source.match(/^data:([^;]+)/)?.[1] || "image/jpeg",
    edited: true,
  });
  return <div className="space-y-2">
    <div className="flex flex-wrap justify-center gap-2">
      <Button variant="outline" disabled={busy} onClick={beginEdit}>Retoucher la photo</Button>
      <Button variant="outline" disabled={busy} onClick={() => setReplacing(true)}>Remplacer la photo</Button>
      {photo.originalBase64 && photo.edited && <Button variant="ghost" disabled={busy} onClick={() => {
        const data = asDataUrl(photo.originalBase64!, photo.originalMimeType);
        void apply({ ...photo, name: photo.name || "Photo du post", base64: data, preview: data, mimeType: photo.originalMimeType || "image/jpeg", edited: false });
      }}>Revenir à l’originale</Button>}
    </div>
    {busy && <p role="status" className="text-center text-sm text-muted-foreground">Préparation de la photo…</p>}
    {editing && <PhotoEditDialog open={editing} onOpenChange={value => { if (!busy) setEditing(value); }} originalBase64={source} name={photo.name} onApply={data => { if (!busy) void applyEdit(data); }} />}
    {replacing && <PhotoSwapDialog open={replacing} onOpenChange={value => { if (!busy) setReplacing(value); }} onSelect={next => { if (!busy) void apply(next); }} />}
  </div>;
}
