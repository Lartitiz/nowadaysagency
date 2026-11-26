// Images proposées d'office sur un carrousel écrit sans photo (26/11/2026) :
// voir src/lib/carousel-photo-proposals.ts. Le texte s'affiche d'abord ; ce hook
// cherche ensuite, en arrière-plan, une image par slide « Image à choisir »
// (bibliothèque, sinon photo libre de droit vérifiée) et les pose. Un échec ne
// se voit pas : les slides restent simplement à choisir.
import { useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import { userPhotoToBase64, type UserPhotoRow } from "@/lib/photo-storage";
import { stockPhotoToPhotoItem } from "@/lib/stock-photos";
import {
  applyPhotoProposals, fetchPhotoProposals, isPexelsPhoto, proposalTargets, sameCarousel, slidePassage, toStockPhoto,
  type ResolvedProposal,
} from "@/lib/carousel-photo-proposals";

export function usePhotoProposals({
  enabled, result, subject, libraryRows, workspaceId, uploadedPhotosLiveRef, setUploadedPhotos, savePhotos, setResult,
}: {
  /** Carrousel affiché, hors démo, sans génération en cours. */
  enabled: boolean;
  result: any;
  subject: string;
  /** Photos de la bibliothèque qui ont une description (les mêmes que le régime texte d'abord). */
  libraryRows: UserPhotoRow[];
  workspaceId: string | null | undefined;
  uploadedPhotosLiveRef: MutableRefObject<any[]>;
  setUploadedPhotos: Dispatch<SetStateAction<PhotoItem[]>>;
  savePhotos: (photos: any[]) => Promise<unknown>;
  setResult: (update: (prev: any) => any) => void;
}): { searching: boolean } {
  const [searching, setSearching] = useState(false);
  const runningRef = useRef(false);
  // Demandes en échec pendant cette visite : pas redemandées en boucle, retentées au prochain chargement.
  const failedRef = useRef(new Set<string>());
  const libraryRef = useRef(libraryRows);
  libraryRef.current = libraryRows;
  const raw = result?.raw;
  const rawRef = useRef(raw);
  rawRef.current = raw;

  useEffect(() => {
    if (!enabled || runningRef.current) return;
    const targets = proposalTargets(raw, (uploadedPhotosLiveRef.current || []).length);
    if (!targets.length) return;
    const key = targets.map((t) => slidePassage(raw.slides[t - 1])).join("\u0001");
    if (failedRef.current.has(key)) return;
    runningRef.current = true;
    setSearching(true);
    const rows = libraryRef.current;
    const passages = targets.map((t) => slidePassage(raw.slides[t - 1]));
    (async () => {
      let resolved: ResolvedProposal[] = passages.map((passage) => ({ passage, ideal: null, source: null, photoIndex: null, alternates: [] }));
      const items: (PhotoItem | null)[] = [];
      let failed = false;
      try {
        const proposals = await fetchPhotoProposals({ raw, targets, subject, libraryRows: rows, workspaceId });
        const bySlide = new Map(proposals.map((p) => [p.slide, p]));
        const loaded = await Promise.all(targets.map(async (t): Promise<PhotoItem | null> => {
          const p = bySlide.get(t);
          try {
            const row = p?.library_index ? rows[p.library_index - 1] : undefined;
            if (row) {
              const { base64, mimeType, name } = await userPhotoToBase64(row);
              return { id: row.id, userPhotoId: row.id, base64, preview: base64, name, mimeType, context: "", stockAmbient: true };
            }
            if (isPexelsPhoto(p?.stock)) return { ...(await stockPhotoToPhotoItem(toStockPhoto(p!.stock!))), stockAmbient: true };
          } catch (e) {
            console.warn("[photo-proposals] image non chargée, slide laissée à choisir", e);
          }
          return null;
        }));
        resolved = targets.map((t, k) => {
          const p = bySlide.get(t);
          const item = loaded[k];
          items.push(item);
          return {
            passage: passages[k], ideal: p?.ideal || null, photoIndex: null,
            source: item ? (item.userPhotoId ? "library" : "stock") : null,
            libraryId: item?.userPhotoId, stock: item && !item.userPhotoId ? p?.stock || undefined : undefined,
            alternates: item && !item.userPhotoId ? (p?.alternates || []).filter(isPexelsPhoto) : [],
          };
        });
      } catch (e) {
        console.warn("[photo-proposals] propositions indisponibles, slides laissées à choisir", e);
        failed = true;
        failedRef.current.add(key);
      }
      // Ajout au set du carrousel APRÈS les photos déjà là (l'ordre fait foi pour photo_index).
      const next = [...(uploadedPhotosLiveRef.current || [])];
      resolved.forEach((r, k) => {
        const item = items[k];
        if (!item) return;
        const existing = item.userPhotoId ? next.findIndex((p: any) => p.userPhotoId && p.userPhotoId === item.userPhotoId) : -1;
        if (existing >= 0) r.photoIndex = existing + 1;
        else { next.push(item); r.photoIndex = next.length; }
      });
      // Nouvelle génération pendant la recherche : rien n'est posé ni marqué, on recommencera pour elle.
      if (!failed && sameCarousel(rawRef.current, passages)) {
        if (next.length > (uploadedPhotosLiveRef.current || []).length) {
          setUploadedPhotos(next);
          void savePhotos(next);
        }
        setResult((prev: any) => (prev?.raw && sameCarousel(prev.raw, passages) ? { ...prev, raw: applyPhotoProposals(prev.raw, resolved) } : prev));
      }
      runningRef.current = false;
      setSearching(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, raw, searching]);

  return { searching };
}
