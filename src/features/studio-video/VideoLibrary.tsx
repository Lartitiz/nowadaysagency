import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listVideoLibrary, videoTitle } from "./api";

export function VideoLibrary({ workspaceId }: { workspaceId: string }) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(0);
  useEffect(() => { const timer = window.setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => setPage(0), [term, sort, workspaceId]);
  const clips = useQuery({ queryKey: ["video-library", workspaceId, page, term, sort],
    queryFn: () => listVideoLibrary(workspaceId, page, term, sort), enabled: !!workspaceId,
    staleTime: 5 * 60_000, refetchOnWindowFocus: "always" });

  return <section aria-label="Mes vidéos" className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-display text-2xl">Mes vidéos</h2>
        <p className="text-sm text-muted-foreground">Les clips terminés de cet espace sont ajoutés automatiquement. Choisis « Utiliser dans un Reel » pour retrouver le clip dans le prochain montage.</p></div>
      <Button asChild variant="outline"><Link to="/photos/studio?tab=video">Ouvrir le Studio vidéo</Link></Button>
    </div>
    <div className="flex flex-wrap gap-3">
      <Input aria-label="Rechercher une vidéo" placeholder="Rechercher une idée ou un clip" value={search}
        onChange={event => setSearch(event.target.value)} className="min-w-52 max-w-sm flex-1" />
      <select aria-label="Trier les vidéos" className="h-10 rounded-md border bg-background px-3 text-sm" value={sort}
        onChange={event => setSort(event.target.value as "newest" | "oldest")}>
        <option value="newest">Plus récentes d’abord</option><option value="oldest">Plus anciennes d’abord</option>
      </select>
    </div>
    {clips.isLoading && <p role="status">Chargement des vidéos…</p>}
    {clips.isError && <div role="alert" className="rounded-lg border p-4">Impossible de charger les vidéos. <Button variant="outline" size="sm" onClick={() => void clips.refetch()}>Réessayer</Button></div>}
    {clips.data && clips.data.jobs.length === 0 && <p className="rounded-lg border p-6 text-sm text-muted-foreground">
      {term ? "Aucun clip ne correspond à cette recherche." : "Aucun clip terminé pour cet espace. Crée ton premier clip dans le Studio vidéo."}</p>}
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {clips.data?.jobs.map(job => <article key={job.id} className="min-w-0 overflow-hidden rounded-xl border bg-card">
        {job.video_url ? <video src={job.video_url} controls playsInline preload="metadata" className="aspect-video w-full bg-black object-contain"
          aria-label={`Lire ${videoTitle(job)}`} onError={() => void clips.refetch()} />
          : <div className="flex aspect-video items-center justify-center bg-muted text-sm">Aperçu indisponible</div>}
        <div className="space-y-2 p-4">
          <h3 className="line-clamp-2 font-medium" title={videoTitle(job)}>{videoTitle(job)}</h3>
          <p className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleDateString("fr-FR")} · {job.duration} s · {job.resolution} · {job.aspect_ratio || "format source"} · Prêt</p>
          <div className="flex flex-wrap gap-2">
            {job.video_url && <a className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent" href={job.video_url} download={`${videoTitle(job).slice(0, 60)}.mp4`}>Télécharger</a>}
            <Button asChild variant="outline" size="sm"><Link to={job.session_id
              ? `/photos/studio?tab=video&video_session=${job.session_id}`
              : `/photos/studio?tab=video&from_clip=${job.id}`}>
              {job.session_id ? "Ouvrir la session" : "Reprendre depuis ce clip"}
            </Link></Button>
            <Button asChild variant="ghost" size="sm"><Link to="/creer" onClick={() => {
              try { sessionStorage.setItem(`studio-video-for-reel:${workspaceId}`, job.id); } catch { /* Le clip reste sélectionnable dans le montage. */ }
            }}>Utiliser dans un Reel</Link></Button>
          </div>
          {!job.session_id && <p className="text-xs text-muted-foreground">Clip historique : aucune session associée. Sa reprise ouvre une nouvelle demande.</p>}
        </div>
      </article>)}
    </div>
    {!!clips.data?.total && <div className="flex items-center justify-between gap-3 text-sm">
      <span>{clips.data.total} clip{clips.data.total > 1 ? "s" : ""} · page {page + 1} sur {Math.max(1, Math.ceil(clips.data.total / 24))}</span>
      <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédente</Button>
        <Button variant="outline" size="sm" disabled={(page + 1) * 24 >= clips.data.total} onClick={() => setPage(page + 1)}>Suivante</Button></div>
    </div>}
  </section>;
}
