// Photos du parcours /creer : préchargement depuis la photothèque, rechargement
// après un rafraîchissement, copie de sécurité, ajout d'une photo à une slide et
// pose automatique des photos de la bibliothèque (régime texte d'abord).
// Sorti à l'identique de CreerUnifie.tsx (lot H, docs/robustesse/gros-fichiers.md, fiche 1).
// Un hook par bloc, chacun appelé par la page à l'endroit exact où vivait son bloc :
// l'ordre des effets ne change pas (le rechargement attend le préchargement, la
// génération lit firstProductRef). Recevoir les ENVELOPPES saveFlowState/savePhotos
// de la page (garde isCurrentCreation), jamais celles de use-flow-persistence.
import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loadPhotos, loadPhotosLocal } from "@/hooks/use-flow-persistence";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import { userPhotoToBase64, type UserPhotoRow } from "@/lib/photo-storage";
import { carouselLibraryContext } from "@/lib/carousel-photo-context";
import { SUJET_PREMIER_CONTENU_GENERIQUE } from "@/lib/first-content-url";
import { rebindReceiptsAfterPhotoCast } from "../../supabase/functions/_shared/carousel-editorial-snapshot";

type SetPhotos = Dispatch<SetStateAction<PhotoItem[]>>;
type SavePhotos = (photos: any[]) => Promise<unknown>;

export function useLibraryPhotosPreload({
  locState, searchParams, creationId, conflictPending, workspaceId, ideaText, autoGeneratePendingRef,
  savePhotos, setIsLoadingLibraryPhotos, setStep, setCarouselSubMode, setIdeaText, setUploadedPhotos,
}: {
  locState: any;
  searchParams: URLSearchParams;
  creationId: string;
  conflictPending: boolean;
  workspaceId: string | null | undefined;
  ideaText: string;
  autoGeneratePendingRef: MutableRefObject<boolean>;
  savePhotos: SavePhotos;
  setIsLoadingLibraryPhotos: (value: boolean) => void;
  setStep: (step: any) => void;
  setCarouselSubMode: (mode: any) => void;
  setIdeaText: (text: string) => void;
  setUploadedPhotos: SetPhotos;
}) {
  // ── Library photos → preload as if uploaded (chemin /photos → /creer) ──
  // Capturé une seule fois au mount pour survivre au cleanup replaceState.
  const libraryPhotoIdsRef = useRef<string[]>(
    Array.isArray(locState?.libraryPhotoIds)
      ? locState.libraryPhotoIds.filter((x: unknown): x is string => typeof x === "string")
      : [],
  );
  const firstProductRef = useRef(searchParams.get("firstProduct") === "1");
  const sujetSansPhotoRef = useRef((searchParams.get("sujetSansPhoto") || "").trim());
  const libraryLoadedRef = useRef(false);
  const initialCreationId = useRef(creationId);
  useEffect(() => {
    if (conflictPending || creationId !== initialCreationId.current || libraryLoadedRef.current) return;
    if (libraryPhotoIdsRef.current.length === 0 && !firstProductRef.current) return;
    if (!workspaceId) return; // attend que le workspace soit prêt
    libraryLoadedRef.current = true;
    let cancelled = false;

    (async () => {
      setIsLoadingLibraryPhotos(true);
      setStep("format");
      try {
        if (libraryPhotoIdsRef.current.length === 0 && firstProductRef.current) {
          const { data: sitePhotos, error: siteError } = await supabase
            .from("user_photos")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("status", "ready")
            .eq("source_type", "imported")
            .not("source_image_url", "is", null)
            .is("removed_from_library_at", null)
            .order("created_at", { ascending: false })
            .limit(8);
          if (siteError) throw siteError;
          libraryPhotoIdsRef.current = (sitePhotos ?? []).map((photo) => photo.id);
        }
        const ids = libraryPhotoIdsRef.current;
        if (ids.length === 0 && firstProductRef.current) {
          // 1er contenu « produits » sans aucune photo (pas de site, ou site sans
          // photo) : l'écran de choix reste ouvert, sans génération automatique
          // (#1147), mais pré-réglé en carrousel texte sur l'idée du diagnostic.
          // Avant : mode photo vide (« il faut au moins une photo ») et aucun
          // sujet, d'où un brouillon « Mon carrousel » / « Sans titre » au
          // calendrier (passe compte neuf du 10/10).
          if (cancelled) return;
          firstProductRef.current = false;
          autoGeneratePendingRef.current = false;
          setCarouselSubMode("text");
          setIdeaText(sujetSansPhotoRef.current || SUJET_PREMIER_CONTENU_GENERIQUE);
          return;
        }
        if (ids.length === 0) return; // le sélecteur manuel reste disponible
        const { data, error: qErr } = await supabase
          .from("user_photos")
          .select("*")
          .in("id", ids)
          .eq("workspace_id", workspaceId)
          .eq("status", "ready");
        if (qErr) throw qErr;
        if (!data || data.length === 0) throw new Error("Photo introuvable dans ta photothèque.");

        const ordered = ids
          .map((id) => data.find((p) => p.id === id))
          .filter(Boolean) as UserPhotoRow[];

        const results = await Promise.allSettled(ordered.map((p) => userPhotoToBase64(p)));
        const items: PhotoItem[] = [];
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            items.push({
              id: crypto.randomUUID(),
              base64: r.value.base64,
              preview: r.value.base64,
              name: r.value.name,
              mimeType: r.value.mimeType,
              context: "",
              libraryContext: carouselLibraryContext(ordered[i]),
              userPhotoId: ordered[i].id,
            });
          }
        });
        const failedCount = ids.length - items.length;
        if (firstProductRef.current) {
          // Plusieurs URL du site peuvent mener au même fichier : ne garder
          // qu'une occurrence avant de composer le premier carrousel.
          const seen = new Set<string>();
          const distinct = items.filter((photo) => {
            if (seen.has(photo.base64)) return false;
            seen.add(photo.base64);
            return true;
          }).slice(0, 6);
          items.splice(0, items.length, ...distinct);
        }
        if (cancelled) return;
        if (items.length === 0) throw new Error("Impossible de charger la photo.");
        if (failedCount > 0) {
          toast.warning(failedCount > 1 ? `${failedCount} photos n'ont pas pu être chargées. Vérifie ta sélection avant de créer le contenu.` : "1 photo n'a pas pu être chargée. Vérifie ta sélection avant de créer le contenu.");
        }
        setUploadedPhotos(items);
        if (items.length > 0) savePhotos(items);

        // Préremplir ideaText avec photo.name si descriptif
        const first = ordered[0];
        const candidate = (first?.name ?? "").trim();
        const looksLikeFilename = /^(img|dsc|dscn|photo|p)[\W_]?\d+/i.test(candidate);
        // Après onboarding, le nom automatique d’une photo n’est pas un sujet choisi.
        if (!firstProductRef.current && !ideaText && candidate.length >= 8 && !looksLikeFilename) {
          setIdeaText(candidate);
        }
        if (firstProductRef.current && autoGeneratePendingRef.current) {
          setStep("result");
        }
      } catch (e: any) {
        if (cancelled) return;
        toast.error(e?.message || "Impossible de charger la photo de la photothèque.");
        setStep("idea");
      } finally {
        if (!cancelled) setIsLoadingLibraryPhotos(false);
      }
    })();
    return () => { cancelled = true; libraryLoadedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, conflictPending, creationId]);

  return { libraryPhotoIdsRef, firstProductRef, initialCreationId };
}

