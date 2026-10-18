
import { useCallback, useMemo, useRef, useState } from "react";
import { readableError } from "@/lib/error-messages";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { StudioCompositionEditor } from "@/features/visual-studio/StudioCompositionEditor";
import { uploadPhotoOriginal } from "@/lib/photo-storage";
import { StudioMemoryPanel } from "@/features/visual-studio/StudioMemoryPanel";
import { cleanStudioSummary } from "@/features/visual-studio/summary";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { PhotoLibraryPickerDialog } from "@/components/photos/PhotoLibraryPickerDialog";
import type { VideoSource } from "@/features/studio-video/StudioVideoPanel";
import { VideoStudioSessions } from "@/features/studio-video/VideoStudioSessions";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDemoContext } from "@/contexts/DemoContext";
import {
  listOlderStudioCompositions,
  type StudioComposition,
  type StudioCompositionEntry,
  type StudioMessage,
  studioRequest,
} from "@/features/visual-studio/api";
import { useIsMobile } from "@/hooks/use-mobile";
import "@/features/visual-studio/studio.css";
import { useChatWidth } from "@/features/visual-studio/useChatWidth";
import { proposalGenerateLabelFor, readyFollowUpFor } from "@/features/visual-studio/proposal-labels";
import { StudioSessionsDialog } from "@/features/visual-studio/StudioSessionsDialog";
import { StudioProposalCard } from "@/features/visual-studio/StudioProposalCard";
import { StudioToolsSheet } from "@/features/visual-studio/StudioToolsSheet";
import { StudioImageStream } from "@/features/visual-studio/StudioImageStream";
import { StudioMessageList } from "@/features/visual-studio/StudioMessageList";
import { StudioComposer } from "@/features/visual-studio/StudioComposer";
import { useStudioSession } from "@/features/visual-studio/useStudioSession";
import { StudioToolDialogs } from "@/features/visual-studio/StudioToolDialogs";
import { useStudioLibrarySync } from "@/features/visual-studio/useStudioLibrarySync";
import { useReopenLastSession } from "@/features/visual-studio/useReopenLastSession";
import { useStudioFit } from "@/features/visual-studio/useStudioFit";
import { createLinkRenewer, downloadImage } from "@/features/visual-studio/studio-image-actions";
import type { StudioVersion } from "@/features/visual-studio/api";

