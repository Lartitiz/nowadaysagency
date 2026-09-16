/**
 * PhotosPage — bibliothèque de photos de marque du workspace.
 *
 * Grille de photos décrites/taguées par l'IA à l'upload (edge photo-describe),
 * filtres par tag, panneau « Photos à prendre » (photo_wishlist), et état vide
 * en « séance photo » générée depuis le branding. La retouche IA historique
 * (remplacement de décor) reste accessible en action secondaire.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Plus, RefreshCw, Wand2, Search } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhotoPreparationsPanel } from "@/components/photos/PhotoPreparationsPanel";
import type { PhotoWorkflowRow } from "@/lib/photo-workflows";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useUserPhotos,
  useRetryPhotoRetouch,
  useUploadLibraryPhotos,
  type UserPhotoRow,
} from "@/hooks/use-user-photos";
import { removePhotoFromLibrary } from "@/lib/photo-storage";
import { PhotoCard } from "@/components/photos/PhotoCard";
import { PhotoUploadingCard } from "@/components/photos/PhotoUploadingCard";
import { PhotoRetouchDialog } from "@/components/photos/PhotoRetouchDialog";
import {
  CreateVisualDialog,
  type CreateVisualChoice,
} from "@/components/photos/CreateVisualDialog";
import { PhotoDetailDialog } from "@/components/photos/PhotoDetailDialog";
import { PackshotDialog } from "@/components/photos/PackshotDialog";
import { MiseEnSceneDialog } from "@/components/photos/MiseEnSceneDialog";
import { PortraitProDialog } from "@/components/photos/PortraitProDialog";
import { OfferMockupDialog } from "@/components/photos/OfferMockupDialog";
import { AvantApresDialog } from "@/components/photos/AvantApresDialog";
import { PhotoWishlistPanel } from "@/components/photos/PhotoWishlistPanel";
import { SitePhotoImportDialog } from "@/components/photos/SitePhotoImportDialog";
import { PhotoShootEmptyState } from "@/components/photos/PhotoShootEmptyState";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { isHeic, PHOTO_INPUT_ACCEPT } from "@/lib/heic";
import { UX_UPLOAD_LIMITS, formatMb } from "@/lib/upload-limits";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";

const PhotoPreparationDialog = lazy(() => import("@/components/photos/PhotoPreparationDialog"));
const MAX_BATCH = 20;
const MAX_FILE_BYTES = UX_UPLOAD_LIMITS.photo;
const MAX_TAG_CHIPS = 8;
// Rattrapage describe (photos ready sans description ET sans kind) : borné
// pour ne pas flamber les crédits IA (vision, 1 crédit/photo).
const DESCRIBE_CATCHUP_MAX = 5;

// Types de photo (classés par l'IA, cf. edge photo-describe) → libellés de filtre
const KIND_LABELS: Record<string, string> = {
  produit: "Produits",
  produit_porte: "Portés",
  portrait: "Portraits",
  ambiance: "Ambiance",
  coulisses: "Coulisses",
  autre: "Autres",
};

export default function PhotosPage() {
  const { activeWorkspace } = useWorkspace();
  return <PhotosLibrary key={activeWorkspace?.id || "loading"} />;
}

function PhotosLibrary() {
  const [photoLimit, setPhotoLimit] = useState(200);
  const {
    data: photoData,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useUserPhotos(photoLimit);
  const photos = useMemo(() => photoData ?? [], [photoData]);
  const hasPhotoData = photoData !== undefined;
  const { retry, isRetrying } = useRetryPhotoRetouch();
  const { mutate: uploadLibrary, progress, pendingUploads } = useUploadLibraryPhotos();
  const { activeWorkspace, loading: wsLoading } = useWorkspace();
  const wsReady = !!activeWorkspace && !wsLoading;

  const [createVisualOpen, setCreateVisualOpen] = useState(false);
  const [siteImportOpen, setSiteImportOpen] = useState(false);
  // Id seul (pas l'objet) : le détail doit refléter le classement IA qui finit
  // en arrière-plan après l'upload, sinon `photo.kind` reste figé sur l'instantané
  // pris au clic d'ouverture — même si Realtime a bien rafraîchi `photos` derrière,
  // Portrait pro n'apparaît jamais sans fermer/rouvrir OU recharger la page.
  const [view, setView] = useState<"photos" | "preparations" | "wishlist">("photos");
  const [search, setSearch] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedPhotos = photos.filter(p => selectedIds.includes(p.id) && p.status === "ready");
  const [resumeWorkflow, setResumeWorkflow] = useState<PhotoWorkflowRow | null>(null);
  function togglePhoto(photo: UserPhotoRow) {
    setSelectedIds(ids => ids.includes(photo.id) ? ids.filter(id => id !== photo.id) : ids.length < 12 ? [...ids, photo.id] : ids);
  }
  const [preparation, setPreparation] = useState<{ photos: UserPhotoRow[]; mode: "single" | "collection" | "kit" } | null>(null);
  const [detailPhotoId, setDetailPhotoId] = useState<string | null>(null);
  const detailPhoto = detailPhotoId ? (photos.find((p) => p.id === detailPhotoId) ?? null) : null;
  const [packshotPhoto, setPackshotPhoto] = useState<UserPhotoRow | null>(null);
  const [miseEnScenePhoto, setMiseEnScenePhoto] = useState<UserPhotoRow | null>(null);
  const [portraitProPhoto, setPortraitProPhoto] = useState<UserPhotoRow | null>(null);
  const [mockupOpen, setMockupOpen] = useState(false);
  const [avantApresOpen, setAvantApresOpen] = useState(false);
  const [retouchePhoto, setRetouchePhoto] = useState<UserPhotoRow | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<UserPhotoRow | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Rattrapage des photos décrites avant l'arrivée du champ kind : la
  // bibliothèque se répare elle-même à l'ouverture (1 appel texte par lot de
  // 40, silencieux, une fois par montage).
  const classifyTriggered = useRef(false);
  useEffect(() => {
    if (classifyTriggered.current || !wsReady) return;
    const needsClassify = photos.some((p) => !p.kind && p.description && p.status === "ready");
    if (!needsClassify) return;
    classifyTriggered.current = true;
    invokeWithTimeout(
      "photo-describe",
      { body: { mode: "classify_missing", workspace_id: activeWorkspace!.id } },
      60_000,
    ).then(({ data }) => {
      if (data?.classified > 0) {
        queryClient.invalidateQueries({ queryKey: ["user-photos"] });
      }
    });
  }, [photos, wsReady, activeWorkspace, queryClient]);

  // Rattrapage complémentaire : photos ready sans description ET sans kind —
  // le describe auto à l'upload (avec son réessai) a échoué malgré tout. On
  // relance l'edge en vision une par une, plafonné à DESCRIBE_CATCHUP_MAX pour
  // ne pas flamber les crédits IA, une fois par montage (même garde-fou que
  // classify_missing ci-dessus).
  const describeCatchupTriggered = useRef(false);
  useEffect(() => {
    if (describeCatchupTriggered.current || !wsReady || !activeWorkspace) return;
    const toDescribe = photos.filter((p) => p.status === "ready" && !p.kind && !p.description);
    if (toDescribe.length === 0) return;
    describeCatchupTriggered.current = true;
    const workspaceId = activeWorkspace.id;
    (async () => {
      let anySuccess = false;
      for (const p of toDescribe.slice(0, DESCRIBE_CATCHUP_MAX)) {
        const { error } = await invokeWithTimeout(
          "photo-describe",
          { body: { mode: "describe", photo_id: p.id, workspace_id: workspaceId } },
          60_000,
        );
        if (!error) anySuccess = true;
      }
      if (anySuccess) {
        queryClient.invalidateQueries({ queryKey: ["user-photos"] });
      }
    })();
  }, [photos, wsReady, activeWorkspace, queryClient]);

  // Tags les plus fréquents de la bibliothèque → chips de filtre
  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of photos) {
      for (const t of p.tags ?? []) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TAG_CHIPS)
      .map(([tag]) => tag);
  }, [photos]);

  // Types présents dans la bibliothèque (dans l'ordre de KIND_LABELS)
  const presentKinds = useMemo(() => {
    const kinds = new Set(photos.map((p) => p.kind).filter(Boolean) as string[]);
    return Object.keys(KIND_LABELS).filter((k) => kinds.has(k));
  }, [photos]);

  const filteredPhotos = useMemo(
    () =>
      photos
        .filter((p) => (kindFilter ? p.kind === kindFilter : true))
        .filter((p) => (tagFilter ? (p.tags ?? []).includes(tagFilter) : true))
        .filter(p => `${p.name || ""} ${p.description || ""} ${(p.tags || []).join(" ")}`.toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr"))),
    [photos, tagFilter, kindFilter, search],
  );

  // Cartes optimistes encore utiles : dès que la vraie ligne est dans la
  // grille, la carte « envoi en cours » du même fichier s'efface.
  const visiblePendingUploads = useMemo(
    () => pendingUploads.filter((u) => !u.photoId || !photos.some((p) => p.id === u.photoId)),
    [pendingUploads, photos],
  );

  async function handleFilesSelected(list: FileList | File[] | null) {
    if (!list?.length) return;
    const files: File[] = [];
    const rejected: string[] = [];
    for (const f of Array.from(list).slice(0, MAX_BATCH)) {
      // HEIC accepté : converti en JPEG dans le hook (photos d'iPhone).
      // NB : le type MIME d'un .heic est parfois vide → on regarde aussi le nom.
      if (!f.type.startsWith("image/") && !isHeic(f)) {
        rejected.push(`${f.name} (pas une image)`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        rejected.push(`${f.name} (plus de ${formatMb(MAX_FILE_BYTES)})`);
        continue;
      }
      files.push(f);
    }
    if (rejected.length > 0) {
      toast.error(
        rejected.length === 1
          ? `1 fichier ignoré : ${rejected[0]}`
          : `${rejected.length} fichiers ignorés : ${rejected.slice(0, 3).join(", ")}${rejected.length > 3 ? "…" : ""}`,
      );
    }
    if (list.length > MAX_BATCH) {
      toast.info(`Maximum ${MAX_BATCH} photos à la fois — les premières ont été prises.`);
    }
    if (!files.length) return;
    setView("photos");

    try {
      const { uploaded, failed } = await uploadLibrary(files);
      if (uploaded > 0) {
        toast.success(
          uploaded === 1
            ? "Photo ajoutée : description IA en cours"
            : `${uploaded} photos ajoutées — descriptions IA en cours`,
        );
      }
      if (failed > 0) {
        toast.error(`${failed} photo${failed > 1 ? "s" : ""} n'a pas pu être envoyée.`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Échec de l'ajout");
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleRetry(photo: UserPhotoRow) {
    try {
      await retry(photo);
      toast.success("Nouvelle tentative lancée");
    } catch (e: any) {
      toast.error(e?.message || "Échec de la nouvelle tentative");
    }
  }

  async function confirmDelete() {
    if (!photoToDelete) return;
    try {
      await removePhotoFromLibrary(photoToDelete);
      toast.success("Photo retirée de la bibliothèque");
    } catch (e: any) {
      toast.error(e?.message || "Suppression impossible");
    } finally {
      setPhotoToDelete(null);
    }
  }

  const uploading = !!progress;


  return (
    <div className="min-h-screen bg-background [--primary:330_50%_20%] dark:[--primary:338_72%_83%]">
      <AppHeader />
      <main id="main-content" className="container max-w-7xl mx-auto px-4 py-8 sm:py-10">
        {/* Titre pleine largeur puis rangée d'actions : les 4 boutons côte à
            côte écrasaient la colonne du titre (h1 cassé sur 2 lignes). */}
        <header className="mb-8 space-y-4">
          <div>
            <h1 className="font-display text-4xl text-foreground mb-2">Ma bibliothèque</h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Retrouve tes photos, prépare leurs versions et utilise-les dans tes contenus.
            </p>
          </div>
          {/* Deux boutons seulement (audit UX 14/08) : « remplir » et
              « fabriquer ». Les outils de retouche vivent dans la fiche photo,
              là où ils s'appliquent à une photo précise. */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={openFilePicker} disabled={!wsReady || uploading}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {progress ? `${progress.done}/${progress.total}` : "Envoi…"}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" /> Ajouter des photos
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => setCreateVisualOpen(true)} disabled={!wsReady}>
              <Wand2 className="h-4 w-4 mr-2" /> Composer un visuel
            </Button>

          </div>
          {/* L'import site/Instagram est une 2e façon de REMPLIR : lien discret
              plutôt qu'un bouton frère qui doublerait le poids de « Ajouter ». */}
          <p className="text-sm text-muted-foreground">
            Tu n'as rien sous la main ?{" "}
            <button
              type="button"
              onClick={() => setSiteImportOpen(true)}
              disabled={!wsReady || uploading}
              className="text-primary underline underline-offset-2 hover:no-underline disabled:opacity-60"
            >
              Récupère celles de ton site ou d'Instagram
            </button>
          </p>
        </header>

        <input
          ref={fileInputRef}
          type="file"
          accept={PHOTO_INPUT_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="mb-7 grid grid-cols-3 gap-1 border-b sm:flex" role="group" aria-label="Vues de la bibliothèque">
          {([["photos", "Mes photos"], ["preparations", "Mes préparations"], ["wishlist", "Photos à prendre"]] as const).map(([key, label]) =>
            <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={cn("min-w-0 border-b-2 px-1 py-3 text-xs sm:px-3 sm:text-sm", view === key ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{label}</button>)}
        </div>
        {view === "preparations" && wsReady && <PhotoPreparationsPanel workspaceId={activeWorkspace!.id} onResume={setResumeWorkflow} />}
        {view === "wishlist" && wsReady && <div className="max-w-3xl"><PhotoWishlistPanel /></div>}
        {view === "photos" && <>
        {isError && hasPhotoData && (
          <div
            role="alert"
            className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            <p className="min-w-0 flex-1 text-sm text-foreground">
              Impossible d'actualiser la bibliothèque. Les photos déjà chargées restent affichées.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} />
              Réessayer
            </Button>
          </div>
        )}

        {!wsReady || (isLoading && !hasPhotoData) ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError && !hasPhotoData ? (
          <div
            role="alert"
            className="mx-auto max-w-xl rounded-2xl border border-destructive/25 bg-card p-8 text-center"
          >
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
            <h2 className="font-display text-xl text-foreground">
              Impossible de charger ta bibliothèque
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Tes photos n'ont pas disparu. Vérifie ta connexion, puis réessaie.
            </p>
            <Button
              type="button"
              className="mt-5"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} />
              Réessayer
            </Button>
          </div>
        ) : photos.length === 0 && visiblePendingUploads.length === 0 ? (
          <PhotoShootEmptyState
            onAddPhotos={openFilePicker}
            uploadDisabled={!wsReady || uploading}
            onImport={() => setSiteImportOpen(true)}
          />
        ) : (
          <div className="space-y-6">
            <div className="min-w-0 w-full">
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <div className="relative min-w-0 flex-1 basis-60"><Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Rechercher une photo" value={search} onChange={e => setSearch(e.target.value)} placeholder="Un nom, un sujet, un mot-clé…" className="pl-9" /></div>
                <select aria-label="Filtrer les photos par type" className="min-h-10 max-w-full rounded-md border bg-background px-3 text-sm" value={kindFilter || ""} onChange={e => setKindFilter(e.target.value || null)}><option value="">Tous les types</option>{presentKinds.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}</select>
                <Button variant="outline" aria-pressed={selecting} onClick={() => { setSelecting(v => !v); setSelectedIds([]); }}>{selecting ? "Annuler la sélection" : "Sélectionner"}</Button>
              </div>
              {topTags.length > 0 && <details className="mb-4"><summary className="cursor-pointer text-sm text-muted-foreground">Filtrer par mot-clé{tagFilter ? ` · ${tagFilter}` : ""}</summary><div className="mt-3 flex flex-wrap gap-2">{topTags.map(tag => <button key={tag} type="button" aria-pressed={tagFilter === tag} onClick={() => setTagFilter(tagFilter === tag ? null : tag)} className={cn("rounded-full border px-3 py-1 text-xs", tagFilter === tag ? "bg-primary text-primary-foreground" : "bg-card")}>{tag}</button>)}</div></details>}
              <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span>{filteredPhotos.length} photo{filteredPhotos.length !== 1 ? "s" : ""}</span>{(search || kindFilter || tagFilter) && <button type="button" className="text-primary underline underline-offset-4" onClick={() => { setSearch(""); setKindFilter(null); setTagFilter(null); }}>Effacer les filtres</button>}{selecting && <span>Choisis jusqu’à 12 photos à harmoniser.</span>}</div>
              {selecting && selectedPhotos.length > 0 && <div className="sticky top-3 z-20 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-background p-4 shadow-sm">
                <span className="text-sm">{selectedPhotos.length} photo{selectedPhotos.length > 1 ? "s" : ""} sélectionnée{selectedPhotos.length > 1 ? "s" : ""}{selectedPhotos.some(p => !filteredPhotos.includes(p)) ? " · dont certaines masquées par les filtres" : ""}</span>
                <Button onClick={() => { setPreparation({ photos: selectedPhotos, mode: selectedPhotos.length > 1 ? "collection" : "single" }); }}>{selectedPhotos.length > 1 ? "Harmoniser ces photos" : "Préparer cette photo"}</Button>
              </div>}
              {filteredPhotos.length === 0 && visiblePendingUploads.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Aucune photo ne correspond à ta recherche.
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6">
                  {visiblePendingUploads.map((u) => (
                    <PhotoUploadingCard key={u.localId} upload={u} />
                  ))}
                  {filteredPhotos.map((p) => (
                    <article key={p.id} className="min-w-0 space-y-2">
                    <PhotoCard
                      photo={p}
                      onOpen={(photo) => selecting ? togglePhoto(photo) : setDetailPhotoId(photo.id)}
                      onDelete={setPhotoToDelete}
                      onRetry={handleRetry}
                      retrying={isRetrying === p.id}
                    />
                    {selecting && p.status === "ready" ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-primary" checked={selectedIds.includes(p.id)} disabled={!selectedIds.includes(p.id) && selectedPhotos.length >= 12} onChange={() => togglePhoto(p)} /><span className="line-clamp-2">{p.name || "Photo"}</span></label> : <p className="line-clamp-2 text-sm font-medium">{p.name || "Photo"}</p>}
                    <p className="text-xs text-muted-foreground">{p.status === "ready" ? p.original_storage_path && p.original_storage_path !== p.storage_path ? "Version retouchée · originale conservée" : "Photo enregistrée" : p.status === "failed" ? "À reprendre" : "En cours"}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {photos.length >= photoLimit && <Button variant="outline" disabled={isFetching} onClick={() => setPhotoLimit(n => n + 200)}>Afficher les photos plus anciennes</Button>}
          </div>
        )}
        </>}
      </main>

      <CreateVisualDialog
        open={createVisualOpen}
        onOpenChange={setCreateVisualOpen}
        onChoose={(choice: CreateVisualChoice) => {
          setCreateVisualOpen(false);
          if (choice === "avant-apres") setAvantApresOpen(true);
          else setMockupOpen(true);
        }}
      />
      <SitePhotoImportDialog
        open={siteImportOpen}
        onOpenChange={setSiteImportOpen}
        maxSelectable={MAX_BATCH}
        onImportFiles={handleFilesSelected}
      />
      {resumeWorkflow && <Suspense fallback={<p role="status">Ouverture de la préparation…</p>}><PhotoPreparationDialog open sources={[]} resumeWorkflow={resumeWorkflow} onOpenChange={open => { if (!open) setResumeWorkflow(null); }} /></Suspense>}
      {preparation && <Suspense fallback={<p role="status">Ouverture de la préparation…</p>}><PhotoPreparationDialog open
        sources={preparation.photos.map(p => ({ id: p.id, photoId: p.id, name: p.name || "Photo" }))} mode={preparation.mode}
        onOpenChange={open => { if (!open) setPreparation(null); }} /></Suspense>}
      <PhotoDetailDialog
        onPrepare={p => { setDetailPhotoId(null); setPreparation({ photos: [p], mode: "single" }); }}
        onPrepareKit={p => { setDetailPhotoId(null); setPreparation({ photos: [p], mode: "kit" }); }}
        photo={detailPhoto}
        open={!!detailPhoto}
        onOpenChange={(v) => !v && setDetailPhotoId(null)}
        onPackshot={(p) => {
          setDetailPhotoId(null);
          setPackshotPhoto(p);
        }}
        onRetouche={(p) => {
          setDetailPhotoId(null);
          setRetouchePhoto(p);
        }}
        onMiseEnScene={(p) => {
          setDetailPhotoId(null);
          setMiseEnScenePhoto(p);
        }}
        onPortraitPro={(p) => {
          setDetailPhotoId(null);
          setPortraitProPhoto(p);
        }}
        onDelete={setPhotoToDelete}
      />
      <PackshotDialog
        photo={packshotPhoto}
        open={!!packshotPhoto}
        onOpenChange={(v) => !v && setPackshotPhoto(null)}
      />
      <MiseEnSceneDialog
        photo={miseEnScenePhoto}
        open={!!miseEnScenePhoto}
        onOpenChange={(v) => !v && setMiseEnScenePhoto(null)}
      />
      <PortraitProDialog
        photo={portraitProPhoto}
        open={!!portraitProPhoto}
        onOpenChange={(v) => !v && setPortraitProPhoto(null)}
      />
      <OfferMockupDialog
        open={mockupOpen}
        onOpenChange={setMockupOpen}
        onOpenRetouch={(p) => setRetouchePhoto(p)}
      />
      <AvantApresDialog open={avantApresOpen} onOpenChange={setAvantApresOpen} />
      <PhotoRetouchDialog
        photo={retouchePhoto}
        open={!!retouchePhoto}
        onOpenChange={(v) => !v && setRetouchePhoto(null)}
      />

      <AlertDialog open={!!photoToDelete} onOpenChange={(v) => !v && setPhotoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer cette photo ?</AlertDialogTitle>
            <AlertDialogDescription>
              Elle ne sera plus proposée dans ta bibliothèque. Les contenus et brouillons qui
              l'utilisent déjà garderont leur visuel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Retirer de la bibliothèque
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
