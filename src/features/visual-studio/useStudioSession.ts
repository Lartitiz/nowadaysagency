import { useCarouselStudioReturn } from "@/features/carousel-studio/useCarouselStudioReturn";
import { readableError } from "@/lib/error-messages";
import { recordCreationResume } from "@/lib/retour-apres-detour";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { UserPhotoRow } from "@/lib/photo-storage";
import { useUploadLibraryPhotos } from "@/hooks/use-user-photos";
import {
  draftKey,
  listStudioSessions,
  readDraft,
  type StudioComposition,
  type StudioCompositionEntry,
  type StudioReference,
  type StudioState,
  studioRequest,
  StudioRequestError,
  writeDraft,
} from "@/features/visual-studio/api";
import { toast } from "sonner";
import { readAttachedIds, referenceRoleForPhoto, writeAttachedIds } from "@/features/visual-studio/attachments";
import type { StudioExistingTool, StudioPreparation } from "@/features/visual-studio/StudioToolDialogs";

// État de la session du Studio et appels au serveur : lecture de la session,
// brouillon et photos jointes, envoi d'un message (création de session,
// `request_id` gardé si la réponse se perd), verrou contre le double envoi,
// références (bibliothèque, import, version jointe, scène prête), archivage.
// Fiche 4 de docs/robustesse/gros-fichiers.md, lot 6 : bloc déplacé à
// l'identique depuis le composant Studio de src/pages/VisualStudioPage.tsx
// (mêmes `useState`, `useRef`, `useEffect` dans le même ordre ; dépendances des
// effets non retouchées). La page l'appelle à l'endroit exact où le bloc était.
export function useStudioSession({
  role,
  userId,
  workspaceId,
  sessionId,
  photoId,
  carouselReturnId,
  navigate,
  cache,
  studioPath,
  contentPath,
}: {
  role: string;
  userId: string;
  workspaceId: string;
  sessionId: string | null;
  photoId: string | null;
  carouselReturnId: string | null;
  navigate: NavigateFunction;
  cache: QueryClient;
  studioPath: (id?: string) => string;
  contentPath: string;
}) {
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
          setError(readableError(e, "La session ne s’ouvre pas. Recharge la page pour réessayer."));
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
          readableError(e, "La demande n’a pas pu aboutir."),
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
      const message = readableError(cause, "Impossible d’ajouter ces photos.");
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
      toast.error(readableError(cause, "L’import n’a pas abouti. Réessaie avec une photo de moins de 5 Mo."));
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
          setError(readableError(e, "Ton message n’est pas parti. Réessaie l’envoi."));
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
          readableError(e, "L’image reste dans la session. Réessaie l’enregistrement."),
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
      toast.error(readableError(e, "Impossible de modifier cette session."));
      await sessions.refetch();
    } finally {
      setSessionAction(null);
    }
  }
  return {
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
  };
}