export default function VisualStudioPage() {
  const { user } = useAuth(),
    { activeWorkspace, loading, switchingWorkspaceId, activeRole } =
      useWorkspace();
  const { isDemoMode } = useDemoContext();
  const [params] = useSearchParams();
  if (loading || switchingWorkspaceId) {
    return (
      <>
        <AppHeader />
        <p className="p-8">Chargement de ton espace…</p>
      </>
    );
  }
  if (!user || !activeWorkspace || !activeRole) {
    return (
      <>
        <AppHeader />
        <p className="p-8">Sélectionne un espace pour ouvrir le Studio.</p>
      </>
    );
  }
  if (isDemoMode) {
    return (
      <>
        <AppHeader />
        <p className="p-8">
          Le Studio photo est disponible dans ton espace connecté. Aucune
          génération n’est lancée en démonstration.
        </p>
      </>
    );
  }
  return (
    <Studio
      key={`${user.id}:${activeWorkspace.id}:${
        params.get("session") || params.get("photo") || "new"
      }`}
      userId={user.id}
      workspaceId={activeWorkspace.id}
      workspaceName={activeWorkspace.name}
      role={activeRole}
      sessionId={params.get("session")}
      photoId={params.get("photo")}
    />
  );
}
function Studio({
  userId,
  workspaceId,
  workspaceName,
  role,
  sessionId,
  photoId,
}: {
  userId: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  sessionId: string | null;
  photoId: string | null;
}) {
  const location = useLocation();
  const navigate = useNavigate(),
    cache = useQueryClient();
  const [urlParams, setUrlParams] = useSearchParams();
  const videoTab = urlParams.get("tab") === "video";
  const carouselReturnId = urlParams.get("carousel_return");
  const reelPassage = urlParams.get("reel_passage");
  const reelReturn = reelPassage !== null && /^\d+$/.test(reelPassage)
    ? Number(reelPassage)
    : null;
  const studioPath = useCallback((id?: string) => {
    const next = new URLSearchParams();
    if (id) next.set("session", id);
    else next.set("new", "1"); // Sans session : discussion vide, pas la dernière session.
    if (carouselReturnId && (!id || id === sessionId)) next.set("carousel_return", carouselReturnId);
    if (reelReturn !== null) next.set("reel_passage", String(reelReturn));
    const query = next.toString();
    return `/photos/studio${query ? `?${query}` : ""}`;
  }, [reelReturn, carouselReturnId, sessionId]);
  const contentPath = `/creer?${new URLSearchParams({ from: studioPath(sessionId || undefined) })}`;
  const returnToReel = (jobId?: string) => {
    if (reelReturn === null) return;
    const next = new URLSearchParams({ studio_passage: String(reelReturn) });
    if (jobId) next.set("studio_clip", jobId);
    navigate(`/creer?${next}`);
  };
  const chooseTab = (tab: "photo" | "video") => {
    const next = new URLSearchParams(urlParams);
    if (tab === "video") next.set("tab", "video");
    else next.delete("tab");
    setUrlParams(next);
  };
  const isMobile = useIsMobile();
  const { gridRef, chatWidth, wide, startChatResize, resetChatWidth, onResizerKey } = useChatWidth();
  const openCastingRef = useRef<(() => void) | null>(null);
  const reopening = useReopenLastSession({ params: urlParams, userId, workspaceId, navigate, studioPath });
  useStudioFit(gridRef);

  const {
    roleWritable, compositionOpen, setCompositionOpen, compositionDraft, setCompositionDraft,
    selectedComposition, setSelectedComposition, olderCompositions, setOlderCompositions,
    moreCompositions, setMoreCompositions, olderCompositionsBusy, setOlderCompositionsBusy,
    existingTool, setExistingTool, preparation, setPreparation, picker, setPicker, sessionsOpen,
    setSessionsOpen, sessionAction, setSelectedReferenceId, selectedId, setSelectedId, compare,
    setCompare, busy, setBusy, error, setError, branchChoice, draft, fileInput, dropActive,
    setDropActive, dragDepth, desktopMessages, galleryLimit, setGalleryLimit, alive,
    carouselReturn, state, sessions, current, version, proposal, compositionHistory, writable,
    activeBranchChoice, references, activeIds, attachedReferences, hasExtraTools, photosOpen,
    setPhotosOpen, toolsOpen, setToolsOpen, selectedReference, premiumBlocked, insufficientSeries,
    generating, editDraft, setAutoSend, openPhoto, mutate, syncAttachments, sceneAttachments,
    updateSelection, addReferencePhotos, addLocalFiles, send, setSessionArchived,
  } = useStudioSession({ role, userId, workspaceId, sessionId, photoId, carouselReturnId, navigate, cache, studioPath });
  const { saveVersion } = useStudioLibrarySync({
    current, sessionId, workspaceId, writable, cache,
    queryKey: ["visual-studio", userId, workspaceId, sessionId],
  });
  const [imageAction, setImageAction] = useState<string | null>(null);
  const refetchState = state.refetch;
  const renewImageLink = useMemo(() => createLinkRenewer(
    () => refetchState(),
    () => setError("L’aperçu ne se charge pas. Réessaie pour le recharger, sans régénérer."),
  ), [refetchState, setError]);
  async function downloadVersion(item: StudioVersion, number: number) {
    if (imageAction) return;
    setImageAction(`download:${item.id}`);
    const fileName = `studio-image-${number}.jpg`;
    try {
      try {
        await downloadImage(item.url!, fileName);
      } catch {
        // Lien expiré : la relecture de la session signe une nouvelle adresse.
        const fresh = (await state.refetch()).data?.versions.find((v) => v.id === item.id)?.url;
        if (!fresh) throw new Error("expired");
        await downloadImage(fresh, fileName);
      }
    } catch {
      if (alive.current) setError("Le téléchargement n’a pas abouti. Réessaie dans un instant.");
    } finally {
      if (alive.current) setImageAction(null);
    }
  }
  async function createContentWith(item: StudioVersion) {
    if (imageAction) return;
    setImageAction(`content:${item.id}`);
    try {
      const photoId = await saveVersion(item);
      if (alive.current) navigate(contentPath, { state: { libraryPhotoIds: [photoId] } });
    } catch (cause) {
      if (alive.current) setError(readableError(cause, "L’image reste dans le Studio. Réessaie dans un instant."));
    } finally {
      if (alive.current) setImageAction(null);
    }
  }
  const source = selectedReference?.url ||
      (current?.session.references === undefined
        ? current?.session.source_url
        : undefined) ||
      undefined,
    display = version?.url || source;
  const comparisonSource = source ||
    current?.versions.find((v) => v.id === version?.proposal.viewed_version_id)
      ?.url ||
    (current?.versions
      .filter((v) => v.status === "ready")
      .find((v) => v.id !== version?.id)?.url ??
      undefined);
  const { identitySheet, productName, readyFollowUp } = readyFollowUpFor(version, references);
  const label = version
    ? `Version ${
      current!.versions.filter((v) => v.status === "ready").findIndex((v) =>
        v.id === version.id
      ) + 1
    }`
    : selectedReference?.name ||
      (source ? "Original" : "Ton espace de création");
  async function openPreparation(message?: StudioMessage) {
    const targetVersion = message?.viewed_version_id
      ? current?.versions.find(v => v.id === message.viewed_version_id)
      : message ? null : version;
    const targetReference = message?.viewed_reference_id
      ? references.find(r => r.id === message.viewed_reference_id)
      : message ? null : selectedReference;
    const imageUrl = targetVersion?.url || targetReference?.url ||
      (!message ? source : undefined);
    if (!imageUrl) {
      setPicker(true);
      return;
    }
    setBusy("preparation");
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error("La photo n’est plus accessible. Recharge la session.");
      const blob = await response.blob();
      if (!/^image\/(jpeg|png|webp)$/.test(blob.type) || blob.size > 15_000_000) {
        throw new Error("Cette photo ne peut pas être préparée ici.");
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Lecture de la photo impossible."));
        reader.readAsDataURL(blob);
      });
      if (alive.current) setPreparation({
        source: { id: crypto.randomUUID(), name: targetReference?.name || "Image du Studio", dataUrl },
        recipe: message?.preparation,
        role: targetReference?.role || "subject",
      });
    } catch (cause) {
      if (alive.current) setError(readableError(cause, "La préparation n’a pas abouti. Réessaie dans un instant."));
    } finally {
      if (alive.current) setBusy("");
    }
  }
  const videoSource: VideoSource | null = version?.status === "ready"
    ? { kind: "studio_version", id: version.id, name: label, previewUrl: version.url }
    : selectedReference?.photo_id
    ? {
      kind: "photo",
      id: selectedReference.photo_id,
      name: selectedReference.name,
      previewUrl: selectedReference.url,
    }
    : current?.session.source_photo_id
    ? {
      kind: "photo",
      id: current.session.source_photo_id,
      name: "Photo de la session",
    }
    : null;
  // Bouton principal de la proposition : affiché à la place d'« Envoyer » dans le composer.
  const proposalGenerateDisabled = !proposal || !writable ||
    !!busy ||
    generating ||
    !current?.quota.allowed ||
    !!draft.trim() || !!error || premiumBlocked || insufficientSeries || (proposal.scene_workflow?.phase === "integration" && !!proposal.viewed_version_id && proposal.viewed_version_id !== selectedId);
  const proposalGenerateLabel = proposalGenerateLabelFor(proposal);
  async function runProposalGenerate() {
    if (!proposal) return;
    const result = await mutate("generate", {
      proposal_id: proposal.id,
      viewed_version_id: selectedId,
      ...(proposal.scene_workflow?.phase === "integration" ? { approved_scene_id: proposal.viewed_version_id || proposal.viewed_reference_id } : {}),
    });
    if (result && alive.current && isMobile) {
      document.querySelector(".studio-stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  async function resumeComposition(entry: StudioCompositionEntry) {
    setBusy("composition_read");
    setError("");
    try {
      const result = await studioRequest<{ composition: {
        id: string;
        design: StudioComposition;
        background_url: string | null;
      } }>({
        action: "composition_read",
        workspace_id: workspaceId,
        session_id: sessionId,
        composition_history_id: entry.id,
      });
      if (alive.current) {
        setSelectedComposition(result.composition);
        setCompositionDraft(undefined);
        setCompositionOpen(true);
      }
    } catch (e) {
      if (alive.current) setError(readableError(e, "La composition ne s’ouvre pas. Réessaie dans un instant."));
    } finally {
      if (alive.current) setBusy("");
    }
  }
  async function loadOlderCompositions() {
    if (!sessionId) return;
    setOlderCompositionsBusy(true);
    setError("");
    try {
      const page = await listOlderStudioCompositions(
        workspaceId, sessionId, 20 + olderCompositions.length,
      );
      if (alive.current) {
        setOlderCompositions((existing) => [...existing, ...page.items]);
        setMoreCompositions(page.hasMore);
      }
    } catch (e) {
      if (alive.current) setError(readableError(e, "L’historique ne se charge pas. Réessaie dans un instant."));
    } finally {
      if (alive.current) setOlderCompositionsBusy(false);
    }
  }
  function chat(mobile = false) {
    return (
      <div className="studio-chat-inner">
        <>
              <div
                ref={desktopMessages}
                className="studio-messages"
                aria-live="polite"
              >
                <StudioMessageList
                  current={current}
                  proposal={proposal}
                  references={references}
                  writable={writable}
                  busy={busy}
                  generating={generating}
                  mutate={mutate}
                  readyFollowUp={readyFollowUp}
                  identitySheet={identitySheet}
                  productName={productName}
                  editDraft={editDraft}
                  setAutoSend={setAutoSend}
                  openCastingRef={openCastingRef}
                  onEditComposition={(m) => {
                    setSelectedComposition(null);
                    setCompositionDraft(m.composition ? { ...m.composition, logo_data_url: current?.session.composition?.design.logo_data_url || null } : undefined);
                    setCompositionOpen(true);
                  }}
                  onOpenExistingTool={(m) => m.existing_tool === "preparation"
                    ? void openPreparation(m)
                    : setExistingTool(m.existing_tool || "mockup")}
                  proposalCard={proposal && <StudioProposalCard
                  proposal={proposal}
                  current={current}
                  references={references}
                  selectedId={selectedId}
                  premiumBlocked={premiumBlocked}
                  insufficientSeries={insufficientSeries}
                  onRetryAccess={() => void state.refetch()}
                  busy={busy}
                  generating={generating}
                  writable={writable}
                  draft={draft}
                  error={error}
                  setError={setError}
                  editDraft={editDraft}
                  mutate={mutate}
                />}
                >
                  {hasExtraTools && (
                  <StudioToolsSheet
                    open={toolsOpen}
                    onOpenChange={setToolsOpen}
                    current={current}
                    references={references}
                    compositionHistory={compositionHistory}
                    moreCompositions={moreCompositions}
                    olderCompositionsBusy={olderCompositionsBusy}
                    writable={writable}
                    busy={busy}
                    generating={generating}
                    mutate={mutate}
                    onResumeComposition={(entry) => void resumeComposition(entry)}
                    onLoadOlderCompositions={() => void loadOlderCompositions()}
                    onOpenTool={setExistingTool}
                  />
                  )}
                </StudioMessageList>
              </div>
              <StudioComposer
                mobile={mobile}
                dropActive={dropActive}
                setDropActive={setDropActive}
                dragDepth={dragDepth}
                writable={writable}
                busy={busy}
                generating={generating}
                addLocalFiles={addLocalFiles}
                hasExtraTools={hasExtraTools}
                setToolsOpen={setToolsOpen}
                current={current}
                setExistingTool={setExistingTool}
                updateSelection={updateSelection}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                setSelectedReferenceId={setSelectedReferenceId}
                setCompare={setCompare}
                version={version}
                openCastingRef={openCastingRef}
                activeBranchChoice={activeBranchChoice}
                send={send}
                branchChoice={branchChoice}
                attachedReferences={attachedReferences}
                photosOpen={photosOpen}
                setPhotosOpen={setPhotosOpen}
                mutate={mutate}
                draft={draft}
                editDraft={editDraft}
                proposal={proposal}
                error={error}
                proposalGenerateDisabled={proposalGenerateDisabled}
                runProposalGenerate={runProposalGenerate}
                proposalGenerateLabel={proposalGenerateLabel}
                fileInput={fileInput}
                references={references}
                setPicker={setPicker}
              />
        </>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main id="main-content" className="studio-page">
        <header className="studio-header">
          <div className="studio-header-left">
            <button
              type="button"
              className="studio-link"
              onClick={() => navigate(videoTab ? "/photos?tab=videos" : "/photos")}
            >
              <ArrowLeft className="inline h-3.5 w-3.5 mr-1" />
              Bibliothèque
            </button>
            <h1 className="font-display text-lg">Studio visuel</h1>
          </div>
          <nav aria-label="Sections du Studio" className="studio-tabs">
            <button
              type="button"
              data-active={!videoTab}
              aria-current={!videoTab ? "page" : undefined}
              onClick={() => chooseTab("photo")}
            >
              Photos
            </button>
            <button
              type="button"
              data-active={videoTab}
              aria-current={videoTab ? "page" : undefined}
              onClick={() => chooseTab("video")}
            >
              Clips vidéo
            </button>
          </nav>
          <div className="studio-header-right">
            {!videoTab && (
              <button type="button" className="studio-link" onClick={() => setSessionsOpen(true)}>
                Mes sessions
              </button>
            )}
          </div>
        </header>
        {!videoTab && current?.session.archived_at && (
          <div role="status" className="mx-5 mb-4 rounded-xl border border-border bg-card p-4 text-sm flex flex-wrap items-center justify-between gap-3">
            <span>Cette session est archivée. Les échanges, versions et images enregistrées sont conservés.</span>
            {roleWritable && (
              <Button type="button" variant="outline" disabled={!!sessionAction}
                onClick={() => void setSessionArchived(current.session.id, current.session.revision, false)}>
                Restaurer la session
              </Button>
            )}
          </div>
        )}
            {carouselReturnId && <div className="mx-5 mb-4 rounded border p-3 text-sm">
              {carouselReturn.ticket ? <><p>Image pour la slide {carouselReturn.ticket.slideNumber}. Ton carrousel est enregistré.</p>
                <Button variant="outline" size="sm" className="h-auto whitespace-normal" disabled={carouselReturn.busy || !!busy} onClick={() => void carouselReturn.returnToCarousel()}>Retour au carrousel sans remplacer l’image</Button></>
                : <p role="alert">Le lien de retour n’est pas disponible dans cet espace ou cette discussion. Reviens dans l’espace d’origine ou reprends le carrousel depuis Mes idées.</p>}
              {carouselReturn.error && <p role="alert" className="text-destructive mt-2">{carouselReturn.error}</p>}
            </div>}
        {videoTab && (
          <div className="space-y-4">
            {reelReturn !== null && (
              <Button
                type="button"
                variant="outline"
                onClick={() => returnToReel()}
              >
                Retour au Reel · passage {reelReturn + 1}
              </Button>
            )}
            <VideoStudioSessions
              workspaceId={workspaceId}
              userId={userId}
              writable={roleWritable}
              initialSource={videoSource}
              legacyDraftKey={`studio-video:${userId}:${workspaceId}:${sessionId || "new"}:${videoSource?.id || "idea"}`}
              onPickClip={reelReturn !== null
                ? (job) => returnToReel(job.id)
                : undefined}
            />
          </div>
        )}
        <div hidden={videoTab}>
          {(error || state.error) && (
            <div
              role="alert"
              className="mx-4 my-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
            >
              {error || state.error?.message}
              {(sessionId || photoId || draft.trim()) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setError("");
                    if (photoId && !sessionId) void openPhoto(photoId);
                    else if (!sessionId) void send();
                    else void state.refetch();
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {!sessionId && !photoId ? "Renvoyer ma demande" : "Réessayer"}
                </Button>
              )}
            </div>
          )}
          {!writable && (
            <p className="px-5 text-sm text-muted-foreground">
              Cet espace est en lecture seule. Tu peux consulter ses sessions.
            </p>
          )}
          {reopening || busy === "opening" || (sessionId && !current && state.isFetching)
            ? <p className="p-8">Ouverture de la session…</p>
            : (
              <div
                className="studio-grid"
                ref={gridRef}
                style={wide
                  ? { gridTemplateColumns: `${chatWidth}px minmax(0, 1fr)` }
                  : undefined}
              >
                <section className="studio-chat" aria-label="Conversation">
                  {chat(isMobile)}
                  {wide && (
                    <div
                      className="studio-resizer"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Ajuster la largeur de la conversation"
                      title="Glisser pour élargir la conversation · double-clic pour réinitialiser"
                      tabIndex={0}
                      onPointerDown={startChatResize}
                      onDoubleClick={resetChatWidth}
                      onKeyDown={onResizerKey}
                    />
                  )}
                </section>

                <section
                  className="studio-stage"
                  aria-label="Visuels et versions"
                >
                  <div className="studio-gallery-header">
                    <div>
                      <h2 className="font-display text-2xl">Images créées dans cette discussion</h2>
                      <p className="text-sm text-muted-foreground">Les nouvelles images suivent les précédentes.</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{current?.versions.length || 0} image{current?.versions.length === 1 ? "" : "s"}</span>
                  </div>
                  {current && <StudioMemoryPanel
                    key={`${workspaceId}:${sessionId}`}
                    memory={current.memory || []}
                    selectedVersion={version?.status === "ready" ? version.id : undefined}
                    personReference={version?.proposal.person_reference}
                    brief={cleanStudioSummary(version?.proposal.summary || current.session.brief || "")}
                    disabled={!writable || !!busy || !!generating}
                    onSave={(values) => mutate("memory_save", values)}
                    onApply={(id) => mutate("memory_apply", { memory_id: id, revision: current.session.revision })}
                    registerCastingOpener={(open) => { openCastingRef.current = open; }}
                  />}
                  {!current?.versions.length && <div className="studio-empty">
                    <div className="studio-empty-icon"><Sparkles className="h-9 w-9" /></div>
                    <h3 className="font-display text-2xl">Tout commence par ton idée</h3>
                    <p>Une photo, une affiche, une illustration ou un visuel encore à imaginer : décris-le dans la conversation. Le Studio reformulera ta demande avant de créer.</p>
                  </div>}
                  {!!current?.versions.length && <StudioImageStream
                    current={current}
                    galleryLimit={galleryLimit}
                    onShowOlder={() => setGalleryLimit((limit) => limit + 20)}
                    selectedId={selectedId}
                    compare={compare}
                    comparisonSource={comparisonSource}
                    onSelectVersion={(item) => {
                      setSelectedId(item.id);
                      setCompare(false);
                      if (item.proposal.scene_workflow?.phase === "scene" && writable && !generating) void syncAttachments(sceneAttachments(item), item.id);
                    }}
                    onImageExpired={renewImageLink}
                    onDownload={(item, number) => void downloadVersion(item, number)}
                    onCreateContent={(item) => void createContentWith(item)}
                    actionBusy={imageAction}
                    carouselReturn={carouselReturn}
                    writable={writable}
                    busy={busy}
                    generating={generating}
                  />}
                  {!!references.length && <details className="studio-source-details">
                    <summary>Images apportées dans la discussion · {references.length}</summary>
                    <div className="studio-versions" aria-label="Références de la discussion">
                      {references.map((ref) => <button type="button" key={ref.id} disabled={!writable || !!busy || generating} onClick={() => { setSelectedId(null); setSelectedReferenceId(ref.id); void updateSelection([...new Set([...activeIds, ref.id])], false, null); setCompare(false); }}>
                        <img src={ref.url} alt="" /><span>{ref.name}</span>
                      </button>)}
                    </div>
                  </details>}

                </section>
              </div>
            )}
        </div>
      </main>
      {current && (
        <StudioCompositionEditor
          key={`${sessionId}:${selectedComposition?.id || "current"}`}
          open={compositionOpen}
          onOpenChange={setCompositionOpen}
          initial={selectedComposition?.design || compositionDraft || current.session.composition?.design}
          backgroundUrl={selectedComposition
            ? selectedComposition.background_url
            : !compositionDraft && current.session.composition
            ? current.session.composition.background_url
            : version?.url || selectedReference?.url}
          disabled={!writable || !!busy}
          onSave={(design, useImage) =>
            mutate("composition_save", {
              composition: design,
              composition_use_image: useImage,
              composition_history_id: selectedComposition?.id || undefined,
              revision: current.session.revision,
              viewed_version_id:
                !compositionDraft && current.session.composition
                  ? undefined
                  : selectedId,
              viewed_reference_id:
                !compositionDraft && current.session.composition
                  ? undefined
                  : selectedReference?.id,
            })}
          onExport={async (blob) => {
            const receipt = await uploadPhotoOriginal({
              file: new File([blob], "studio-composition.png", {
                type: "image/png",
              }),
              userId,
              workspaceId,
              name: "Composition — " + current.session.name,
              purpose: "library",
            });
            if (alive.current) {
              navigate(contentPath, {
                state: { libraryPhotoIds: [receipt.photoId] },
              });
            }
          }}
        />
      )}
      <StudioToolDialogs
        existingTool={existingTool}
        setExistingTool={setExistingTool}
        preparation={preparation}
        setPreparation={setPreparation}
        mockupImage={version?.url || selectedReference?.url}
        beforeAfterImages={[
          references[0]?.url,
          version?.url || references[1]?.url,
        ]}
        onAttach={(photoId, role) => {
          void mutate("reference", {
            photo_id: photoId,
            reference_role: role,
            revision: current?.session.revision,
          });
        }}
      />
      <PhotoLibraryPickerDialog
        open={picker}
        onOpenChange={setPicker}
        maxSelectable={Math.max(1, 8 - references.length)}
        unavailablePhotoIds={references.map((ref) => ref.photo_id).filter((id): id is string => !!id)}
        onConfirm={(photos) => {
          setPicker(false);
          void addReferencePhotos(photos);
        }}
      />
      <StudioSessionsDialog
        open={sessionsOpen}
        onOpenChange={setSessionsOpen}
        workspaceName={workspaceName}
        sessions={sessions}
        roleWritable={roleWritable}
        sessionAction={sessionAction}
        onArchive={setSessionArchived}
        onOpenSession={(id) => navigate(studioPath(id))}
        onNewSession={() => navigate(studioPath())}
      />
    </div>
  );
}
