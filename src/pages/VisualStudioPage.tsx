import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ImagePlus,
  Loader2,
  MessageCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDemoContext } from "@/contexts/DemoContext";
import {
  StudioRequestError,
  studioRequest,
  listStudioSessions,
  draftKey,
  readDraft,
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
  if (loading || switchingWorkspaceId)
    return (
      <>
        <AppHeader />
        <p className="p-8">Chargement de ton espace…</p>
      </>
    );
  if (!user || !activeWorkspace || !activeRole)
    return (
      <>
        <AppHeader />
        <p className="p-8">Sélectionne un espace pour ouvrir le Studio.</p>
      </>
    );
  if (isDemoMode)
    return (
      <>
        <AppHeader />
        <p className="p-8">
          Le Studio photo est disponible dans ton espace connecté. Aucune
          génération n’est lancée en démonstration.
        </p>
      </>
    );
  return (
    <Studio
      key={`${user.id}:${activeWorkspace.id}:${params.get("session") || params.get("photo") || "new"}`}
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
  const navigate = useNavigate(),
    cache = useQueryClient();
  const isMobile = useIsMobile();
  const writable = ["owner", "manager", "editor"].includes(role);
  const [picker, setPicker] = useState(false),
    [sessionsOpen, setSessionsOpen] = useState(false),
    [mobileChat, setMobileChat] = useState(false),
    [mobileConfirm, setMobileConfirm] = useState(false);
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
    sent = useRef<{ id: string; text: string; revision: number } | null>(null);
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
  const generating = current?.versions.some((v) => v.status === "processing");
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
    )
      setSelectedId(ready.at(-1) || null);
    seenReady.current = ready;
  }, [current]);
  useEffect(() => {
    for (const ref of [desktopMessages, mobileMessages]) {
      if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [current?.session.messages.length, mobileChat, mobileConfirm]);
  function editDraft(value: string) {
    draftRef.current = value;
    setDraft(value);
    writeDraft(localKey, value);
  }
  async function openPhoto(id: string) {
    if (actionLock.current || !writable) return;
    actionLock.current = true;
    setBusy("opening");
    setError("");
    if (creation.current.photoId !== id)
      creation.current = { id: crypto.randomUUID(), photoId: id };
    try {
      const result = await studioRequest({
        action: "create",
        workspace_id: workspaceId,
        session_id: creation.current.id,
        photo_id: id,
      });
      if (alive.current)
        navigate(`/photos/studio?session=${result.session.id}`, {
          replace: true,
        });
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Ouverture impossible.");
    } finally {
      actionLock.current = false;
      if (alive.current) setBusy("");
    }
  }
  useEffect(() => {
    if (photoId && !sessionId && !sourceInit.current) {
      sourceInit.current = true;
      void openPhoto(photoId);
    }
  }, [photoId, sessionId]); // A stable id makes a lost create response retryable.
  async function mutate(action: string, extra: Record<string, unknown> = {}) {
    if (!sessionId || actionLock.current || !writable) return null;
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
      if (e instanceof StudioRequestError && e.code === "refresh_request")
        sent.current = null;
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
    if (!draft.trim() || !current) return;
    // Keep the same request ID after an uncertain response, but not for a different message.
    if (
      !sent.current ||
      sent.current.text !== draft.trim() ||
      sent.current.revision !== current.session.revision
    )
      sent.current = {
        id: crypto.randomUUID(),
        text: draft.trim(),
        revision: current.session.revision,
      };
    const submittedText = sent.current.text;
    const result = await mutate("message", {
      message: sent.current.text,
      request_id: sent.current.id,
      revision: sent.current.revision,
      viewed_version_id: selectedId,
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
      if (useInContent && current.session.source_photo_id)
        navigate("/creer", {
          state: { libraryPhotoIds: [current.session.source_photo_id] },
        });
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
      if (useInContent)
        navigate("/creer", { state: { libraryPhotoIds: [receipt.photo_id] } });
      else {
        await state.refetch();
        toast.success("Image ajoutée à la bibliothèque.");
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "L’image reste dans la session. Réessaie l’enregistrement.",
        );
    } finally {
      actionLock.current = false;
      if (alive.current) setBusy("");
    }
  }
  const source = current?.session.source_url,
    display = version?.url || source;
  const label = version
    ? `Version ${current!.versions.filter((v) => v.status === "ready").findIndex((v) => v.id === version.id) + 1}`
    : "Original";
  const toTools = () =>
    navigate("/photos", {
      state: {
        studioPhotoId: current?.session.source_photo_id,
        studioWorkspaceId: workspaceId,
      },
    });
  function confirmation() {
    return proposal ? (
      <section
        className="studio-confirm space-y-4"
        aria-label="Demande à confirmer"
      >
        <p className="text-xs text-primary font-medium">À confirmer</p>
        <h2 className="font-display text-xl">Un nouveau fond</h2>
        <p>{proposal.summary}</p>
        <dl className="text-sm space-y-3">
          <div>
            <dt className="text-muted-foreground">Photo réellement utilisée</dt>
            <dd>L’original conservé dans cette session</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Outil</dt>
            <dd>Changer le décor · Photoroom</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Format</dt>
            <dd>Dimensions de la photo d’origine</dd>
          </div>
        </dl>
        <p className="rounded-lg bg-background p-3 text-sm">
          Le fond sera remplacé. La pose, la tenue et le sujet ne sont pas
          redessinés. Vérifie le détourage et les détails avant d’utiliser
          l’image.
        </p>
        {proposal.viewed_version_id && (
          <p className="text-xs text-muted-foreground">
            Tu regardais une version précédente en préparant cette demande. La
            génération repartira de l’original et pourra produire un autre
            décor.
          </p>
        )}
        <div className="flex justify-between gap-2">
          <strong>1 image</strong>
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
          disabled={
            !writable || !!busy || generating || !current?.quota.allowed
          }
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
          {busy === "generate" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Générer cette image · 1 image
        </Button>
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
    ) : (
      <div className="studio-confirm space-y-3">
        <h2 className="font-display text-xl">Un fond qui te ressemble</h2>
        <p className="text-sm">
          Décris ton idée. La conversation prépare ta demande ; seule ta
          confirmation lance la création.
        </p>
        <p className="text-xs text-muted-foreground">
          Dans cette première version : changement de fond et portrait avec le
          sujet conservé. Les autres outils photo restent dans la bibliothèque.
        </p>
      </div>
    );
  }
  function chat(mobile = false) {
    return (
      <div className="studio-chat-inner">
        {!mobile && (
          <div className="p-5 border-b">
            <h2 className="font-medium">
              {current?.session.name || "Ta demande"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Échanges conservés dans cette session
            </p>
          </div>
        )}
        {mobile && mobileConfirm ? (
          <div className="overflow-y-auto p-4">
            <Button variant="ghost" onClick={() => setMobileConfirm(false)}>
              ← Conversation
            </Button>
            {confirmation()}
          </div>
        ) : (
          <>
            <div
              ref={mobile ? mobileMessages : desktopMessages}
              className="studio-messages"
              aria-live="polite"
            >
              {current?.session.messages.map((m, i) => (
                <div
                  key={m.id || i}
                  className={
                    m.role === "user" ? "studio-message mine" : "studio-message"
                  }
                >
                  <span className="block text-xs font-semibold mb-1">
                    {m.role === "user" ? "Toi" : "Studio"}
                  </span>
                  <p>{m.text}</p>
                  {m.operation === "existing_tool" && (
                    <Button variant="link" className="px-0" onClick={toTools}>
                      Ouvrir les outils photo
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="p-4 border-t space-y-3">
              <div className="flex flex-wrap gap-2">
                {[
                  "Un fond uni crème",
                  "Un décor de bureau lumineux",
                  "Une table en bois, au jardin",
                ].map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant="outline"
                    disabled={!writable || !!busy || generating}
                    onClick={() => editDraft(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
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
                placeholder="Décris le fond que tu aimerais…"
              />
              <div className="flex justify-between items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Envoyer ne génère rien.
                </span>
                <Button
                  disabled={!writable || !!busy || generating || !draft.trim()}
                  onClick={() => void send()}
                >
                  {busy === "message" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSessionsOpen(true)}
            >
              Mes sessions
            </Button>
          </div>
        </header>
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
        {!current ? (
          <section className="mx-auto max-w-xl py-20 px-5 text-center space-y-5">
            {busy === "opening" || state.isFetching ? (
              <>
                <Loader2 className="mx-auto animate-spin" />
                <p>Ouverture de la session…</p>
              </>
            ) : (
              <>
                <Sparkles className="mx-auto h-9 w-9 text-primary" />
                <h2 className="font-display text-2xl">
                  Partons d’une photo à toi
                </h2>
                <p className="text-muted-foreground">
                  Choisis un portrait ou un objet pour créer un nouveau fond. Tu
                  verras la demande et le coût avant de lancer.
                </p>
                <Button onClick={() => setPicker(true)} disabled={!writable}>
                  <ImagePlus className="mr-2 h-4 w-4" />
                  Choisir une photo
                </Button>
                <p className="text-sm text-muted-foreground">
                  Gratuit et Premium, dans ton quota d’images. Mise en scène,
                  packshot et montages restent accessibles dans la bibliothèque.
                </p>
                <Button variant="link" onClick={toTools}>
                  Retrouver les autres outils photo
                </Button>
              </>
            )}
          </section>
        ) : (
          <div className="studio-grid">
            <section
              className="studio-chat desktop-chat"
              aria-label="Conversation"
            >
              {chat()}
            </section>
            <section className="studio-stage" aria-label="Visuels et versions">
              <div className="flex justify-between items-center gap-3 mb-5">
                <h2 className="font-display text-2xl">{label}</h2>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!version}
                  onClick={() => setCompare(!compare)}
                >
                  {compare ? "Voir la version seule" : "Comparer à l’original"}
                </Button>
              </div>
              <div
                className={
                  compare && version
                    ? "studio-comparison"
                    : "studio-image-single"
                }
              >
                {compare && version && (
                  <figure>
                    <img src={source} alt="Photo originale" />
                    <figcaption>Original</figcaption>
                  </figure>
                )}
                <figure>
                  <img
                    src={display}
                    alt={label}
                    onError={() =>
                      setError(
                        "L’aperçu a expiré ou n’est pas disponible. Réessaie pour le recharger, sans régénérer.",
                      )
                    }
                  />
                  <figcaption>{label}</figcaption>
                </figure>
              </div>
              <div className="studio-versions" aria-label="Versions">
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
                {current.versions
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
                        Version {i + 1}
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
                  : "Original conservé dans la session."}
              </p>
              {generating && (
                <div
                  role="status"
                  className="rounded-xl border bg-card p-4 my-4 text-sm"
                >
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Création en cours.
                  <p className="mt-2">
                    Tu peux quitter le Studio et retrouver le résultat dans «
                    Mes sessions ».
                  </p>
                </div>
              )}
              {current.versions
                .filter((v) => v.status === "failed")
                .slice(-1)
                .map((v) => (
                  <div
                    key={v.id}
                    className="rounded-xl border p-4 my-4 text-sm"
                  >
                    <p>{v.error_message}</p>
                    <Button
                      variant="link"
                      onClick={() => {
                        editDraft(v.proposal.summary);
                        setMobileChat(isMobile);
                        setMobileConfirm(false);
                      }}
                    >
                      Préparer un nouvel essai
                    </Button>
                  </div>
                ))}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={
                    !version ||
                    !!version.library_photo_id ||
                    !!busy ||
                    !writable
                  }
                  onClick={() => void save()}
                >
                  {version?.library_photo_id
                    ? "Dans la bibliothèque"
                    : "Ajouter à la bibliothèque"}
                </Button>
                <Button
                  disabled={
                    !!busy ||
                    !writable ||
                    (!version && !current.session.source_photo_id)
                  }
                  onClick={() => void save(true)}
                >
                  Créer un contenu
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Créer un contenu ajoute aussi la version à ta bibliothèque. Rien
                n’est publié.
              </p>
            </section>
            <aside
              className="studio-details"
              aria-label="Détails et confirmation"
            >
              {confirmation()}
              <div className="mt-6 text-sm space-y-2">
                <h3 className="font-medium">Image sélectionnée : {label}</h3>
                <p className="text-muted-foreground">
                  Chaque nouveau fond repart de l’original. Les précédentes
                  versions restent disponibles.
                </p>
                <Button variant="link" className="px-0" onClick={toTools}>
                  Les autres outils photo →
                </Button>
              </div>
            </aside>
          </div>
        )}
        {current && (
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
        )}
      </main>
      <Drawer open={mobileChat} onOpenChange={setMobileChat}>
        <DrawerContent className="studio-mobile-drawer">
          <DrawerHeader className="text-left">
            <DrawerTitle>
              {current?.session.name || "Studio visuel"}
            </DrawerTitle>
            <DrawerDescription>Conversation et confirmation</DrawerDescription>
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
      <PhotoLibraryPickerDialog
        open={picker}
        onOpenChange={setPicker}
        maxSelectable={1}
        onConfirm={(photos) => {
          setPicker(false);
          if (photos[0]) void openPhoto(photos[0].id);
        }}
      />
      <Dialog open={sessionsOpen} onOpenChange={setSessionsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mes sessions Studio</DialogTitle>
            <DialogDescription>
              Les échanges et versions de {workspaceName}. Les images choisies
              restent dans ta bibliothèque.
            </DialogDescription>
          </DialogHeader>
          {sessions.isLoading ? (
            <p>Chargement…</p>
          ) : sessions.error ? (
            <div role="alert">
              {sessions.error.message}
              <Button variant="ghost" onClick={() => void sessions.refetch()}>
                Réessayer
              </Button>
            </div>
          ) : sessions.data?.length ? (
            <div className="max-h-[55vh] overflow-y-auto space-y-2">
              {sessions.data.map((s) => (
                <Button
                  key={s.id}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    setSessionsOpen(false);
                    navigate(`/photos/studio?session=${s.id}`);
                  }}
                >
                  {s.name}
                </Button>
              ))}
            </div>
          ) : (
            <p>Pas encore de session dans cet espace.</p>
          )}
          <Button
            onClick={() => {
              setSessionsOpen(false);
              navigate("/photos/studio");
            }}
          >
            Commencer une nouvelle session
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