export function usePhotosRehydration({
  conflictPending, creationId, initialCreationId, shouldRestore, libraryPhotoIdsRef, uploadedPhotos, workspaceId,
  setPhotosRestored, setUploadedPhotos, setGeneratedWithPhotos,
}: {
  conflictPending: boolean;
  creationId: string;
  initialCreationId: MutableRefObject<string>;
  shouldRestore: boolean;
  libraryPhotoIdsRef: MutableRefObject<string[]>;
  uploadedPhotos: PhotoItem[];
  workspaceId: string | null | undefined;
  setPhotosRestored: (value: boolean) => void;
  setUploadedPhotos: SetPhotos;
  setGeneratedWithPhotos: Dispatch<SetStateAction<any[]>>;
}) {
  // ── Rehydrate les photos après restauration du flux (recyclage d'onglet,
  // refresh). Base64 local depuis IndexedDB + originaux photothèque re-
  // téléchargés depuis le serveur. Voir use-flow-persistence (hybride). ──
  const photosRehydratedRef = useRef(false);
  useEffect(() => {
    if (conflictPending || creationId !== initialCreationId.current || photosRehydratedRef.current) return;
    if (!shouldRestore) { setPhotosRestored(true); return; }
    // Le chemin "Partir de la photothèque" (locState.libraryPhotoIds) gère
    // déjà son propre chargement — ne pas le doubler.
    if (libraryPhotoIdsRef.current.length > 0) return;
    const manifest = loadPhotos();
    if (manifest.length === 0) { photosRehydratedRef.current = true; setPhotosRestored(true); return; }
    if (uploadedPhotos.length > 0) { photosRehydratedRef.current = true; setPhotosRestored(true); return; }
    // Les originaux photothèque ont besoin du workspace pour le refetch.
    const needsWorkspace = manifest.some((m) => m.local === false);
    if (needsWorkspace && !workspaceId) return; // attend que le workspace soit prêt

    photosRehydratedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const local = await loadPhotosLocal();
        const needFetch = local.filter((p: any) => p.needsLibraryFetch && p.userPhotoId);
        const byUserPhotoId: Record<string, { base64: string; mimeType?: string; name?: string; libraryContext?: string }> = {};
        if (needFetch.length > 0 && workspaceId) {
          const ids = needFetch.map((p: any) => p.userPhotoId as string);
          const { data } = await supabase
            .from("user_photos")
            .select("*")
            .in("id", ids)
            .eq("workspace_id", workspaceId)
            .eq("status", "ready");
          const rows = (data || []) as UserPhotoRow[];
          const results = await Promise.allSettled(rows.map((r) => userPhotoToBase64(r)));
          results.forEach((res, i) => {
            if (res.status === "fulfilled") {
              byUserPhotoId[rows[i].id] = {
                base64: res.value.base64,
                mimeType: res.value.mimeType,
                name: res.value.name,
                libraryContext: carouselLibraryContext(rows[i]),
              };
            }
          });
        }
        const merged = local
          .map((p: any) => {
            if (!p.needsLibraryFetch) return p;
            const lib = p.userPhotoId ? byUserPhotoId[p.userPhotoId] : undefined;
            if (!lib) return { ...p, missingLocalPhoto: true }; // Keep the reference and slot on a failed refetch.
            return {
              ...p,
              base64: lib.base64,
              preview: lib.base64,
              mimeType: p.mimeType || lib.mimeType,
              name: p.name || lib.name,
              libraryContext: p.libraryContext || lib.libraryContext,
              needsLibraryFetch: undefined,
            };
          })
          .filter(Boolean) as PhotoItem[];
        if (cancelled) return;
        if (merged.length === 0) {
          // Toutes les photos perdues (base64 local évincé + refetch impossible) :
          // on le DIT au lieu de repartir en silence sur un carrousel sans photos.
          if (manifest.length > 0) {
            toast.warning("Tes photos n'ont pas pu être rechargées. Ré-ajoute-les avant de régénérer les visuels.");
          }
          return;
        }
        setUploadedPhotos((prev) => (prev.length > 0 ? prev : merged));
        setGeneratedWithPhotos((prev) => (prev.length > 0 ? prev : merged));
        if (merged.length < manifest.length || merged.some((photo: any) => photo.missingLocalPhoto)) {
          toast.warning("Certaines photos n'ont pas pu être rechargées.");
        }
      } catch (e) {
        console.warn("[creer] rehydrate photos failed", e);
      } finally { if (!cancelled) setPhotosRestored(true); }
    })();
    return () => { cancelled = true; photosRehydratedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, conflictPending, creationId]);
}

