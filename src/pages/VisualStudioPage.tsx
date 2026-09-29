import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ImagePlus,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { StudioCompositionEditor } from "@/features/visual-studio/StudioCompositionEditor";
import { uploadPhotoOriginal, type UserPhotoRow } from "@/lib/photo-storage";
import { OfferMockupDialog } from "@/components/photos/OfferMockupDialog";
import { AvantApresDialog } from "@/components/photos/AvantApresDialog";
import PhotoPreparationDialog from "@/components/photos/PhotoPreparationDialog";
import { StudioMemoryPanel } from "@/features/visual-studio/StudioMemoryPanel";
import { StudioBrandContext } from "@/features/visual-studio/StudioBrandContext";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PhotoLibraryPickerDialog } from "@/components/photos/PhotoLibraryPickerDialog";
import { useUploadLibraryPhotos } from "@/hooks/use-user-photos";
import {
  StudioVideoPanel,
  type VideoSource,
} from "@/features/studio-video/StudioVideoPanel";
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

const CHAT_WIDTH_KEY = "visual-studio-chat-width";
const CHAT_WIDTH_DEFAULT = 430;
const CHAT_WIDTH_MIN = 340;
const CHAT_WIDTH_MAX = 760;


function referenceRoleForPhoto(photo: UserPhotoRow): StudioReference["role"] {
  if (photo.kind === "produit" || photo.kind === "produit_porte") return "product";
  if (photo.kind === "portrait") return "person";
  if (photo.kind === "ambiance") return "style";
  return "subject";
}
function readAttachedIds(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}
function writeAttachedIds(key: string, ids: string[]) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* The session still contains the references. */ }
}

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
  const reelPassage = urlParams.get("reel_passage");
  const reelReturn = reelPassage !== null && /^\d+$/.test(reelPassage)
    ? Number(reelPassage)
    : null;
  const studioPath = useCallback((id?: string) => {
    const next = new URLSearchParams();
    if (id) next.set("session", id);
    if (reelReturn !== null) next.set("reel_passage", String(reelReturn));
    const query = next.toString();
    return `/photos/studio${query ? `?${query}` : ""}`;
  }, [reelReturn]);
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
  const gridRef = useRef<HTMLDivElement>(null);
  const chatWidthLatest = useRef(CHAT_WIDTH_DEFAULT);
  const [chatWidth, setChatWidth] = useState(() => {
    try {
      const value = Number(localStorage.getItem(CHAT_WIDTH_KEY));
      return Number.isFinite(value) && value >= CHAT_WIDTH_MIN && value <= CHAT_WIDTH_MAX
        ? value
        : CHAT_WIDTH_DEFAULT;
    } catch {
      return CHAT_WIDTH_DEFAULT;
    }
  });
  chatWidthLatest.current = chatWidth;
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1001px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1001px)");
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const persistChatWidth = useCallback((value: number) => {
    try {
      localStorage.setItem(CHAT_WIDTH_KEY, String(value));
    } catch {
      /* Le réglage de largeur reste pour la session. */
    }
  }, []);
  const startChatResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      handle.dataset.resizing = "true";
      const move = (ev: PointerEvent) => {
        const grid = gridRef.current;
        if (!grid) return;
        const rect = grid.getBoundingClientRect();
        const next = Math.min(
          CHAT_WIDTH_MAX,
          Math.max(CHAT_WIDTH_MIN, Math.round(ev.clientX - rect.left)),
        );
        chatWidthLatest.current = next;
        setChatWidth(next);
      };
      const end = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        delete handle.dataset.resizing;
        persistChatWidth(chatWidthLatest.current);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    },
    [persistChatWidth],
  );
  const resetChatWidth = useCallback(() => {
    setChatWidth(CHAT_WIDTH_DEFAULT);
    chatWidthLatest.current = CHAT_WIDTH_DEFAULT;
    persistChatWidth(CHAT_WIDTH_DEFAULT);
  }, [persistChatWidth]);

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
  const [existingTool, setExistingTool] = useState<
    "mockup" | "before_after" | null
  >(null);
  const [preparation, setPreparation] = useState<{
    source: { id: string; name: string; dataUrl: string };
    recipe?: StudioMessage["preparation"];
    role: StudioReference["role"];
  } | null>(null);
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
  } | null>(null);
  const localKey = draftKey(userId, workspaceId, sessionId || "new");
  const [draft, setDraft] = useState(() => readDraft(localKey));
  const attachmentKey = `${localKey}:images`;
  const [attachedIds, setAttachedIds] = useState<string[]>(() => readAttachedIds(attachmentKey));
  const localUpload = useUploadLibraryPhotos();
  const fileInput = useRef<HTMLInputElement>(null);
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
  const attachedReferences = attachedIds.map((id) => references.find((ref) => ref.id === id)).filter((ref): ref is StudioReference => !!ref);
  useEffect(() => { setAttachedIds(readAttachedIds(attachmentKey)); }, [attachmentKey]);
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
        const target = (proposal && ref.current.querySelector(".studio-chat-confirmation")) || messages.item(messages.length - 1);
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
        cache.setQueryData(queryKey, result);
      }
      return result;
    } catch (e) {
      if (e instanceof StudioRequestError && e.code === "refresh_request") {
        sent.current = null;
      }
      if (e instanceof StudioRequestError && e.code === "branch_reference_choice") {
        if (alive.current && selectedId && current) {
          setBranchChoice({ target: selectedId, revision: current.session.revision });
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
          photo_id: photo.id, reference_role: referenceRoleForPhoto(photo),
          revision: latest.session.revision,
        });
        added += 1;
        if (alive.current) cache.setQueryData(targetKey, latest);
      }
      if (!alive.current) return;
      const chosenIds = photos.map((photo) => latest?.session.references?.find((ref) => ref.photo_id === photo.id)?.id).filter((id): id is string => !!id);
      setAttachments([...attachedIds, ...chosenIds], `${draftKey(userId, workspaceId, targetId)}:images`);
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
        setAttachments([...attachedIds, ...chosenIds], `${draftKey(userId, workspaceId, targetId)}:images`);
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
  async function addLocalFiles(files: FileList | null) {
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
  async function attachVersionAsReference(versionId: string) {
    const existing = references.find((ref) => ref.version_id === versionId);
    if (existing) {
      setAttachments([...attachedIds, existing.id]);
      setSelectedId(null);
      return;
    }
    if (!current || references.length >= 8) {
      toast.error("Cette discussion utilise déjà huit images de référence.");
      return;
    }
    const result = await mutate("reference", {
      version_id: versionId,
      reference_role: "style",
      revision: current.session.revision,
    });
    const joined = result?.session.references?.find((ref) => ref.version_id === versionId);
    if (joined) {
      setAttachments([...attachedIds, joined.id]);
      setSelectedId(null);
      toast.success("Image jointe à ta prochaine demande.");
    }
  }
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
    const activeReferenceIds = attachedIds.length
      ? attachedIds
      : proposal?.reference_snapshot?.length
      ? proposal.reference_snapshot.map((ref) => ref.id)
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
      reference_ids: activeReferenceIds,
      branch_reference_mode: branchReferenceMode,
    });
    if (result && alive.current) {
      if (draftRef.current.trim() === submittedText) editDraft("");
      sent.current = null;
      setBranchChoice(null);
      if (result.session.proposal) setAttachments([]);
    }
  }
  async function save(useInContent = false) {
    if (!current || actionLock.current || !writable) return;
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
  function confirmation() {
    return proposal
      ? (
        <section
          className="studio-confirm space-y-4"
          aria-label="Demande à confirmer"
        >
          <p className="text-xs text-primary font-medium">À confirmer</p>
          <h2 className="font-display text-xl">
            {{
              background: "Un nouveau fond",
              create: "Une nouvelle image",
              edit: "Une image ajustée",
              product: "Ton produit en situation",
            }[proposal.operation]}
          </h2>
          <div className="rounded-lg bg-background p-3 text-sm">
            <h3 className="font-semibold mb-2">Ce que j’ai compris</h3>
            <p className="whitespace-pre-wrap">{proposal.summary}</p>
          </div>
          {!!proposal.exact_text?.length && <div className="text-sm">
            <strong>Texte à afficher dans l’image :</strong>
            <ul className="list-disc pl-5 mt-1">{proposal.exact_text.map((item, index) => <li key={`${item}:${index}`}>« {item} »</li>)}</ul>
          </div>}
          {!!proposal.reference_snapshot?.length && <div className="text-sm">
            <strong>Images utilisées :</strong>
            <ol className="list-decimal pl-5 mt-1">{proposal.reference_snapshot.map((ref) => <li key={ref.id}>{ref.name} · {{ subject: "sujet à préserver", product: "produit exact", person: "personne réelle", casting: "mannequin fictif", style: "ambiance", composition: "composition", logo: "logo" }[ref.role]}</li>)}</ol>
          </div>}
          {proposal.composition && (
            <p className="text-sm">
              L’image de fond sera créée par l’IA. Tu ajouteras ensuite les
              textes exacts et ton logo dans l’affiche.
            </p>
          )}
          {!!proposal.shots?.length && (
            <div className="text-sm space-y-2">
              <h3 className="font-medium">Prises supplémentaires</h3>
              <ol className="list-decimal pl-5">
                {proposal.shots.map((shot) => (
                  <li key={shot.id}>{shot.summary}</li>
                ))}
              </ol>
            </div>
          )}
          {proposal.provider === "higgsfield" && (
            <p className="text-xs text-muted-foreground">
              {proposal.model === "higgsfield-ai/soul/v2/standard"
                ? "Cette photo sera créée avec Soul2 après confirmation."
                : "Les références choisies seront transmises à Higgsfield après confirmation."}
            </p>
          )}
          <dl className="text-sm space-y-3">
            <div>
              <dt className="text-muted-foreground">
                Photo réellement utilisée
              </dt>
              <dd>
                {proposal.viewed_version_id
                  ? `Version ${
                    (current?.versions.filter((v) => v.status === "ready")
                      .findIndex((v) => v.id === proposal.viewed_version_id) ??
                      -1) + 1
                  }`
                  : proposal.viewed_reference_id
                  ? references.find(
                    (r) => r.id === proposal.viewed_reference_id,
                  )?.name || "Référence choisie"
                  : "Création sans photo de départ"}
              </dd>
              {proposal.viewed_version_id &&
                proposal.viewed_version_id !== selectedId && (
                <p className="mt-2 text-primary">
                  La demande vise cette version, même si tu en regardes une
                  autre.
                </p>
              )}
            </div>
            <div>
              <dt className="text-muted-foreground">Outil</dt>
              <dd>
                {proposal.operation === "background"
                  ? "Changer le décor"
                  : "Création générative · Premium"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Format</dt>
              <dd>
                {proposal.operation === "background"
                  ? "Dimensions de la photo source"
                  : {
                    portrait: "Portrait",
                    landscape: "Paysage",
                    square: "Carré",
                  }[proposal.format || "square"]}
              </dd>
            </div>
          </dl>
          {proposal.brand_context && <details className="text-sm"><summary>Contexte de marque utilisé</summary><StudioBrandContext context={proposal.brand_context} /></details>}
          {proposal.preserve?.length
            ? (
              <p className="text-sm">
                <strong>À conserver :</strong>
                {proposal.preserve.join(" · ")}
              </p>
            )
            : null}
          {proposal.change?.length
            ? (
              <p className="text-sm">
                <strong>À changer :</strong>
                {proposal.change.join(" · ")}
              </p>
            )
            : null}
          <p className="rounded-lg bg-background p-3 text-sm">
            {proposal.operation === "background"
              ? "Le fond sera remplacé. Le sujet n’est pas redessiné. Vérifie le détourage avant d’utiliser l’image."
              : proposal.warning ||
                "Vérifie les détails du résultat avant de l’utiliser."}
          </p>
          {premiumBlocked && (
            <p role="status" className="text-sm">
              Cette création est réservée à Premium. Tu peux continuer à
              préparer ton idée. Rien n’a été décompté.
            </p>
          )}
          <div className="flex justify-between gap-2">
            <strong>{proposal.cost} image{proposal.cost > 1 ? "s" : ""}</strong>
            <span className="text-xs text-muted-foreground">
              Décomptée après résultat conservé
            </span>
          </div>
          {!current?.quota.allowed && (
            <p role="status" className="text-sm">
              {current?.quota.message ||
                "Le quota doit être vérifié avant de générer."}
            </p>
          )}
          <Button
            className="w-full"
            disabled={!writable ||
              !!busy ||
              generating ||
              !current?.quota.allowed ||
              premiumBlocked}
            onClick={async () => {
              const result = await mutate("generate", {
                proposal_id: proposal.id,
              });
              if (result && alive.current && isMobile) {
                document.querySelector(".studio-stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
          >
            {busy === "generate"
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : null}
            {proposal.cost > 1
              ? `Générer la série · ${proposal.cost} images`
              : "Générer cette image · 1 image"}
          </Button>
          {!!proposal.shots?.length && <Button variant="outline" className="w-full h-auto whitespace-normal py-2" disabled={!writable || !!busy || !!generating} onClick={() => void mutate("pilot", { proposal_id: proposal.id, revision: current!.session.revision })}>D’abord une image pilote · 1 image</Button>}
          <p className="text-xs text-muted-foreground">
            Une image réussie compte même si tu ne la gardes pas. Un échec
            technique n’est pas décompté.
          </p>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              editDraft(proposal.summary);
            }}
          >
            Modifier ma demande
          </Button>
        </section>
      )
      : (
        <div className="studio-confirm space-y-3">
          <h2 className="font-display text-xl">
            Une idée, une question, une image
          </h2>
          <p className="text-sm">
            Décris ton idée. La conversation prépare ta demande ; seule ta
            confirmation lance la création.
          </p>
          <p className="text-xs text-muted-foreground">
            Fonds inclus dans ton quota. Création, mise en scène et
            transformation générative en Premium. Les textes des compositions
            restent modifiables sans crédit image.
          </p>
        </div>
      );
  }
  function chat(mobile = false) {
    return (
      <div className="studio-chat-inner">
        {!mobile && (
          <div className="p-5 border-b">
            <h2 className="font-medium line-clamp-2">
              {current?.session.name || "Ta demande"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Fais défiler la conversation ↓ · tout reste dans cette session
            </p>
          </div>
        )}
        <>
              <div
                ref={desktopMessages}
                className="studio-messages"
                aria-live="polite"
              >
                {!current && (
                  <div className="studio-message">
                    <p>
                      Quel visuel t’aiderait aujourd’hui ? Décris ton idée, pose
                      une question ou choisis une photo. Je m’appuie sur
                      l’identité de ta marque pour t’aider à préciser le
                      résultat.
                    </p>
                  </div>
                )}
                {current?.session.messages.map((m, i) => proposal &&
                  i === current.session.messages.length - 1 &&
                  m.role === "assistant" && m.text === proposal.summary ? null : (
                  <div
                    key={m.id || i}
                    className={m.role === "user"
                      ? "studio-message mine"
                      : "studio-message"}
                  >
                    <span className="block text-xs font-semibold mb-1">
                      {m.role === "user" ? "Toi" : "Studio"}
                    </span>
                    {!!m.reference_ids?.length && <div className="studio-attached-images" aria-label="Images jointes à ce message">
                      {m.reference_ids.map((id, index) => {
                        const ref = m.reference_snapshot?.find((item) => item.id === id) || references.find((item) => item.id === id);
                        return <div key={`${id}:${index}`} className="studio-attached-image">
                          {ref?.url && <img src={ref.url} alt="" />}
                          <span>Image {index + 1}{ref ? ` · ${ref.name}` : " · référence conservée"}</span>
                        </div>;
                      })}
                    </div>}
                    <p>{m.text}</p>
                    {m.suggested_memory_ids?.map((id) => {
                      const item = current.memory?.find((entry) => entry.id === id);
                      return item ? <Button key={id} variant="outline" className="my-2 max-w-full h-auto whitespace-normal break-words py-2" disabled={!writable || !!busy || !!generating || references.some((r) => r.memory_id === id)} onClick={() => void mutate("memory_apply", {memory_id:id,revision:current.session.revision})}>{item.kind === "casting" ? "Utiliser ce mannequin" : "Utiliser cette direction"} · {item.name}</Button> : null;
                    })}
                    {m.operation === "compose" && (
                      <Button
                        variant="link"
                        disabled={!writable}
                        onClick={() => {
                          setSelectedComposition(null);
                          setCompositionDraft(m.composition ? { ...m.composition, logo_data_url: current?.session.composition?.design.logo_data_url || null } : undefined);
                          setCompositionOpen(true);
                        }}
                      >
                        Corriger les textes de cette affiche
                      </Button>
                    )}
                    {m.operation === "existing_tool" && (
                      <Button
                        variant="link"
                        className="px-0"
                        onClick={() => m.existing_tool === "preparation"
                          ? void openPreparation(m)
                          : setExistingTool(m.existing_tool || "mockup")}
                      >
                        {m.existing_tool === "preparation" ? "Préparer cette photo sans la redessiner" : m.existing_tool === "before_after" ? "Créer l’avant/après" : "Créer le mockup"}
                      </Button>
                    )}
                  </div>
                ))}
                {proposal && <div className="studio-chat-confirmation">{confirmation()}</div>}
                <div
                  className="flex flex-wrap gap-2"
                  aria-label="Idées d’ajustement"
                >
                  {(current?.session.messages.at(-1)?.suggestions?.length
                    ? current.session.messages.at(-1)!.suggestions!
                    : version
                    ? [
                      "Garde la scène, change la lumière",
                      "Propose une autre direction",
                    ]
                    : source
                    ? ["Un fond uni crème", "Mets ce produit en situation"]
                    : [
                      "Quel visuel pour mon offre ?",
                      "Crée une illustration",
                      "Aide-moi à choisir une photo",
                    ]).map((t) => (
                      <Button
                        key={t}
                        size="sm"
                        variant="outline"
                        className="studio-suggestion"
                        disabled={!writable || !!busy || generating}
                        onClick={() => editDraft(t)}
                      >
                        {t}
                      </Button>
                    ))}
                </div>

                <section className="studio-chat-actions" aria-label="Actions et références">
                  {!!display && (
                    <div className="studio-current-image">
                      <h3 className="font-medium text-sm">Sur l’image sélectionnée · {label}</h3>
                      <p className="text-xs text-muted-foreground">
                        Les ajustements partent de cette version. Les précédentes restent disponibles à droite.
                      </p>
                      {version && comparisonSource && (
                        <Button size="sm" variant="ghost" onClick={() => setCompare(!compare)}>
                          {compare ? "Voir la version seule" : "Comparer à la source"}
                        </Button>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground my-3">
                    {version
                      ? version.library_photo_id
                        ? "Ajoutée à la bibliothèque · conservée dans cette session."
                        : "Conservée dans cette session · pas encore dans la bibliothèque."
                      : source
                      ? "Référence conservée dans la session."
                      : "Tes échanges et créations restent dans cette session."}
                  </p>
                  {version?.proposal.brand_context && (
                    <details className="text-sm"><summary>Contexte de marque de cette image</summary><StudioBrandContext context={version.proposal.brand_context} /></details>
                  )}
                  {version?.status === "ready" && version.proposal.composition && (
                    <Button
                      type="button"
                      className="mb-3"
                      disabled={!writable || !!busy}
                      onClick={() => {
                        setSelectedComposition(null);
                        setCompositionDraft(version.proposal.composition);
                        setCompositionOpen(true);
                      }}
                    >
                      Finaliser l’affiche avec ses textes
                    </Button>
                  )}
                  {version?.status === "ready" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mb-3"
                      onClick={() => chooseTab("video")}
                    >
                      Créer une vidéo avec cette image
                    </Button>
                  )}
                  {!!display && (
                    <Button type="button" variant="outline" className="mb-3" disabled={!!busy} onClick={() => void openPreparation()}>
                      Ajuster la lumière ou le format
                    </Button>
                  )}
                  {(version || current?.session.source_photo_id) && <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={!version ||
                        !!version.library_photo_id ||
                        !!busy ||
                        !writable}
                      onClick={() => void save()}
                    >
                      {version?.library_photo_id
                        ? "Dans la bibliothèque"
                        : "Ajouter à la bibliothèque"}
                    </Button>
                    <Button
                      disabled={!!busy ||
                        !writable ||
                        (!version && !current?.session.source_photo_id)}
                      onClick={() => void save(true)}
                    >
                      Créer un contenu
                    </Button>
                  </div>}
                  {(version || current?.session.source_photo_id) && <p className="mt-3 text-xs text-muted-foreground">
                    Créer un contenu ajoute aussi la version à ta bibliothèque.
                    Rien n’est publié.
                  </p>}
                  {generating && (
                    <div
                      role="status"
                      className="rounded-xl border bg-card p-4 my-4 text-sm"
                    >
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                      Création en cours.
                      <p className="mt-2">
                        Tu peux quitter le Studio et retrouver le résultat dans
                        « Mes sessions ».
                      </p>
                    </div>
                  )}
                  {current?.versions
                    .filter((v) => v.status === "failed")
                    .map((v) => (
                      <div
                        key={v.id}
                        className="rounded-xl border p-4 my-4 text-sm"
                      >
                        <p>{v.proposal.series_size ? `Image ${(v.proposal.series_index || 0) + 1} de la série · ` : ""}{v.error_message}</p>
                        <Button
                          variant="link"
                          disabled={!writable || !!busy || !!generating}
                          onClick={() => {
                            void mutate("retry", {
                              version_id: v.id,
                              revision: current!.session.revision,
                            });
                          }}
                        >
                          Réessayer cette image seulement
                        </Button>
                      </div>
                    ))}
                  {current?.versions
                    .filter((v) => v.status === "uncertain")
                    .map((v) => (
                      <div key={v.id} role="status" className="rounded-xl border p-4 my-4 text-sm">
                        <p>{v.proposal.series_size ? `Image ${(v.proposal.series_index || 0) + 1} de la série · ` : ""}{v.error_message}</p>
                        <p className="mt-2">Tu peux poursuivre une autre demande dans cette session. Cette image ne peut pas être relancée automatiquement.</p>
                      </div>
                    ))}
                  <details className="studio-extra-tools">
                    <summary>Autres outils et créations enregistrées{references.length ? ` · ${references.length} image${references.length > 1 ? "s" : ""} de référence` : ""}</summary>
                  <div className="studio-references">
                    {!!references.length && (
                      <>
                        <h3 className="text-sm font-medium mb-2">Photos de référence · {references.length}/8</h3>
                        <p className="text-xs text-muted-foreground mb-3">Ces images restent disponibles. Tu peux préciser leur rôle dans ton message ; seules celles retenues pour la demande sont envoyées au modèle.</p>
                      </>
                    )}
                    {references.map((ref) => (
                      <div
                        key={ref.id}
                        className="rounded-xl border bg-card p-3 my-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <img src={ref.url} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                          <span className="flex-1">{ref.name}</span>
                          <select
                            aria-label={`Rôle de ${ref.name}`}
                            value={ref.role}
                            disabled={!writable || !!busy || generating}
                            onChange={(e) =>
                              void mutate("reference", {
                                reference_id: ref.id,
                                reference_role: e.target.value,
                                revision: current!.session.revision,
                              })}
                          >
                            <option value="subject">Sujet à préserver</option>
                            <option value="product">Produit exact</option>
                            <option value="person">Personne réelle</option>
                            <option value="casting">Mannequin fictif</option>
                            <option value="logo">Logo à composer</option>
                            <option value="style">Ambiance</option>
                            <option value="composition">Composition</option>
                          </select>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Retirer ${ref.name}`}
                            disabled={!writable || !!busy || generating}
                            onClick={() =>
                              void mutate("reference", {
                                reference_id: ref.id,
                                remove: true,
                                revision: current!.session.revision,
                              })}
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    ))}
                    {!!current?.suggested_photos?.length && (
                      <div className="my-4">
                        <h3 className="font-medium text-sm">
                          Photos proposées · choisis celle qui convient
                        </h3>
                        <div className="studio-versions">
                          {current.suggested_photos
                            .filter(
                              (p) =>
                                !references.some((r) => r.photo_id === p.id),
                            )
                            .map((photo) => (
                              <button
                                type="button"
                                key={photo.id}
                                disabled={!writable || !!busy || generating}
                                onClick={() =>
                                  void mutate("reference", {
                                    photo_id: photo.id,
                                    reference_role: "subject",
                                    revision: current.session.revision,
                                  })}
                              >
                                <img src={photo.url} alt={photo.name} />
                                <span>Choisir {photo.name}</span>
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                    {references.length > 0 && (
                      <p className="text-xs text-muted-foreground mb-4">
                        Sujet = identité à préserver. Ambiance et composition =
                        inspiration uniquement. Après un changement de
                        référence, envoie ta demande pour préparer une nouvelle
                        proposition.
                      </p>
                    )}
                  </div>
                  {current && (
                    <StudioMemoryPanel
                      memory={current.memory || []}
                      selectedVersion={version?.status === "ready"
                        ? version.id
                        : undefined}
                      brief={current.session.brief || ""}
                      disabled={!writable || !!busy || !!generating}
                      onSave={(values) => mutate("memory_save", values)}
                      onApply={(id) =>
                        mutate("memory_apply", {
                          memory_id: id,
                          revision: current.session.revision,
                        })}
                    />
                  )}
                  {!!current?.charter_references?.length && (
                    <details className="my-4 text-sm">
                      <summary>Références visuelles de ma charte</summary>
                      <p className="text-xs text-muted-foreground my-2">
                        Choisis une ambiance à joindre à cette demande.
                      </p>
                      <div className="studio-versions">
                        {current.charter_references.map((r) => (
                          <button
                            type="button"
                            key={r.index}
                            disabled={!writable || !!busy || generating}
                            onClick={() =>
                              void mutate("reference", {
                                charter_index: r.index,
                                revision: current.session.revision,
                              })}
                          >
                            <img src={r.url} alt={r.name} />
                            <span>Utiliser {r.name}</span>
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                  {current && (
                    <div className="flex flex-wrap gap-2 my-3">
                      {!!compositionHistory.length && (
                        <details className="w-full text-sm">
                          <summary>Compositions enregistrées · {compositionHistory.length}{moreCompositions && current.composition_history?.length === 20 ? "+" : ""}</summary>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {compositionHistory.map((entry) => (
                              <Button
                                key={entry.id}
                                variant="outline"
                                size="sm"
                                disabled={!writable || !!busy}
                                onClick={async () => {
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
                                }}
                              >
                                Reprendre {entry.title.slice(0, 48) || "Composition"} · {new Date(entry.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                              </Button>
                            ))}
                          </div>
                          {moreCompositions && current.composition_history?.length === 20 && (
                            <Button variant="ghost" size="sm" className="mt-2" disabled={olderCompositionsBusy}
                              onClick={async () => {
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
                              }}
                            >{olderCompositionsBusy ? "Chargement…" : "Voir les compositions plus anciennes"}</Button>
                          )}
                        </details>
                      )}
                      <Button
                        variant="ghost"
                        disabled={!writable || !!busy}
                        onClick={() => setExistingTool("before_after")}
                      >
                        Avant / après
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={!writable || !!busy}
                        onClick={() => setExistingTool("mockup")}
                      >
                        Mockup d’offre
                      </Button>
                    </div>
                  )}
                  </details>
                </section>
              </div>
              <div className="studio-composer p-4 border-t space-y-3">
                {!!selectedId && <button type="button" className="text-xs text-primary text-left" onClick={() => { setSelectedId(null); setSelectedReferenceId(null); setCompare(false); }}>
                  À partir de l’image sélectionnée · changer de point de départ ×
                </button>}
                {activeBranchChoice && (
                  <div role="status" className="rounded-lg border border-primary/30 bg-card p-3 space-y-2 text-sm">
                    <p>Les références ont changé depuis cette version. Lesquelles veux-tu utiliser pour cette nouvelle demande ? Aucune image n’a été lancée.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" disabled={!!busy}
                        onClick={() => void send("version")}>
                        Celles de cette version
                      </Button>
                      <Button type="button" variant="outline" disabled={!!busy}
                        onClick={() => void send("current")}>
                        Mes références actuelles
                      </Button>
                    </div>
                  </div>
                )}
                <label
                  className="sr-only"
                  htmlFor={mobile ? "studio-draft-mobile" : "studio-draft"}
                >
                  Ta demande
                </label>
                {!!attachedReferences.length && <div className="studio-attached-images" aria-label="Images prêtes à être jointes">
                  {attachedReferences.map((ref, index) => <div className="studio-attached-image" key={ref.id}>
                    {ref.url && <img src={ref.url} alt="" />}
                    <span>Image {index + 1} · {ref.name}</span>
                    <button type="button" aria-label={`Retirer ${ref.name} de cette demande`} onClick={() => setAttachments(attachedIds.filter((id) => id !== ref.id))}>×</button>
                  </div>)}
                </div>}
                <Textarea
                  className="min-h-[88px] max-h-36 overflow-y-auto"
                  id={mobile ? "studio-draft-mobile" : "studio-draft"}
                  value={draft}
                  maxLength={1000}
                  onChange={(e) => editDraft(e.target.value)}
                  disabled={!writable}
                  placeholder="Une idée, une question, une image à améliorer…"
                />
                <input ref={fileInput} type="file" accept="image/*,.heic,.heif" multiple className="sr-only" aria-label="Importer plusieurs images" onChange={(event) => void addLocalFiles(event.target.files)} />
                <div className="flex items-center gap-2 flex-nowrap">
                  <Button variant="ghost" size="sm" className="whitespace-nowrap shrink-0" disabled={!writable || !!busy || generating || references.length >= 8} onClick={() => fileInput.current?.click()}>
                    <ImagePlus className="h-4 w-4 mr-2" /> Ajouter des images
                  </Button>
                  <Button variant="ghost" size="sm" className="whitespace-nowrap shrink-0" disabled={!writable || !!busy || generating || references.length >= 8} onClick={() => setPicker(true)}>
                    Depuis ma bibliothèque
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Les images importées restent dans ta bibliothèque.</p>
                {references.length >= 8 && <p className="text-xs text-muted-foreground">Huit références maximum. Retire une photo pour en choisir une autre.</p>}
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Envoyer ne génère rien.
                  </span>
                  <Button
                    disabled={!writable || !!busy || generating || activeBranchChoice ||
                      !draft.trim()}
                    onClick={() => void send()}
                  >
                    {busy === "message"
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : null}
                    Envoyer
                  </Button>
                </div>
              </div>
        </>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main id="main-content" className="studio-page">
        <header className="studio-header">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/photos")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Bibliothèque
            </Button>
            <h1 className="font-display text-2xl md:text-3xl">Studio visuel</h1>
          </div>
          <div className="text-right">
            <p className="text-sm">{workspaceName}</p>
            {!videoTab && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSessionsOpen(true)}
              >
                Mes sessions
              </Button>
            )}
          </div>
        </header>
        <nav aria-label="Sections du Studio" className="flex gap-2 px-5 pb-4">
          <Button
            type="button"
            variant={videoTab ? "outline" : "default"}
            aria-current={!videoTab ? "page" : undefined}
            onClick={() => chooseTab("photo")}
          >
            Photos
          </Button>
          <Button
            type="button"
            variant={videoTab ? "default" : "outline"}
            aria-current={videoTab ? "page" : undefined}
            onClick={() => chooseTab("video")}
          >
            Clips vidéo
          </Button>
        </nav>
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
        {videoTab && (
          <div className="mx-auto max-w-4xl px-5 pb-10 space-y-4">
            {reelReturn !== null && (
              <Button
                type="button"
                variant="outline"
                onClick={() => returnToReel()}
              >
                Retour au Reel · passage {reelReturn + 1}
              </Button>
            )}
            <StudioVideoPanel
              workspaceId={workspaceId}
              writable={roleWritable}
              draftKey={`studio-video:${userId}:${workspaceId}:${sessionId || "new"}:${videoSource?.id || "idea"}`}
              initialSource={videoSource}
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
                      onKeyDown={(e) => {
                        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                        e.preventDefault();
                        setChatWidth((w) => {
                          const next = Math.min(
                            CHAT_WIDTH_MAX,
                            Math.max(CHAT_WIDTH_MIN, w + (e.key === "ArrowLeft" ? -24 : 24)),
                          );
                          chatWidthLatest.current = next;
                          persistChatWidth(next);
                          return next;
                        });
                      }}
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
                      <p className="text-sm text-muted-foreground">Les nouvelles images suivent les précédentes. Choisis celle que tu veux reprendre.</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{current?.versions.length || 0} image{current?.versions.length === 1 ? "" : "s"}</span>
                  </div>
                  {!current?.versions.length && <div className="studio-empty">
                    <Sparkles className="h-9 w-9 text-primary" />
                    <h3 className="font-display text-2xl">Tout commence par ton idée</h3>
                    <p>Une photo, une affiche, une illustration ou un visuel encore à imaginer : décris-le dans la conversation. Le Studio reformulera ta demande avant de créer.</p>
                  </div>}
                  {!!current?.versions.length && <div className="studio-image-stream">
                    {current.versions.length > galleryLimit && <Button variant="outline" onClick={() => setGalleryLimit((limit) => limit + 20)}>Voir les images plus anciennes</Button>}
                    {current.versions.slice(-galleryLimit).map((item) => {
                      const number = current.versions.findIndex((entry) => entry.id === item.id) + 1;
                      const selected = selectedId === item.id;
                      return <article key={item.id} className={`studio-image-card${selected ? " selected" : ""}`}>
                        <div className="studio-image-card-head">
                          <strong>Image {number}{item.proposal.series_size ? ` · série ${(item.proposal.series_index || 0) + 1}/${item.proposal.series_size}` : ""}</strong>
                          <span>{item.status === "processing" ? "Création en cours" : item.status === "ready" ? "Prête" : item.status === "failed" ? "Échec" : "À vérifier"}</span>
                        </div>
                        {item.url ? <div className={selected && compare && comparisonSource ? "studio-comparison" : "studio-image-single"}>
                          {selected && compare && comparisonSource && <figure><img src={comparisonSource} alt="Source de comparaison" /><figcaption>Source</figcaption></figure>}
                          <figure><img src={item.url} alt={`Image ${number} créée dans cette discussion`} loading="lazy" onError={() => setError("L’aperçu a expiré. Réessaie pour le recharger, sans régénérer.")} /><figcaption>{item.proposal.summary}</figcaption></figure>
                        </div> : <p className="p-5 text-sm">{item.error_message || "Le résultat apparaîtra ici dès qu’il sera prêt."}</p>}
                        <div className="studio-image-card-actions">
                          {item.status === "ready" && <Button size="sm" variant={selected ? "default" : "outline"} onClick={() => { setSelectedId(item.id); setCompare(false); }}>{selected ? "Image sélectionnée" : "Reprendre cette image"}</Button>}
                          {item.status === "ready" && <Button size="sm" variant="outline" disabled={!writable || !!busy || generating || (references.length >= 8 && !references.some((ref) => ref.version_id === item.id))} onClick={() => void attachVersionAsReference(item.id)}>Joindre à ma demande</Button>}
                          {item.status === "ready" && item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="studio-image-open">Agrandir l’image</a>}
                          {item.library_photo_id && <span className="text-xs text-muted-foreground">Dans la bibliothèque</span>}
                        </div>
                      </article>;
                    })}
                  </div>}
                  {!!references.length && <details className="studio-source-details">
                    <summary>Images apportées dans la discussion · {references.length}</summary>
                    <div className="studio-versions" aria-label="Références de la discussion">
                      {references.map((ref) => <button type="button" key={ref.id} onClick={() => { setSelectedId(null); setSelectedReferenceId(ref.id); setAttachments([ref.id]); setCompare(false); }}>
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
      {existingTool === "mockup" && (
        <OfferMockupDialog
          open
          onOpenChange={(open) => {
            if (!open) setExistingTool(null);
          }}
          initialImage={version?.url || selectedReference?.url}
          onSaved={(photo) => {
            setExistingTool(null);
            void mutate("reference", {
              photo_id: photo.id,
              reference_role: "composition",
              revision: current?.session.revision,
            });
          }}
        />
      )}
      {preparation && (
        <PhotoPreparationDialog
          open
          onOpenChange={(open) => { if (!open) setPreparation(null); }}
          sources={[preparation.source]}
          initialRecipe={preparation.recipe}
          onSaved={(photo) => {
            setPreparation(null);
            void mutate("reference", {
              photo_id: photo.id,
              reference_role: preparation.role,
              revision: current?.session.revision,
            });
          }}
        />
      )}
      {existingTool === "before_after" && (
        <AvantApresDialog
          open
          onOpenChange={(open) => {
            if (!open) setExistingTool(null);
          }}
          initialImages={[
            references[0]?.url,
            version?.url || references[1]?.url,
          ]}
          onSaved={(photo) => {
            setExistingTool(null);
            void mutate("reference", {
              photo_id: photo.id,
              reference_role: "composition",
              revision: current?.session.revision,
            });
          }}
        />
      )}
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
      <Dialog open={sessionsOpen} onOpenChange={setSessionsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mes sessions Studio</DialogTitle>
            <DialogDescription>
              Les échanges et versions de{" "}
              {workspaceName}. Les images choisies restent dans ta bibliothèque.
            </DialogDescription>
          </DialogHeader>
          {sessions.isLoading
            ? <p>Chargement…</p>
            : sessions.error
            ? (
              <div role="alert">
                {sessions.error.message}
                <Button variant="ghost" onClick={() => void sessions.refetch()}>
                  Réessayer
                </Button>
              </div>
            )
            : sessions.data && (sessions.data.active.length || sessions.data.archived.length)
            ? (
              <div className="max-h-[55vh] overflow-y-auto space-y-2">
                {sessions.data.active.map((s) => (
                  <div key={s.id} className="flex gap-2">
                    <Button variant="outline" className="min-w-0 flex-1 justify-start overflow-hidden text-ellipsis"
                      onClick={() => { setSessionsOpen(false); navigate(studioPath(s.id)); }}>
                      {s.name}
                    </Button>
                    {roleWritable && (
                      <Button type="button" variant="ghost" disabled={!!sessionAction}
                        aria-label={`Archiver ${s.name}`}
                        onClick={() => void setSessionArchived(s.id, s.revision, true)}>
                        Archiver
                      </Button>
                    )}
                  </div>
                ))}
                {!!sessions.data.archived.length && (
                  <h3 className="pt-3 text-sm font-medium">Sessions archivées</h3>
                )}
                {sessions.data.archived.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    {roleWritable && (
                      <Button type="button" variant="outline" disabled={!!sessionAction}
                        aria-label={`Restaurer ${s.name}`}
                        onClick={() => void setSessionArchived(s.id, s.revision, false)}>
                        Restaurer
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )
            : <p>Pas encore de session dans cet espace.</p>}
          <Button
            onClick={() => {
              setSessionsOpen(false);
              navigate(studioPath());
            }}
          >
            Commencer une nouvelle session
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
