import { useCarouselStudioReturn } from "@/features/carousel-studio/useCarouselStudioReturn";
import { recordCreationResume } from "@/lib/retour-apres-detour";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { StudioCompositionEditor } from "@/features/visual-studio/StudioCompositionEditor";
import { uploadPhotoOriginal, type UserPhotoRow } from "@/lib/photo-storage";
import { StudioMemoryPanel } from "@/features/visual-studio/StudioMemoryPanel";
import { cleanStudioSummary } from "@/features/visual-studio/summary";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { PhotoLibraryPickerDialog } from "@/components/photos/PhotoLibraryPickerDialog";
import { useUploadLibraryPhotos } from "@/hooks/use-user-photos";
import type { VideoSource } from "@/features/studio-video/StudioVideoPanel";
import { VideoStudioSessions } from "@/features/studio-video/VideoStudioSessions";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDemoContext } from "@/contexts/DemoContext";
import {
  draftKey,
  listOlderStudioCompositions,
  listStudioSessions,
  readDraft,
  type StudioComposition,
  type StudioCompositionEntry,
  type StudioReference,
  type StudioMessage,
  type StudioState,
  studioRequest,
  StudioRequestError,
  writeDraft,
} from "@/features/visual-studio/api";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import "@/features/visual-studio/studio.css";
import { readAttachedIds, referenceRoleForPhoto, writeAttachedIds } from "@/features/visual-studio/attachments";
import { useChatWidth } from "@/features/visual-studio/useChatWidth";
import { proposalGenerateLabelFor, readyFollowUpFor } from "@/features/visual-studio/proposal-labels";
import { StudioSessionsDialog } from "@/features/visual-studio/StudioSessionsDialog";
import { StudioProposalCard } from "@/features/visual-studio/StudioProposalCard";
import { StudioToolsSheet } from "@/features/visual-studio/StudioToolsSheet";
import { StudioImageStream } from "@/features/visual-studio/StudioImageStream";
import { StudioMessageList } from "@/features/visual-studio/StudioMessageList";
import { StudioComposer } from "@/features/visual-studio/StudioComposer";
import { StudioToolDialogs, type StudioExistingTool, type StudioPreparation } from "@/features/visual-studio/StudioToolDialogs";

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

  const roleWritable = ["owner", "manager", "editor"].includes(role);
  const [compositionOpen, setCompositionOpen] = useState(false);
  const [compositionDraft, setCompositionDraft] = useState<
    StudioComposition | undefined
  >();
  const [selectedComposition, setSelectedComposition] = useState<{
    id: string;
    design: StudioComposition;
    background_url: string | null;
  } | null>(null);
  const [olderCompositions, setOlderCompositions] = useState<StudioCompositionEntry[]>([]);
  const [moreCompositions, setMoreCompositions] = useState(true);
  const [olderCompositionsBusy, setOlderCompositionsBusy] = useState(false);
  const [existingTool, setExistingTool] = useState<StudioExistingTool>(null);
  const [preparation, setPreparation] = useState<StudioPreparation>(null);
  const [picker, setPicker] = useState(false),
    [sessionsOpen, setSessionsOpen] = useState(false),
    [sessionAction, setSessionAction] = useState<string | null>(null);
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [compare, setCompare] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [branchChoice, setBranchChoice] = useState<{
    target: string;
    revision: number;
    versionNames?: string[];
    currentNames?: string[];
  } | null>(null);
  const localKey = draftKey(userId, workspaceId, sessionId || "new");
  const [draft, setDraft] = useState(() => readDraft(localKey));
  const attachmentKey = `${localKey}:images`;
  const [attachedIds, setAttachedIds] = useState<string[]>(() => readAttachedIds(attachmentKey));
  const localUpload = useUploadLibraryPhotos();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dropActive, setDropActive] = useState(false);
  const dragDepth = useRef(0);
  const draftRef = useRef(draft);
  const desktopMessages = useRef<HTMLDivElement>(null);
  const [galleryLimit, setGalleryLimit] = useState(20);
  const alive = useRef(true),
    actionLock = useRef(false),
    creation = useRef({ id: crypto.randomUUID(), photoId: "" }),
    sent = useRef<
      {
        id: string;
        text: string;
        revision: number;
        target?: string;
        attachments?: string;
      } | null
    >(null);
  const carouselReturn = useCarouselStudioReturn(carouselReturnId, userId, workspaceId, sessionId, () => alive.current);
  const sourceInit = useRef(false),
    seenReady = useRef<string[] | null>(null);
  const queryKey = ["visual-studio", userId, workspaceId, sessionId];
  const state = useQuery({
    queryKey,
    enabled: !!sessionId,
    queryFn: () =>
      studioRequest({
        action: "read",
        workspace_id: workspaceId,
        session_id: sessionId,
      }),
    refetchInterval: (q) =>
      q.state.data?.versions.some((v) => v.status === "processing")
        ? 5000
        : false,
    staleTime: 10000,
    retry: 1,
  });
  const sessions = useQuery({
    queryKey: ["visual-studio-sessions", userId, workspaceId],
    queryFn: () => listStudioSessions(workspaceId),
    enabled: sessionsOpen,
  });
  const current = state.data,
    version = current?.versions.find((v) => v.id === selectedId),
    proposal = current?.session.proposal;
  const compositionHistory = [
    ...(current?.composition_history || []),
    ...olderCompositions,
  ].filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index);
  const writable = roleWritable && !current?.session.archived_at;
  const activeBranchChoice = !!branchChoice &&
    branchChoice.target === selectedId &&
    branchChoice.revision === current?.session.revision;
  const references = current?.session.references || [];
  const activeIds = current?.session.active_reference_ids ?? attachedIds;
  const attachedReferences = activeIds.map((id) => references.find((ref) => ref.id === id)).filter((ref): ref is StudioReference => !!ref);
  useEffect(() => { setAttachedIds(readAttachedIds(attachmentKey)); }, [attachmentKey]);
  const hasExtraTools = !!(references.length || current?.suggested_photos?.length || current?.charter_references?.length || compositionHistory.length || current?.memory?.length);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const photoCountRef = useRef<number | null>(null);
  useEffect(() => {
    const n = attachedReferences.length;
    if (photoCountRef.current !== null && n > photoCountRef.current) setPhotosOpen(true);
    photoCountRef.current = n;
  }, [attachedReferences.length]);
  function setAttachments(ids: string[], key = attachmentKey) {
    const unique = [...new Set(ids)];
    writeAttachedIds(key, unique);
    if (key === attachmentKey) setAttachedIds(unique);
  }
  const selectedReference =
    references.find((r) => r.id === selectedReferenceId) || references[0];
  const premiumBlocked = !!proposal &&
    proposal.operation !== "background" &&
    current?.generative_allowed === false;
  const imageBalance = current?.quota.usage?.photo_retouch;
  const insufficientSeries = !!proposal && current?.quota.allowed && (
    (current.quota.available_total !== undefined && current.quota.available_total < proposal.cost) ||
    (!!imageBalance && imageBalance.limit > 0 && imageBalance.limit - imageBalance.used < proposal.cost));
  useEffect(() => { if (current?.session.id) recordCreationResume("studio"); }, [current?.session.id]);
  const generating = current?.versions.some((v) => v.status === "processing");
  useEffect(() => {
    setBranchChoice(null);
  }, [selectedId, current?.session.revision]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!current) return;
    const ready = current.versions
      .filter((v) => v.status === "ready")
      .map((v) => v.id);
    if (
      seenReady.current === null ||
      ready.some((id) => !seenReady.current!.includes(id))
    ) {
      setSelectedId(ready.at(-1) || null);
    }
    seenReady.current = ready;
  }, [current]);
  useEffect(() => {
    for (const ref of [desktopMessages]) {
      if (ref.current) {
        const messages = ref.current.querySelectorAll(".studio-message");
        const latest = current?.session.messages.at(-1);
        const dialogueReply = latest?.role === "assistant" && ["advise", "clarify"].includes(latest.operation || "");
        const target = (proposal && !dialogueReply && ref.current.querySelector(".studio-chat-confirmation")) || messages.item(messages.length - 1);
        if (target) {
          ref.current.scrollTop += target.getBoundingClientRect().top -
            ref.current.getBoundingClientRect().top -
            12;
        }
      }
    }
  }, [current?.session.messages.length, proposal]);
  useEffect(() => {
    const pending = sent.current;
    if (pending && current?.session.messages.some((m) => m.id === pending.id)) {
      if (draftRef.current.trim() === pending.text) {
        draftRef.current = "";
        setDraft("");
        writeDraft(localKey, "");
      }
      sent.current = null;
      setError("");
    }
  }, [current?.session.messages, localKey]);
  function editDraft(value: string) {
    setBranchChoice(null);
    draftRef.current = value;
    setDraft(value);
    writeDraft(localKey, value);
  }
  const [autoSend, setAutoSend] = useState<string | null>(null);
  useEffect(() => {
    if (autoSend && draft === autoSend) {
      setAutoSend(null);
      // The scene step needs the current references (saved model + product).
      void send("current");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, draft]);
  const openPhoto = useCallback(
    async (id: string) => {
      if (actionLock.current || !writable) return;
      actionLock.current = true;
      setBusy("opening");
      setError("");
      if (creation.current.photoId !== id) {
        creation.current = { id: crypto.randomUUID(), photoId: id };
      }
      try {
        const result = await studioRequest({
          action: "create",
          workspace_id: workspaceId,
          session_id: creation.current.id,
          photo_id: id,
        });
        if (alive.current) {
          writeDraft(
            draftKey(userId, workspaceId, result.session.id),
            draftRef.current,
          );
          navigate(studioPath(result.session.id), {
            replace: true,
          });
        }
      } catch (e) {
        if (alive.current) {
          setError(e instanceof Error ? e.message : "Ouverture impossible.");
        }
      } finally {
        actionLock.current = false;
        if (alive.current) setBusy("");
      }
    },
    [writable, workspaceId, userId, navigate, studioPath],
  );
  useEffect(() => {
    if (photoId && !sessionId && !sourceInit.current && writable) {
      sourceInit.current = true;
      void openPhoto(photoId);
    }
  }, [photoId, sessionId, writable, openPhoto]); // A stable id makes a lost create response retryable.
  async function mutate(action: string, extra: Record<string, unknown> = {}) {
    if (!alive.current || !sessionId || actionLock.current || !writable) {
      return null;
    }
    actionLock.current = true;
    setBusy(action);
    setError("");
    try {
      await cache.cancelQueries({ queryKey });
      const result = await studioRequest({
        action,
        session_id: sessionId,
        workspace_id: workspaceId,
        ...extra,
      });
      if (alive.current) {
        if (action === "composition_save") {
          setOlderCompositions([]);
          setMoreCompositions(true);
        }
        if (action === "memory_apply") {
          setAttachments([...attachedIds, ...(result.session.references || []).filter(ref => ref.memory_id === extra.memory_id).map(ref => ref.id)]);
        }
        cache.setQueryData(queryKey, result);
      }
      return result;
    } catch (e) {
      if (e instanceof StudioRequestError && e.code === "refresh_request") {
        sent.current = null;
      }
      if (e instanceof StudioRequestError && e.code === "branch_reference_choice") {
        if (alive.current && selectedId && current) {
          const names = (v: unknown) => Array.isArray(v) ? v.filter((n): n is string => typeof n === "string") : [];
          setBranchChoice({
            target: selectedId,
            revision: current.session.revision,
            versionNames: names(e.detail?.version_names),
            currentNames: names(e.detail?.current_names),
          });
        }
        return null;
      }
      if (alive.current) {
        setError(
          e instanceof Error ? e.message : "La demande n’a pas pu aboutir.",
        );
        void state.refetch();
      }
      return null;
    } finally {
      actionLock.current = false;
      if (alive.current) setBusy("");
    }
  }
  // The server's active references are what a request sends: change them there,
  // not only in this browser, or a joined image looks attached but is not.
  // `base` is the latest server state: right after another call (e.g. joining a
  // scene), the rendered `current` still has the previous revision and references.
  async function syncAttachments(ids: string[], branchId: string | null, base = current) {
    if (!base) return;
    const wanted = [...new Set(ids)].filter((id) => (base.session.references || []).some((ref) => ref.id === id));
    const active = base.session.active_reference_ids;
    if (active === undefined) { setAttachments(wanted); return; }
    const same = wanted.length === active.length && wanted.every((id) => active.includes(id)) &&
      base.session.conversation_branch_id === branchId;
    if (!same) await updateSelection(wanted, false, branchId, base.session.revision);
  }
  // Selecting a scene joins it with its reserved originals, keeps the photos the
  // user attached since, and drops other created scenes.
  function sceneAttachments(item: { id: string; proposal: { planning_references?: StudioReference[] } }) {
    const kept = activeIds.filter((id) => {
      const ref = references.find((r) => r.id === id);
      return !ref?.version_id || ref.role !== "scene" || ref.version_id === item.id;
    });
    return [...kept, ...(item.proposal.planning_references || []).map((ref) => ref.id),
      ...references.filter((ref) => ref.version_id === item.id).map((ref) => ref.id)];
  }
  async function updateSelection(ids: string[], newRequest = false, branchId = selectedId, revision = current?.session.revision) {
    if (!current) return;
    const result = await mutate("selection", { reference_ids: ids, revision,
      viewed_version_id: newRequest ? null : branchId, new_request: newRequest });
    if (result) {
      setAttachments(result.session.active_reference_ids ?? ids);
      if (newRequest) { setSelectedId(null); setSelectedReferenceId(null); editDraft(""); }
    }
  }
  async function addReferencePhotos(photos: UserPhotoRow[]) {
    if (!photos.length || !writable || actionLock.current || generating) return;
    if (creation.current.photoId && !sessionId) {
      creation.current = { id: crypto.randomUUID(), photoId: "" };
    }
    const targetId = sessionId || creation.current.id;
    const targetKey = ["visual-studio", userId, workspaceId, targetId];
    let latest: StudioState | undefined = current;
    let added = 0;
    actionLock.current = true;
    setBusy("references");
    setError("");
    try {
      await cache.cancelQueries({ queryKey: targetKey });
      if (!latest) {
        latest = await studioRequest({
          action: "create", workspace_id: workspaceId, session_id: targetId,
        });
        if (alive.current) cache.setQueryData(targetKey, latest);
      }
      for (const photo of photos) {
        if (latest.session.references?.some((ref) => ref.photo_id === photo.id) ||
          latest.session.source_photo_id === photo.id) continue;
        latest = await studioRequest({
          action: "reference", workspace_id: workspaceId, session_id: targetId,
          photo_id: photo.id, reference_role: referenceRoleForPhoto(photo), role_source: "library",
          revision: latest.session.revision,
        });
        added += 1;
        if (alive.current) cache.setQueryData(targetKey, latest);
      }
      if (!alive.current) return;
      const chosenIds = photos.map((photo) => latest?.session.references?.find((ref) => ref.photo_id === photo.id)?.id).filter((id): id is string => !!id);
      // A photo already in the discussion is not re-added: select it on the server,
      // which is what a request sends, or it would only look attached.
      const serverIds = latest.session.active_reference_ids;
      if (serverIds && chosenIds.some((id) => !serverIds.includes(id))) {
        latest = await studioRequest({
          action: "selection", workspace_id: workspaceId, session_id: targetId,
          reference_ids: [...new Set([...serverIds, ...chosenIds])], revision: latest.session.revision,
          viewed_version_id: latest.session.conversation_branch_id ?? null,
        });
        if (alive.current) cache.setQueryData(targetKey, latest);
      }
      setAttachments(latest.session.active_reference_ids ?? [...activeIds, ...chosenIds], `${draftKey(userId, workspaceId, targetId)}:images`);
      if (!sessionId) {
        writeDraft(draftKey(userId, workspaceId, targetId), draftRef.current);
        navigate(studioPath(targetId), { replace: true });
      }
      if (added) toast.success(`${added} photo${added > 1 ? "s" : ""} de référence ajoutée${added > 1 ? "s" : ""}`);
    } catch (cause) {
      // A response can be lost after the server attached a photo. Read the
      // session before offering a retry so the picker cannot duplicate it.
      try {
        latest = await studioRequest({ action: "read", workspace_id: workspaceId, session_id: targetId });
        if (alive.current) cache.setQueryData(targetKey, latest);
      } catch { /* The previous confirmed state remains in the cache. */ }
      if (!alive.current) return;
      const attachedCount = photos.filter((photo) => latest?.session.references?.some((ref) => ref.photo_id === photo.id) ||
        latest?.session.source_photo_id === photo.id).length;
      if (latest) {
        const chosenIds = photos.map((photo) => latest?.session.references?.find((ref) => ref.photo_id === photo.id)?.id).filter((id): id is string => !!id);
        setAttachments([...activeIds, ...chosenIds], `${draftKey(userId, workspaceId, targetId)}:images`);
      }
      if (latest && attachedCount === photos.length) {
        if (!sessionId) {
          writeDraft(draftKey(userId, workspaceId, targetId), draftRef.current);
          navigate(studioPath(targetId), { replace: true });
        }
        toast.success(`${attachedCount} photo${attachedCount > 1 ? "s" : ""} de référence ajoutée${attachedCount > 1 ? "s" : ""}`);
        return;
      }
      const message = cause instanceof Error ? cause.message : "Impossible d’ajouter ces photos.";
      if (!sessionId && latest) {
        writeDraft(draftKey(userId, workspaceId, targetId), draftRef.current);
        navigate(studioPath(targetId), { replace: true });
      } else setError(message);
      toast.error(attachedCount
        ? `Ajout interrompu après ${attachedCount} photo${attachedCount > 1 ? "s" : ""}. Elle${attachedCount > 1 ? "s restent" : " reste"} dans la session. ${message}`
        : `Aucune photo ajoutée. ${message}`);
    } finally {
      actionLock.current = false;
      if (alive.current) setBusy("");
    }
  }
  async function addLocalFiles(files: FileList | File[] | null) {
    if (!files?.length || busy || !writable) return;
    const capacity = Math.max(0, 8 - references.length);
    const chosen = [...files].slice(0, capacity);
    if (!chosen.length) { toast.error("Cette discussion utilise déjà huit images de référence."); return; }
    if (files.length > capacity) toast.info(`Tu peux joindre ${capacity} image${capacity > 1 ? "s" : ""} de plus dans cette discussion.`);
    setBusy("upload");
    try {
      const result = await localUpload.mutate(chosen);
      if (result.failed) toast.error(`${result.failed} image${result.failed > 1 ? "s" : ""} non ajoutée${result.failed > 1 ? "s" : ""}.`);
      if (result.photoIds.length) {
        setBusy("");
        await addReferencePhotos(result.photoIds.map((id) => ({ id, kind: "autre" } as UserPhotoRow)));
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Import impossible.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
      if (alive.current && !actionLock.current) setBusy("");
    }
  }
  async function attachVersionAsReference(versionId: string, auto = false) {
    const isScene = current?.versions.find((v) => v.id === versionId)?.proposal.scene_workflow?.phase === "scene";
    const existing = references.find((ref) => ref.version_id === versionId);
    // Only the selected scene stays joined: drop older auto-joined scenes.
    const keptIds = auto
      ? activeIds.filter((id) => {
        const ref = references.find((r) => r.id === id);
        return !ref?.version_id || ref.version_id === versionId || !autoAttachedScenes.current.has(ref.version_id);
      })
      : attachedIds;
    if (existing) {
      if (auto) { await syncAttachments([...keptIds, existing.id], versionId); return; }
      await updateSelection([...new Set([...activeIds, existing.id])], false, null);
      if (!isScene) setSelectedId(null);
      return;
    }
    if (!current || references.length >= 8) {
      if (!auto) toast.error("Cette discussion utilise déjà huit images de référence.");
      return;
    }
    // A scene is the decor to keep and a model sheet is a casting. Any other
    // created image (a packshot, a product…) gets its role from the request:
    // "style" told the generator never to copy its product.
    const isSheet = current?.versions.find((v) => v.id === versionId)?.proposal.person_reference?.mode === "sheet";
    const result = await mutate("reference", {
      version_id: versionId,
      reference_role: isScene ? "scene" : isSheet ? "casting" : "auto",
      revision: current.session.revision,
    });
    const joined = result?.session.references?.find((ref) => ref.version_id === versionId);
    if (joined) {
      if (auto) await syncAttachments([...keptIds, joined.id], versionId, result);
      else setAttachments(result.session.active_reference_ids ?? [...keptIds, joined.id]);
      if (!isScene) setSelectedId(null);
      if (!auto) toast.success("Image jointe à ta prochaine demande.");
    }
  }
  const autoAttachedScenes = useRef(new Set<string>());
  const readyScene = current?.versions.find((v) => v.status === "ready" && v.proposal.scene_workflow?.phase === "scene" && v.id === selectedId);
  useEffect(() => {
    if (!readyScene || !writable || busy || generating || autoAttachedScenes.current.has(readyScene.id)) return;
    autoAttachedScenes.current.add(readyScene.id);
    void attachVersionAsReference(readyScene.id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyScene?.id, writable, busy, generating]);
  async function send(branchReferenceMode?: "version" | "current") {
    if (
      !draft.trim() ||
      actionLock.current ||
      !writable ||
      (sessionId && !current)
    ) {
      return;
    }
    if (!current) {
      actionLock.current = true;
      setBusy("message");
      setError("");
      const text = draft.trim(),
        id = creation.current.id;
      try {
        const opened = await studioRequest({
          action: "create",
          workspace_id: workspaceId,
          session_id: id,
        });
        if (!alive.current) return;
        if (!sent.current || sent.current.text !== text) {
          sent.current = {
            id: crypto.randomUUID(),
            text,
            revision: opened.session.revision,
          };
        }
        const result = await studioRequest({
          action: "message",
          workspace_id: workspaceId,
          session_id: id,
          message: text,
          reference_ids: [],
          request_id: sent.current.id,
          revision: sent.current.revision,
        });
        if (!alive.current) return;
        cache.setQueryData(["visual-studio", userId, workspaceId, id], result);
        writeDraft(
          draftKey(userId, workspaceId, id),
          draftRef.current.trim() === text ? "" : draftRef.current,
        );
        writeDraft(localKey, "");
        navigate(studioPath(id), { replace: true });
      } catch (e) {
        if (alive.current) {
          setError(e instanceof Error ? e.message : "Réessaie l’envoi.");
          if (e instanceof StudioRequestError && e.code === "refresh_request") {
            sent.current = null;
          }
        }
      } finally {
        actionLock.current = false;
        if (alive.current) setBusy("");
      }
      return;
    }
    const activeReferenceIds = current.session.active_reference_ids !== undefined
      ? current.session.active_reference_ids
      : attachedIds.length ? attachedIds
      : proposal && (proposal.reference_snapshot?.length || proposal.planning_references?.length)
      ? [...new Set([...(proposal.reference_snapshot || []), ...(proposal.planning_references || [])].filter(ref => references.some(r => r.id === ref.id)).map(ref => ref.id))]
      : !current.session.messages.some((message) => message.role === "user")
      ? references.map((ref) => ref.id)
      : [];
    const attachmentFingerprint = activeReferenceIds.join(":");
    // Keep the same request ID after an uncertain response, but not for a different message.
    if (
      !sent.current ||
      sent.current.text !== draft.trim() ||
      sent.current.revision !== current.session.revision ||
      sent.current.target !== (selectedId || selectedReference?.id || "") ||
      sent.current.attachments !== attachmentFingerprint
    ) {
      sent.current = {
        id: crypto.randomUUID(),
        text: draft.trim(),
        revision: current.session.revision,
        target: selectedId || selectedReference?.id || "",
        attachments: attachmentFingerprint,
      };
    }
    const submittedText = sent.current.text;
    const result = await mutate("message", {
      message: sent.current.text,
      request_id: sent.current.id,
      revision: sent.current.revision,
      viewed_version_id: selectedId,
      viewed_reference_id: selectedId || activeReferenceIds.length
        ? selectedReference?.id || null
        : null,
      reference_ids: branchReferenceMode || selectedId && current.session.conversation_branch_id !== selectedId ? undefined : activeReferenceIds,
      branch_reference_mode: branchReferenceMode,
    });
    if (result && alive.current) {
      if (draftRef.current.trim() === submittedText) editDraft("");
      sent.current = null;
      setBranchChoice(null);
      if (result.session.active_reference_ids) setAttachments(result.session.active_reference_ids);
    }
  }
  async function save(useInContent = false, target?: typeof version) {
    if (!current || actionLock.current || !writable) return;
    return saveVersion(useInContent, target ?? version);
  }
  async function saveVersion(useInContent: boolean, version: (typeof current)["versions"][number] | undefined) {
    if (!version) {
      if (useInContent && current.session.source_photo_id) {
        navigate(contentPath, {
          state: { libraryPhotoIds: [current.session.source_photo_id] },
        });
      }
      return;
    }
    actionLock.current = true;
    setBusy("save");
    setError("");
    try {
      const receipt = version.library_photo_id
        ? { photo_id: version.library_photo_id }
        : await studioRequest<{ photo_id: string }>({
          action: "save",
          workspace_id: workspaceId,
          session_id: sessionId,
          version_id: version.id,
        });
      if (!alive.current) return;
      await cache.invalidateQueries({ queryKey: ["user-photos", workspaceId] });
      if (!alive.current) return;
      if (useInContent) {
        navigate(contentPath, { state: { libraryPhotoIds: [receipt.photo_id] } });
      } else {
        await state.refetch();
        toast.success("Image ajoutée à la bibliothèque.");
      }
    } catch (e) {
      if (alive.current) {
        setError(
          e instanceof Error
            ? e.message
            : "L’image reste dans la session. Réessaie l’enregistrement.",
        );
      }
    } finally {
      actionLock.current = false;
      if (alive.current) setBusy("");
    }
  }
  async function setSessionArchived(id: string, revision: number, archive: boolean) {
    if (!roleWritable || sessionAction) return;
    setSessionAction(id);
    try {
      await studioRequest({
        action: archive ? "archive" : "restore",
        workspace_id: workspaceId,
        session_id: id,
        revision,
      });
      await cache.invalidateQueries({ queryKey: ["visual-studio-sessions", userId, workspaceId] });
      if (id === sessionId) {
        if (archive) {
          setSessionsOpen(false);
          navigate(studioPath());
        } else {
          await state.refetch();
        }
      }
      toast.success(archive ? "Session archivée. Ses images restent disponibles." : "Session restaurée.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de modifier cette session.");
      await sessions.refetch();
    } finally {
      setSessionAction(null);
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
      if (alive.current) setError(cause instanceof Error ? cause.message : "Préparation impossible.");
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
      if (alive.current) setError(e instanceof Error ? e.message : "Composition indisponible.");
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
      if (alive.current) setError(e instanceof Error ? e.message : "Historique indisponible.");
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
          {busy === "opening" || (sessionId && !current && state.isFetching)
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
                    setError={setError}
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
