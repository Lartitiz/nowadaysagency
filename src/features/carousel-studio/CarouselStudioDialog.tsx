import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import type { EditorSlide } from "@/lib/carousel-editor";
import { draftKey, studioRequest } from "@/features/visual-studio/api";
import { uploadPhotoOriginal } from "@/lib/photo-storage";
import { buildSlideBrief, saveTicket, slideFingerprint, type CarouselStudioTicket } from "./bridge";
import { carouselStudioStore } from "./store";

export function CarouselStudioDialog({ userId, workspaceId, isOwnSpace = false, ideaId, raw, slideId, photos, flush, isCurrent, onClose }: {
  userId: string; workspaceId: string; isOwnSpace?: boolean; ideaId: string; raw: any; slideId: string; photos: PhotoItem[];
  flush: () => Promise<boolean>; isCurrent: () => boolean; onClose: () => void;
}) {
  const navigate = useNavigate();
  const slides: EditorSlide[] = raw.slides.map((data: any, i: number) => ({ id: data.editor_id, data, html: raw.visual_html?.[i]?.html || "", locked: !!data.editor_locked }));
  const slide = slides.find(s => s.id === slideId)!;
  const [brief, setBrief] = useState(() => buildSlideBrief(slide, slides));
  const [selected, setSelected] = useState<number[]>(() => {
    const found = photos.findIndex(p => !!slide.data.photo_library_id && p.userPhotoId === slide.data.photo_library_id);
    const n = found >= 0 ? found : Number(slide.data.photo_index) - 1;
    return n >= 0 && photos[n] && (photos[n].base64 || photos[n].preview || photos[n].userPhotoId) ? [n] : [];
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  // Stable IDs make retries reuse the session and uploaded originals.
  const launch = useRef({ id: crypto.randomUUID(), sessionId: crypto.randomUUID(), uploads: new Map<number, string>() });
  const start = async () => {
    if (lock.current || !brief.trim() || brief.length > 6000 || !isCurrent()) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (!await flush() || !isCurrent()) throw new Error("Enregistre d’abord les dernières retouches du carrousel, puis réessaie.");
      const row = await carouselStudioStore(userId, workspaceId, isOwnSpace).read(ideaId);
      if (!isCurrent()) return;
      const data = row?.content_data?.slides?.find((s: any) => s.editor_id === slideId);
      const index = row?.content_data?.slides?.indexOf(data);
      if (!data || data.editor_locked || row?.content_data?._carousel_document_id !== raw._carousel_document_id) throw new Error("Cette slide a changé. Ferme cette fenêtre et reprends-la.");
      const ticket: CarouselStudioTicket = { id: launch.current.id, sessionId: launch.current.sessionId, userId, workspaceId, isOwnSpace, ideaId,
        documentId: raw._carousel_document_id, slideId, slideNumber: index + 1, photoCount: photos.length, createdAt: Date.now(),
        fingerprint: await slideFingerprint({ id: slideId, data, html: row.content_data.visual_html?.[index]?.html || "", locked: !!data.editor_locked }) };
      saveTicket(ticket);
      let state = await studioRequest({ action: "create", workspace_id: workspaceId, session_id: ticket.sessionId });
      for (const i of selected) {
        if (!isCurrent()) return;
        const photo = photos[i];
        let id = photo.userPhotoId || launch.current.uploads.get(i);
        if (!id) {
          const bytes = photo.originalBase64 || photo.base64 || photo.preview;
          if (!bytes) throw new Error(`La référence « ${photo.name} » est indisponible. Recharge-la avant de continuer.`);
          const url = /^(data:|https:\/\/)/.test(bytes) ? bytes : `data:${photo.originalMimeType || photo.mimeType || "image/jpeg"};base64,${bytes}`;
          const blob = await (await fetch(url)).blob();
          if (!isCurrent()) return;
          const uploaded = await uploadPhotoOriginal({ file: new File([blob], photo.name, { type: blob.type }), userId, workspaceId, purpose: "library", name: photo.name });
          id = uploaded.photoId; launch.current.uploads.set(i, id);
        }
        if (!isCurrent()) return;
        if (!state.session.references?.some(r => r.photo_id === id)) state = await studioRequest({ action: "reference", workspace_id: workspaceId, session_id: ticket.sessionId, photo_id: id, reference_role: "auto", revision: state.session.revision });
      }
      if (!isCurrent()) return;
      const selectedPhotoIds = selected.map(i => photos[i].userPhotoId || launch.current.uploads.get(i));
      const ids = (state.session.references || []).filter(r => selectedPhotoIds.includes(r.photo_id || "")).map(r => r.id);
      await studioRequest({ action: "selection", workspace_id: workspaceId, session_id: ticket.sessionId, reference_ids: ids, revision: state.session.revision, new_request: true, viewed_version_id: null });
      if (!isCurrent()) return;
      localStorage.setItem(draftKey(userId, workspaceId, ticket.sessionId), brief);
      localStorage.setItem(`${draftKey(userId, workspaceId, ticket.sessionId)}:images`, JSON.stringify(ids));
      navigate(`/photos/studio?session=${ticket.sessionId}&carousel_return=${ticket.id}`);
    } catch (e) { if (isCurrent()) setError(e instanceof Error ? e.message : "Ouverture impossible. Réessaie."); }
    finally { lock.current = false; if (isCurrent()) setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Créer une image pour la slide {slides.indexOf(slide) + 1}</DialogTitle>
        <DialogDescription>Vérifie l’idée et les références. Le Studio proposera une reformulation avant toute génération.</DialogDescription></DialogHeader>
      <label className="text-sm">Demande au Studio<Textarea aria-label="Demande au Studio" value={brief} disabled={busy} onChange={e => setBrief(e.target.value)} className="min-h-56 max-h-64 overflow-y-auto mt-2" /></label>
      {!!photos.length && <fieldset disabled={busy}><legend className="text-sm mb-2">Références à joindre · {selected.length} / 8</legend>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">{photos.map((p, i) => <label key={p.id || i} className="border rounded p-2 text-xs">
          <img src={p.preview || p.base64} alt={p.name} className="h-20 w-full object-cover mb-1" />
          <input type="checkbox" checked={selected.includes(i)} disabled={(!p.base64 && !p.preview && !p.userPhotoId) || (!selected.includes(i) && selected.length >= 8)} onChange={e => setSelected(s => e.target.checked ? [...s, i] : s.filter(n => n !== i))} /> {p.name}
        </label>)}</div></fieldset>}
      <p className="text-xs text-muted-foreground">Tu pourras joindre d’autres références dans le Studio et expliquer leur rôle dans ton message. Les images importées sont conservées dans ta bibliothèque.</p>
      {brief.length > 6000 && <p role="alert" className="text-sm text-destructive">La demande dépasse les 6 000 caractères du Studio. Raccourcis le contexte en conservant le texte final de cette slide.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Annuler</Button><Button disabled={busy || !brief.trim() || brief.length > 6000} onClick={() => void start()}>{busy ? "Préparation du Studio…" : "Ouvrir dans le Studio"}</Button></div>
    </DialogContent>
  </Dialog>;
}