export function usePhotosSnapshot({
  uploadedPhotos, selectedFormat, photoMode, carouselPhotoCountRef, setGeneratedWithPhotos, savePhotos,
}: {
  uploadedPhotos: PhotoItem[];
  selectedFormat: string | null;
  photoMode: boolean;
  carouselPhotoCountRef: MutableRefObject<number>;
  setGeneratedWithPhotos: Dispatch<SetStateAction<any[]>>;
  savePhotos: SavePhotos;
}) {
  // Snapshot défensif : sync uploadedPhotos -> generatedWithPhotos dès qu'on a
  // des photos. Évite la perte si le state UI est reset entre l'upload et la
  // génération du visuel (changement d'onglet, re-render, etc.).
  useEffect(() => {
    carouselPhotoCountRef.current = uploadedPhotos.length;
    if (uploadedPhotos.length > 0) {
      // Compare le CONTENU, pas juste la longueur : un swap de photo à cardinalité
      // constante doit aussi rafraîchir le snapshot (sinon repli sur d'anciennes photos).
      setGeneratedWithPhotos((prev) =>
        prev.length === uploadedPhotos.length && prev.every((p, i) => p === uploadedPhotos[i])
          ? prev
          : uploadedPhotos,
      );
      if (selectedFormat === "carousel" || photoMode) {
        savePhotos(uploadedPhotos);
      }
    }
  }, [uploadedPhotos, selectedFormat, photoMode]);
}

