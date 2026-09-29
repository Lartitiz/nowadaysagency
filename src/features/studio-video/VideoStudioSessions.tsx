import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StudioVideoPanel, type VideoSource } from "./StudioVideoPanel";
import { archiveVideoSession, createVideoSession, getVideoSession, listVideoSessions,
  listLegacyVideoJobs, readStudioVideo, videoRequest, videoTitle, type StudioVideoJob } from "./api";
import { readVideoDraft } from "./sources";

interface Props {
  workspaceId: string; userId: string; writable: boolean;
  initialSource?: VideoSource | null; legacyDraftKey?: string;
  onPickClip?: (job: StudioVideoJob) => void;
}

export function VideoStudioSessions({ workspaceId, userId, writable, initialSource, legacyDraftKey, onPickClip }: Props) {
  const [params, setParams] = useSearchParams();
  const sessionId = params.get("video_session");
  const fromClip = params.get("from_clip");
  const rememberedSessionKey = `studio-video:last-session:${userId}:${workspaceId}`;
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [legacyPage, setLegacyPage] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [starterSessionId, setStarterSessionId] = useState<string | null>(null);
  const [importDraftId, setImportDraftId] = useState<string | null>(null);
  const [localDraft] = useState(() => readVideoDraft(legacyDraftKey));
  const automatic = useRef(false);
  const cache = useQueryClient();
  const sessions = useQuery({ queryKey: ["video-sessions", workspaceId, page],
    queryFn: () => listVideoSessions(workspaceId, page) });
  const current = useQuery({ queryKey: ["studio-videos", workspaceId, sessionId || "all", "studio", 0],
    queryFn: () => getVideoSession(workspaceId, sessionId!), enabled: !!sessionId });
  const oldClip = useQuery({ queryKey: ["studio-video-source", workspaceId, fromClip],
    queryFn: () => readStudioVideo(workspaceId, fromClip!), enabled: !!fromClip, retry: 1 });
  const legacy = useQuery({ queryKey: ["studio-video-legacy", workspaceId, legacyPage],
    queryFn: () => listLegacyVideoJobs(workspaceId, legacyPage), enabled: !sessionId || open,
    refetchInterval: query => query.state.data?.jobs.some(job => ["submitting_uncertain", "queued", "in_progress", "archiving"].includes(job.status)) ? 5000 : false });

  useEffect(() => {
    if (!current.data?.session.id) return;
    try { localStorage.setItem(rememberedSessionKey, current.data.session.id); } catch { /* La session reste dans l’URL. */ }
  }, [current.data?.session.id, rememberedSessionKey]);
  useEffect(() => {
    if (!sessionId || !current.isError || !current.error?.message.includes("Session indisponible dans cet espace")) return;
    let remembered: string | null = null;
    try { remembered = localStorage.getItem(rememberedSessionKey); } catch { /* Ouvrir la liste. */ }
    const next = new URLSearchParams(params);
    if (remembered && remembered !== sessionId) next.set("video_session", remembered);
    else {
      next.delete("video_session");
      try { localStorage.removeItem(rememberedSessionKey); } catch { /* La liste reste accessible. */ }
    }
    next.delete("from_clip");
    setParams(next, { replace: true });
  }, [sessionId, current.isError, current.error, params, setParams, rememberedSessionKey]);
  useEffect(() => {
    if (sessionId || fromClip || initialSource) return;
    let remembered: string | null = null;
    try { remembered = localStorage.getItem(rememberedSessionKey); } catch { /* La liste reste accessible. */ }
    if (!remembered) return;
    const next = new URLSearchParams(params);
    next.set("video_session", remembered);
    setParams(next, { replace: true });
  }, [sessionId, fromClip, initialSource, rememberedSessionKey, params, setParams]);

  async function create(initialTitle?: string, fromPhoto = false, importDraft = false) {
    if (!writable || busy) return;
    setBusy(true); setError("");
    const id = crypto.randomUUID();
    try {
      await createVideoSession(workspaceId, id, initialTitle);
      if (fromPhoto) setStarterSessionId(id);
      if (importDraft) setImportDraftId(id);
      const next = new URLSearchParams(params);
      next.set("tab", "video"); next.set("video_session", id);
      setParams(next);
      void cache.invalidateQueries({ queryKey: ["video-sessions", workspaceId] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible de créer la session."); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (automatic.current || sessionId || !writable || busy) return;
    if (fromClip && oldClip.data?.job.status === "ready") {
      automatic.current = true;
      void create(oldClip.data.job.preparation?.idea?.slice(0, 120) || "Nouvelle version d’un clip");
    } else if (!fromClip && initialSource) {
      automatic.current = true;
      void create(`Vidéo depuis ${initialSource.name}`.slice(0, 120), true, !!localDraft);
    }
  // The deliberate starting source is handled once per mounted workspace.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, fromClip, oldClip.data?.job.id, initialSource?.id, writable]);

  async function changeArchive(archive: boolean) {
    if (!sessionId || !writable || busy) return;
    setBusy(true); setError("");
    try {
      await archiveVideoSession(workspaceId, sessionId, archive);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["studio-videos", workspaceId, sessionId] }),
        cache.invalidateQueries({ queryKey: ["video-sessions", workspaceId] }),
      ]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible de modifier la session."); }
    finally { setBusy(false); }
  }

  async function submitLegacy(job: StudioVideoJob) {
    if (!writable || busy || !job.can_submit || Date.parse(job.quote_expires_at) <= Date.now()) return;
    setBusy(true); setError("");
    try {
      const result = await videoRequest<{ job: StudioVideoJob; error?: string }>({
        action: "submit", workspace_id: workspaceId, job_id: job.id });
      if (result.error) setError(result.error);
      await cache.invalidateQueries({ queryKey: ["studio-video-legacy", workspaceId] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible de lancer ce devis."); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-7xl space-y-4 px-4 pb-10">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-display text-xl">{current.data?.session.title || "Studio vidéo"}</h2>
        <p className="text-xs text-muted-foreground">Les demandes, les propositions et les versions de chaque session restent dans cet espace.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(value => !value)}>Mes sessions vidéo</Button>
        {writable && <Button size="sm" disabled={busy} onClick={() => void create()}>Nouvelle session</Button>}
        {writable && sessionId && current.data && <Button size="sm" variant="ghost" disabled={busy}
          onClick={() => void changeArchive(!current.data!.session.archived_at)}>
          {current.data.session.archived_at ? "Restaurer" : "Archiver"}</Button>}
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {oldClip.isError && <p role="alert">Ce clip n’est plus accessible dans cet espace.</p>}
    {!sessionId && localDraft && writable && !fromClip && !initialSource && <Button variant="outline" disabled={busy}
      onClick={() => void create(localDraft.prompt.trim().slice(0, 120) || "Brouillon vidéo", false, true)}>
      Reprendre mon brouillon vidéo de cet appareil
    </Button>}
    {open && <div className="rounded-xl border p-4 space-y-3" aria-label="Mes sessions vidéo">
      <h3 className="font-medium">Mes sessions vidéo</h3>
      {sessions.isLoading && <p>Chargement des sessions…</p>}
      {sessions.isError && <p role="alert">Impossible de charger les sessions. <Button variant="outline" size="sm" onClick={() => void sessions.refetch()}>Réessayer</Button></p>}
      {sessions.data?.sessions.length === 0 && <p className="text-sm text-muted-foreground">Aucune session vidéo pour cet espace.</p>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{sessions.data?.sessions.map(item =>
        <Button key={item.id} type="button" variant={sessionId === item.id ? "default" : "outline"} className="h-auto min-w-0 justify-start text-left"
          onClick={() => { const next = new URLSearchParams(params); next.set("video_session", item.id); next.delete("from_clip"); setParams(next); setOpen(false); }}>
          <span className="min-w-0 truncate">{item.title}<span className="block text-xs opacity-70">{new Date(item.updated_at).toLocaleDateString("fr-FR")}{item.archived_at ? " · archivée" : ""}</span></span>
        </Button>)}</div>
      {!!sessions.data?.total && <div className="flex gap-2 items-center text-xs">{sessions.data.total} session(s)
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédentes</Button>
        <Button variant="outline" size="sm" disabled={(page + 1) * 40 >= sessions.data.total} onClick={() => setPage(page + 1)}>Suivantes</Button></div>}
    </div>}
    {(!sessionId || open) && <section className="rounded-xl border p-4 space-y-3" aria-label="Ancien suivi vidéo">
      <h3 className="font-medium">Anciens devis et essais</h3>
      {legacy.isLoading && <p className="text-sm">Chargement du suivi…</p>}
      {legacy.isError && <p role="alert">Impossible de charger le suivi. <Button variant="outline" size="sm" onClick={() => void legacy.refetch()}>Réessayer</Button></p>}
      {legacy.data?.jobs.length === 0 && <p className="text-sm text-muted-foreground">Aucun devis ou essai ancien en attente. Les clips terminés sont dans Ma bibliothèque.</p>}
      {legacy.data?.jobs.map(job => <article key={job.id} className="rounded-lg border p-3 space-y-2 text-sm">
        <p className="font-medium">{videoTitle(job)} · {job.duration} s · {job.resolution}</p>
        <p className="text-muted-foreground">{new Date(job.created_at).toLocaleString("fr-FR")} · {job.status === "quoted" ? "Devis non lancé" : job.status === "failed" ? "Échec" : job.status === "canceled" ? "Annulé" : "Suivi : " + job.status}</p>
        {job.status === "quoted" && <p>Devis : {Number(job.estimated_usd).toFixed(2)} $ · {Date.parse(job.quote_expires_at) <= Date.now() ? "expiré" : "valide jusqu’au " + new Date(job.quote_expires_at).toLocaleString("fr-FR")}</p>}
        {job.status === "quoted" && writable && legacy.data?.enabled && job.can_submit && Date.parse(job.quote_expires_at) > Date.now() &&
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void submitLegacy(job)}>Générer ce clip avec ce devis · {Number(job.estimated_usd).toFixed(2)} $</Button>}
        {job.status === "quoted" && Date.parse(job.quote_expires_at) <= Date.now() && <p>Reprends l’idée dans une nouvelle session pour demander un prix actualisé.</p>}
        {job.status !== "quoted" && <Button size="sm" variant="outline" onClick={() => void readStudioVideo(workspaceId, job.id)
          .then(() => legacy.refetch()).catch(() => setError("Le suivi de ce clip a échoué."))}>Vérifier le résultat</Button>}
      </article>)}
      {!!legacy.data?.total && legacy.data.total > 24 && <div className="flex gap-2 items-center text-xs">
        <Button variant="outline" size="sm" disabled={legacyPage === 0} onClick={() => setLegacyPage(legacyPage - 1)}>Précédents</Button>
        Page {legacyPage + 1} sur {Math.ceil(legacy.data.total / 24)}
        <Button variant="outline" size="sm" disabled={(legacyPage + 1) * 24 >= legacy.data.total} onClick={() => setLegacyPage(legacyPage + 1)}>Suivants</Button>
      </div>}
    </section>}
    {sessionId && current.isLoading && <p role="status">Chargement de la session…</p>}
    {sessionId && current.isError && <p role="alert">Impossible d’ouvrir cette session. <Button variant="outline" onClick={() => void current.refetch()}>Réessayer</Button></p>}
    {current.data?.session.archived_at && <p role="status" className="rounded-lg border p-3 text-sm">Session archivée. Ses clips restent dans Ma bibliothèque ; restaure-la pour ajouter une demande.</p>}
    {sessionId && current.data && (!fromClip || oldClip.data || oldClip.isError) && <StudioVideoPanel workspaceId={workspaceId} writable={writable && !current.data.session.archived_at}
      sessionId={sessionId} sessionDraft={current.data.session.draft} sessionTitle={current.data.session.title}
      initialDraft={importDraftId === sessionId ? localDraft : null}
      legacyDraftKey={importDraftId === sessionId ? legacyDraftKey : undefined}
      draftKey={`studio-video:${userId}:${workspaceId}:${sessionId}`} studioLayout
      initialSource={starterSessionId === sessionId ? initialSource : null}
      initialJob={oldClip.data?.job || undefined} onPickClip={onPickClip} />}
    {!sessionId && !fromClip && !initialSource && <p className="rounded-xl border p-6 text-sm text-muted-foreground">
      Ouvre une session ou commence une nouvelle idée. Les clips historiques restent dans <a className="underline" href="/photos?tab=videos">Ma bibliothèque</a>.
    </p>}
  </div>;
}
