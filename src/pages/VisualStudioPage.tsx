import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ImagePlus,
  Loader2,
  MessageCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { StudioCompositionEditor } from "@/features/visual-studio/StudioCompositionEditor";
import { uploadPhotoOriginal } from "@/lib/photo-storage";
import { OfferMockupDialog } from "@/components/photos/OfferMockupDialog";
import { AvantApresDialog } from "@/components/photos/AvantApresDialog";
import { StudioMemoryPanel } from "@/features/visual-studio/StudioMemoryPanel";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PhotoLibraryPickerDialog } from "@/components/photos/PhotoLibraryPickerDialog";
import {
  StudioVideoPanel,
  type VideoSource,
} from "@/features/studio-video/StudioVideoPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDemoContext } from "@/contexts/DemoContext";
import {
  draftKey,
  listStudioSessions,
  readDraft,
  type StudioComposition,
  type StudioReference,
  studioRequest,
  StudioRequestError,
  writeDraft,
} from "@/features/visual-studio/api";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import "@/features/visual-studio/studio.css";

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
  const writable = ["owner", "manager", "editor"].includes(role);
  const [compositionOpen, setCompositionOpen] = useState(false);
  const [compositionDraft, setCompositionDraft] = useState<
    StudioComposition | undefined
  >();
  const [existingTool, setExistingTool] = useState<
    "mockup" | "before_after" | null
  >(null);
  const [picker, setPicker] = useState(false),
    [sessionsOpen, setSessionsOpen] = useState(false),
    [mobileChat, setMobileChat] = useState(!!location.state?.studioChatOpen),
    [mobileConfirm, setMobileConfirm] = useState(false);
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(
    null,
  );
  const referenceRole: StudioReference["role"] = "subject";
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [compare, setCompare] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const localKey = draftKey(userId, workspaceId, sessionId || "new");
  const [draft, setDraft] = useState(() => readDraft(localKey));
  const draftRef = useRef(draft);
  const desktopMessages = useRef<HTMLDivElement>(null);
  const mobileMessages = useRef<HTMLDivElement>(null);
  const alive = useRef(true),
    actionLock = useRef(false),
    creation = useRef({ id: crypto.randomUUID(), photoId: "" }),
    sent = useRef<
      {
        id: string;
        text: string;
        revision: number;
        target?: string;
      } | null
    >(null);
  const sourceInit = useRef(false),
    seenReady = useRef<string[] | null>(null);
  const openedMobile = useRef(false);
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
  const references = current?.session.references || [];
  const selectedReference =
    references.find((r) => r.id === selectedReferenceId) || references[0];
  const premiumBlocked = !!proposal &&
    proposal.operation !== "background" &&
    current?.generative_allowed === false;
  const generating = current?.versions.some((v) => v.status === "processing");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (isMobile && current && !openedMobile.current) {
      openedMobile.current = true;
      if (
        !current.versions.some(
          (v) => v.status === "ready" || v.status === "processing",
        )
      ) {
        setMobileChat(true);
      }
    }
  }, [isMobile, current]);
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
    for (const ref of [desktopMessages, mobileMessages]) {
      if (ref.current) {
        const messages = ref.current.querySelectorAll(".studio-message");
        const last = messages.item(messages.length - 1);
        if (last) {
          ref.current.scrollTop += last.getBoundingClientRect().top -
            ref.current.getBoundingClientRect().top -
            12;
        }
      }
    }
  }, [current?.session.messages.length, mobileChat, mobileConfirm]);
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
      if (alive.current) cache.setQueryData(queryKey, result);
      return result;
    } catch (e) {
      if (e instanceof StudioRequestError && e.code === "refresh_request") {
        sent.current = null;
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
  async function send() {
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
        navigate(studioPath(id), {
          replace: true,
          state: { studioChatOpen: isMobile },
        });
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
    // Keep the same request ID after an uncertain response, but not for a different message.
    if (
      !sent.current ||
      sent.current.text !== draft.trim() ||
      sent.current.revision !== current.session.revision ||
      sent.current.target !== (selectedId || selectedReference?.id || "")
    ) {
      sent.current = {
        id: crypto.randomUUID(),
        text: draft.trim(),
        revision: current.session.revision,
        target: selectedId || selectedReference?.id || "",
      };
    }
    const submittedText = sent.current.text;
    const result = await mutate("message", {
      message: sent.current.text,
      request_id: sent.current.id,
      revision: sent.current.revision,
      viewed_version_id: selectedId,
      viewed_reference_id: selectedReference?.id || null,
    });
    if (result && alive.current) {
      if (draftRef.current.trim() === submittedText) editDraft("");
      sent.current = null;
      setMobileConfirm(false);
    }
  }
  async function save(useInContent = false) {
    if (!current || actionLock.current || !writable) return;
    if (!version) {
      if (useInContent && current.session.source_photo_id) {
        navigate("/creer", {
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
        navigate("/creer", { state: { libraryPhotoIds: [receipt.photo_id] } });
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
  const videoSource: VideoSource | null = version?.status === "ready"
    ? { kind: "studio_version", id: version.id, name: label }
    : selectedReference?.photo_id
    ? {
      kind: "photo",
      id: selectedReference.photo_id,
      name: selectedReference.name,
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
          <p>{proposal.summary}</p>
          {!!proposal.shots?.length && (
            <div className="text-sm space-y-2">
              <h3 className="font-medium">Prises supplémentaires</h3>
              <ol className="list-decimal pl-5">
                {proposal.shots.map((shot) => (
                  <li key={shot.id}>{shot.summary}</li>
                ))}
              </ol>
              <Button
                variant="outline"
                disabled={!!busy || !writable}
                onClick={() =>
                  void mutate("pilot", {
                    proposal_id: proposal.id,
                    revision: current!.session.revision,
                  })}
              >
                Préparer seulement la première image · 1 image
              </Button>
            </div>
          )}
          {proposal.provider === "higgsfield" && (
            <p className="text-xs text-muted-foreground">
              Les références choisies seront transmises à Higgsfield après
              confirmation.
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
              if (result && alive.current) {
                setMobileChat(false);
                setMobileConfirm(false);
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
          {!!proposal.shots?.length && <Button variant="outline" className="w-full" disabled={!writable || !!busy || !!generating} onClick={() => void mutate("pilot", { revision: current!.session.revision })}>D’abord une image pilote · 1 image</Button>}
          <p className="text-xs text-muted-foreground">
            Une image réussie compte même si tu ne la gardes pas. Un échec
            technique n’est pas décompté.
          </p>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              editDraft(proposal.summary);
              setMobileConfirm(false);
              setMobileChat(isMobile);
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
              Échanges conservés dans cette session
            </p>
          </div>
        )}
        {mobile && mobileConfirm
          ? (
            <div className="overflow-y-auto p-4">
              <Button variant="ghost" onClick={() => setMobileConfirm(false)}>
                ← Conversation
              </Button>
              {confirmation()}
            </div>
          )
          : (
            <>
              <div
                ref={mobile ? mobileMessages : desktopMessages}
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
                {current?.session.messages.map((m, i) => (
                  <div
                    key={m.id || i}
                    className={m.role === "user"
                      ? "studio-message mine"
                      : "studio-message"}
                  >
                    <span className="block text-xs font-semibold mb-1">
                      {m.role === "user" ? "Toi" : "Studio"}
                    </span>
                    <p>{m.text}</p>
                    {m.operation === "compose" && (
                      <Button
                        variant="link"
                        disabled={!writable}
                        onClick={() => {
                          setCompositionDraft(m.composition ? { ...m.composition, logo_data_url: current?.session.composition?.design.logo_data_url || null } : undefined);
                          setCompositionOpen(true);
                        }}
                      >
                        Vérifier les textes et composer
                      </Button>
                    )}
                    {m.operation === "existing_tool" && (
                      <Button
                        variant="link"
                        className="px-0"
                        onClick={() => setExistingTool(m.existing_tool || "mockup")}
                      >
                        {m.existing_tool === "before_after" ? "Créer l’avant/après" : "Créer le mockup"}
                      </Button>
                    )}
                  </div>
                ))}
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
              </div>
              <div className="p-4 border-t space-y-3">
                <label
                  className="sr-only"
                  htmlFor={mobile ? "studio-draft-mobile" : "studio-draft"}
                >
                  Ta demande
                </label>
                <Textarea
                  className="min-h-[88px] max-h-36 overflow-y-auto"
                  id={mobile ? "studio-draft-mobile" : "studio-draft"}
                  value={draft}
                  maxLength={1000}
                  onChange={(e) => editDraft(e.target.value)}
                  disabled={!writable}
                  placeholder="Une idée, une question, une image à améliorer…"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!writable || !!busy || generating}
                  onClick={() => setPicker(true)}
                >
                  <ImagePlus className="h-4 w-4 mr-2" />
                  Choisir une référence
                </Button>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Envoyer ne génère rien.
                  </span>
                  <Button
                    disabled={!writable || !!busy || generating ||
                      !draft.trim()}
                    onClick={() => void send()}
                  >
                    {busy === "message"
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : null}
                    Envoyer
                  </Button>
                </div>
                {mobile && proposal && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setMobileConfirm(true)}
                  >
                    Vérifier la proposition
                  </Button>
                )}
              </div>
            </>
          )}
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
              writable={writable}
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setError("");
                  if (photoId && !sessionId) void openPhoto(photoId);
                  else void state.refetch();
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Réessayer
              </Button>
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
              <div className="studio-grid">
                <section
                  className="studio-chat desktop-chat"
                  aria-label="Conversation"
                >
                  {chat()}
                </section>
                <section
                  className="studio-stage"
                  aria-label="Visuels et versions"
                >
                  <div className="flex justify-between items-center gap-3 mb-5">
                    <h2 className="font-display text-2xl">{label}</h2>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!version || !comparisonSource}
                      onClick={() => setCompare(!compare)}
                    >
                      {compare ? "Voir la version seule" : "Comparer"}
                    </Button>
                  </div>
                  <div
                    className={compare && version
                      ? "studio-comparison"
                      : "studio-image-single"}
                  >
                    {compare && version && (
                      <figure>
                        <img
                          src={comparisonSource}
                          alt="Référence de comparaison"
                        />
                        <figcaption>
                          {source ? "Référence" : "Version précédente"}
                        </figcaption>
                      </figure>
                    )}
                    {display
                      ? (
                        <figure>
                          <img
                            src={display}
                            alt={label}
                            onError={() =>
                              setError(
                                "L’aperçu a expiré ou n’est pas disponible. Réessaie pour le recharger, sans régénérer.",
                              )}
                          />
                          <figcaption>{label}</figcaption>
                        </figure>
                      )
                      : (
                        <div className="studio-empty">
                          <Sparkles className="h-9 w-9 text-primary" />
                          <h3 className="font-display text-2xl">
                            Tout commence par ton idée
                          </h3>
                          <p>
                            Une illustration, ton produit en situation, un
                            portrait, un visuel pour une offre… Discute avec le
                            Studio ; tes créations apparaîtront ici.
                          </p>
                          <Button
                            variant="outline"
                            disabled={!writable || !!busy}
                            onClick={() => setPicker(true)}
                          >
                            <ImagePlus className="h-4 w-4 mr-2" />
                            Ajouter une photo, si utile
                          </Button>
                          <p className="text-xs">
                            Aucune image n’est créée avant ta confirmation.
                          </p>
                        </div>
                      )}
                  </div>
                  <div className="studio-versions" aria-label="Versions">
                    {!!source && !references.length && (
                      <button
                        type="button"
                        aria-pressed={!selectedId}
                        onClick={() => {
                          setSelectedId(null);
                          setCompare(false);
                        }}
                      >
                        <img src={source} alt="" />
                        <span>Original</span>
                      </button>
                    )}
                    {references.map((ref) => (
                      <button
                        type="button"
                        key={ref.id}
                        aria-pressed={!selectedId &&
                          selectedReference?.id === ref.id}
                        onClick={() => {
                          setSelectedId(null);
                          setSelectedReferenceId(ref.id);
                          setCompare(false);
                        }}
                      >
                        <img src={ref.url} alt="" />
                        <span>{ref.name}</span>
                      </button>
                    ))}
                    {current?.versions
                      .filter((v) => v.status === "ready")
                      .map((v, i) => (
                        <button
                          key={v.id}
                          type="button"
                          aria-pressed={v.id === selectedId}
                          onClick={() => {
                            setSelectedId(v.id);
                            setCompare(false);
                          }}
                        >
                          <img src={v.url!} alt="" />
                          <span>
                            Version {i + 1}{v.proposal.series_size ? ` · série ${(v.proposal.series_index || 0) + 1}/${v.proposal.series_size}` : ""}
                            {v.library_photo_id ? " ✓" : ""}
                          </span>
                        </button>
                      ))}
                  </div>
                  <p className="text-xs text-muted-foreground my-3">
                    {version
                      ? version.library_photo_id
                        ? "Ajoutée à la bibliothèque · conservée dans cette session."
                        : "Conservée dans cette session · pas encore dans la bibliothèque."
                      : source
                      ? "Référence conservée dans la session."
                      : "Tes échanges et créations restent dans cette session."}
                  </p>
                  {version?.status === "ready" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mb-3"
                      onClick={() => chooseTab("video")}
                    >
                      Animer cette image en vidéo
                    </Button>
                  )}
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
                            setMobileChat(isMobile);
                            setMobileConfirm(false);
                          }}
                        >
                          Réessayer cette image seulement
                        </Button>
                      </div>
                    ))}
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
                      <Button
                        variant="outline"
                        disabled={!writable || !!busy}
                        onClick={() => {
                          setCompositionDraft(undefined);
                          setCompositionOpen(true);
                        }}
                      >
                        Composer une affiche ou un visuel
                      </Button>
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
                  <div className="studio-references">
                    {references.map((ref) => (
                      <div
                        key={ref.id}
                        className="rounded-xl border bg-card p-3 my-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
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
                  <div className="flex flex-wrap gap-2">
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
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Créer un contenu ajoute aussi la version à ta bibliothèque.
                    Rien n’est publié.
                  </p>
                </section>
                <aside
                  className="studio-details"
                  aria-label="Détails et confirmation"
                >
                  {confirmation()}
                  <div className="mt-6 text-sm space-y-2">
                    <h3 className="font-medium">
                      Image sélectionnée : {label}
                    </h3>
                    <p className="text-muted-foreground">
                      Les ajustements visent l’image sélectionnée. Chaque
                      résultat devient une version ; les précédentes restent
                      disponibles.
                    </p>
                    <Button
                      variant="link"
                      className="px-0"
                      onClick={() => setExistingTool("mockup")}
                    >
                      Les autres outils photo →
                    </Button>
                  </div>
                </aside>
              </div>
            )}
          {
            <div className="studio-mobile-launch">
              <Button
                className="w-full justify-between"
                onClick={() => setMobileChat(true)}
              >
                <span>
                  <MessageCircle className="h-4 w-4 inline mr-2" />
                  Toute la conversation
                </span>
                <span>{proposal ? "1 proposition" : "Ouvrir"}</span>
              </Button>
            </div>
          }
        </div>
      </main>
      {mobileChat && !videoTab && (
        <Drawer open onOpenChange={setMobileChat}>
          <DrawerContent className="studio-mobile-drawer">
            <DrawerHeader className="text-left">
              <DrawerTitle>
                {current?.session.name || "Studio visuel"}
              </DrawerTitle>
              <DrawerDescription>
                Conversation et confirmation
              </DrawerDescription>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileChat(false)}
              >
                Fermer la conversation
              </Button>
            </DrawerHeader>
            {chat(true)}
          </DrawerContent>
        </Drawer>
      )}
      {current && (
        <StudioCompositionEditor
          key={sessionId}
          open={compositionOpen}
          onOpenChange={setCompositionOpen}
          initial={compositionDraft || current.session.composition?.design}
          backgroundUrl={!compositionDraft && current.session.composition
            ? current.session.composition.background_url
            : version?.url || selectedReference?.url}
          disabled={!writable || !!busy}
          onSave={(design, useImage) =>
            mutate("composition_save", {
              composition: design,
              composition_use_image: useImage,
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
              navigate("/creer", {
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
        maxSelectable={1}
        onConfirm={(photos) => {
          setPicker(false);
          if (photos[0]) {
            if (current) {
              void mutate("reference", {
                photo_id: photos[0].id,
                reference_role: referenceRole,
                revision: current.session.revision,
              });
            } else void openPhoto(photos[0].id);
          }
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
            : sessions.data?.length
            ? (
              <div className="max-h-[55vh] overflow-y-auto space-y-2">
                {sessions.data.map((s) => (
                  <Button
                    key={s.id}
                    variant="outline"
                    className="w-full justify-start overflow-hidden text-ellipsis"
                    onClick={() => {
                      setSessionsOpen(false);
                      navigate(studioPath(s.id));
                    }}
                  >
                    {s.name}
                  </Button>
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