export function useAddCarouselPhoto({
  uploadedPhotos, carouselPhotoCountRef, setUploadedPhotos,
}: {
  uploadedPhotos: PhotoItem[];
  carouselPhotoCountRef: MutableRefObject<number>;
  setUploadedPhotos: SetPhotos;
}) {
  // Remplacement de la photo d'une slide de carrousel (depuis CarouselPhotoResult).
  // Ajoute la photo choisie au set du carrousel si elle est nouvelle (ou retrouve son
  // index si elle y est déjà) et renvoie son index 1-based. L’éditeur applique
  // directement l’image au document sans génération IA.
  const handleAddCarouselPhoto = useCallback(
    (photo: PhotoItem): number => {
      const matches = (p: any) =>
        (photo.id && p.id === photo.id) || (p.base64 && p.base64 === photo.base64);
      const existingIdx = uploadedPhotos.findIndex(matches);
      if (existingIdx >= 0) return existingIdx + 1;
      // Deux ajouts avant re-render voient la même longueur closurée : le compteur
      // ref garantit des index distincts (sinon deux slides pointent la même photo).
      const newIndex = Math.max(uploadedPhotos.length, carouselPhotoCountRef.current) + 1;
      carouselPhotoCountRef.current = newIndex;
      setUploadedPhotos((prev) => (prev.some(matches) ? prev : [...prev, photo]));
      return newIndex;
    },
    [uploadedPhotos],
  );

  return handleAddCarouselPhoto;
}

export function useLibraryAutoCast({
  result, textFirstRowsSnapshotRef, uploadedPhotosLiveRef, setUploadedPhotos, savePhotos, setResult,
}: {
  result: any;
  textFirstRowsSnapshotRef: MutableRefObject<UserPhotoRow[]>;
  uploadedPhotosLiveRef: MutableRefObject<any[]>;
  setUploadedPhotos: SetPhotos;
  savePhotos: SavePhotos;
  setResult: (update: (prev: any) => any) => void;
}) {
  // ═══ Casting automatique bibliothèque (régime texte d'abord) ═══
  // L'edge renvoie library_photo_index quand une photo de la bibliothèque matche
  // strictement la directive d'une slide. On charge ces photos (URL signée → base64),
  // on les ajoute au set du carrousel et on pose photo_index — la slide arrive
  // « pré-castée » (badge via cast_source). Les slides sans match restent à caster.
  const autoCastRef = useRef<any>(null);
  useEffect(() => {
    const rawSlides = result?.raw?.slides;
    if (!Array.isArray(rawSlides)) return;
    if (autoCastRef.current === result) return;
    const toCast = rawSlides.filter(
      (s: any) => Number.isInteger(s?.library_photo_index) && !Number.isInteger(s?.photo_index),
    );
    if (toCast.length === 0) return;
    autoCastRef.current = result;
    const rows = textFirstRowsSnapshotRef.current;
    (async () => {
      const resolved = new Map<number, PhotoItem>();
      for (const s of toCast) {
        const li = s.library_photo_index as number;
        if (resolved.has(li)) continue;
        const row = rows[li - 1];
        if (!row) continue;
        try {
          const { base64, mimeType, name } = await userPhotoToBase64(row);
          resolved.set(li, {
            id: row.id,
            userPhotoId: row.id,
            base64,
            preview: base64,
            name,
            mimeType,
            context: "",
          });
        } catch (e) {
          console.warn("[casting] photo bibliothèque illisible, slide laissée à caster", e);
        }
      }
      if (resolved.size === 0) return;
      const prev = uploadedPhotosLiveRef.current || [];
      const next = [...prev];
      const indexByLibrary = new Map<number, number>();
      for (const [li, item] of resolved) {
        const existing = next.findIndex((p: any) => p.userPhotoId && p.userPhotoId === item.userPhotoId);
        if (existing >= 0) indexByLibrary.set(li, existing + 1);
        else {
          next.push(item);
          indexByLibrary.set(li, next.length);
        }
      }
      setUploadedPhotos(next);
      savePhotos(next);
      setResult((prevR: any) => {
        if (!prevR?.raw?.slides) return prevR;
        const nextSlides = prevR.raw.slides.map((s: any) => {
          const li = s?.library_photo_index;
          if (Number.isInteger(li) && indexByLibrary.has(li) && !Number.isInteger(s?.photo_index)) {
            return { ...s, photo_index: indexByLibrary.get(li), cast_source: "library_auto" };
          }
          return s;
        });
        // Photos posées automatiquement : le reçu de relecture reste valable.
        return { ...prevR, raw: rebindReceiptsAfterPhotoCast(prevR.raw, { ...prevR.raw, slides: nextSlides }) };
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
}
