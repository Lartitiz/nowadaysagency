// Une carte de passage de l'écran de montage d'un reel : durée, texte, banque
// libre (mode « cache »), « Ma vidéo » et bibliothèque, plans du Studio
// (prévisualisation, insertion, curseur, retrait), fenêtre de lecture. Sortie de
// ReelMontage.tsx à l'identique (fiche 16 de docs/robustesse/gros-fichiers.md,
// lot 5). L'id `studio-reel-passage-<i>` reste sur la carte (défilement au
// retour du Studio).
import type { Dispatch, SetStateAction } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { sectionDuration, voiceSectionDuration } from "@/lib/reel-render";
import type { StockVideo } from "@/lib/stock-videos";
import type { UserReelVideo } from "@/lib/reel-user-videos";
import type { VoiceClip } from "@/lib/reel-voice";
import type { StudioVideoJob } from "@/features/studio-video/api";
import { fromStock, set, type MontageMode, type Section, type SelectedClip, type StudioCutaway } from "./types";

interface MontagePassageCardProps {
  s: Section;
  i: number;
  total?: number;
  montageMode: MontageMode;
  clips: (SelectedClip | null)[];
  setClips: Dispatch<SetStateAction<(SelectedClip | null)[]>>;
  cutaways: (StudioCutaway | null)[];
  setCutaways: Dispatch<SetStateAction<(StudioCutaway | null)[]>>;
  voiceClips: (VoiceClip | null)[];
  keywords: string[];
  setKeywords: Dispatch<SetStateAction<string[]>>;
  results: StockVideo[][];
  loading: boolean[];
  runSearch: (i: number, kw: string) => Promise<void>;
  uploadingSection: number | null;
  openFilePicker: (i: number) => void;
  myVideos: UserReelVideo[];
  pickFromLibrary: (i: number, url: string) => Promise<void>;
  workspaceId?: string;
  pendingCutaway: { index: number; job: StudioVideoJob } | null;
  setPendingCutaway: (pending: { index: number; job: StudioVideoJob } | null) => void;
  setStudioTarget: (target: { index: number; create: boolean } | null) => void;
  highlightedPassage: number | null;
}

export function MontagePassageCard({ s, i, total = 1, montageMode, clips, setClips, cutaways, setCutaways, voiceClips, keywords, setKeywords, results, loading, runSearch, uploadingSection, openFilePicker, myVideos, pickFromLibrary, workspaceId, pendingCutaway, setPendingCutaway, setStudioTarget, highlightedPassage }: MontagePassageCardProps) {
  return (
  <Card key={i} id={`studio-reel-passage-${i}`} className={i === highlightedPassage ? "border-primary ring-2 ring-primary/20" : "border-border"}>
    <CardContent className="p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {total > 1 && <span className="text-xs font-semibold">Passage {i + 1} sur {total}</span>}
        <span className="text-2xs text-muted-foreground">
          {montageMode === "filme"
            ? clips[i]?.duration != null
              ? `${Math.round(clips[i]!.duration as number)} s (ta prise)`
              : "durée : celle de ta prise, une fois choisie"
            : `environ ${sectionDuration(s)} s`}
        </span>
      </div>
      {s.texte_parle && (
        <p className="text-xs text-foreground leading-snug line-clamp-3">{s.texte_parle}</p>
      )}

      {montageMode === "cache" && (
        <>
          <div className="flex gap-1.5">
            <Input
              value={keywords[i] ?? ""}
              onChange={(e) => setKeywords((K) => set(K, i, e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && runSearch(i, keywords[i] ?? "")}
              placeholder="ce qu'on voit (ex. : mains savon atelier)"
              aria-label="Ce qu'on voit sur ce passage"
              className="h-8 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
              onClick={() => runSearch(i, keywords[i] ?? "")}
              disabled={loading[i]}
              aria-label="Chercher des clips"
            >
              {loading[i] ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          {results[i]?.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {results[i].map((v) => {
                const selected = clips[i]?.id === `stock-${v.id}`;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setClips((C) => set(C, i, fromStock(v)))}
                    className={`relative shrink-0 rounded-md overflow-hidden border-2 ${
                      selected ? "border-primary" : "border-transparent"
                    }`}
                    aria-label={selected ? "Clip sélectionné" : "Choisir ce clip"}
                  >
                    <img src={v.thumbnail} alt="" className="h-24 w-[54px] object-cover" loading="lazy" />
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-2xs"
          onClick={() => openFilePicker(i)}
          disabled={uploadingSection !== null}
        >
          {uploadingSection === i ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5 mr-1" />
          )}
          Mettre ma vidéo
        </Button>
        {myVideos.length > 0 && (
          <select
            className="h-7 rounded-md border border-input bg-background px-2 text-2xs text-muted-foreground max-w-[190px]"
            value={clips[i]?.source === "mine" ? clips[i]?.url : ""}
            onChange={(e) => e.target.value && pickFromLibrary(i, e.target.value)}
            aria-label="Reprendre une de mes vidéos"
          >
            <option value="">Mes vidéos déjà déposées…</option>
            {myVideos.map((v) => (
              <option key={v.url} value={v.url}>
                {v.name}
              </option>
            ))}
          </select>
        )}
        {clips[i]?.source === "mine" && (
          <Badge variant="secondary" className="text-2xs max-w-[160px] truncate">
            Ma vidéo · {clips[i]?.label}
          </Badge>
        )}
        {clips[i]?.source === "studio" && <Badge variant="secondary" className="text-2xs">Clip du Studio · {clips[i]?.label}</Badge>}
      </div>

      {workspaceId && <details open={pendingCutaway?.index === i || !!cutaways[i] || i === highlightedPassage || undefined}
        className="rounded-md border border-primary/15 bg-primary/5 p-2 space-y-2">
        <summary className="cursor-pointer text-2xs font-medium">Ajouter une image animée sur ce passage (facultatif){cutaways[i] ? " · 1 ajoutée" : ""}</summary>
        <div className="mt-2 flex gap-2 flex-wrap">
          <Button type="button" variant="outline" size="sm" onClick={() => setStudioTarget({ index: i, create: false })}>Choisir un de mes clips</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setStudioTarget({ index: i, create: true })}>Créer un clip</Button>
          <a href={`/photos/studio?reel_passage=${i}`} className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent hover:text-accent-foreground">
            Créer d'abord une image
          </a>
        </div>
        {pendingCutaway?.index === i && <div className="space-y-2 rounded-md border bg-background p-2">
          <p className="text-xs">Prévisualisation pour ce passage : {s.texte_parle}</p>
          {pendingCutaway.job.video_url && <video src={pendingCutaway.job.video_url} controls muted playsInline preload="metadata" className="w-full max-w-xs rounded bg-black" />}
          <p className="text-2xs text-muted-foreground">Le clip sera muet dans le Reel ; la voix et les sous-titres restent sur le passage.</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={montageMode === "filme" && !clips[i]} onClick={() => {
              const job = pendingCutaway.job;
              const sceneLength = montageMode === "filme" ? clips[i]?.duration || sectionDuration(s) :
                voiceClips[i]?.duration ? voiceSectionDuration(voiceClips[i]!.duration) : sectionDuration(s);
              if (montageMode === "cache" && !clips[i]) {
                if (job.duration < sceneLength) {
                  toast.error("Ce clip est trop court pour porter toute la voix de ce passage. Choisis une vidéo de fond, puis ajoute-le comme plan.");
                  return;
                }
                setClips(C => set(C, i, { id: `studio-${job.id}`, studioJobId: job.id, url: job.video_url!,
                  thumbnail: null, duration: job.duration, source: "studio", label: job.source_name, seek: 0 }));
              } else {
                setCutaways(C => set(C, i, { jobId: job.id, url: job.video_url!,
                  duration: Math.min(job.duration, sceneLength), start: 0, seek: 0, label: job.source_name }));
              }
              setPendingCutaway(null);
            }}>Insérer dans ce passage</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPendingCutaway(null)}>Garder sans insérer</Button>
          </div>
          {montageMode === "filme" && !clips[i] && <p className="text-2xs">Choisis d’abord ta vidéo filmée face à la caméra : elle portera la voix sous le plan.</p>}
        </div>}
        {cutaways[i] && <div className="space-y-1">
          <p className="text-2xs">Plan inséré : {cutaways[i]!.label} · {cutaways[i]!.duration} s</p>
          <label className="block text-2xs">Début du plan dans ce passage : {cutaways[i]!.start.toFixed(1)} s
            <input type="range" min={0} max={Math.max(0, (montageMode === "filme" ? clips[i]?.duration || sectionDuration(s) :
              voiceClips[i]?.duration ? voiceSectionDuration(voiceClips[i]!.duration) : sectionDuration(s)) - cutaways[i]!.duration)}
              step={0.5} value={cutaways[i]!.start} className="block w-full" aria-label="Placer le plan du Studio dans ce passage"
              onChange={e => setCutaways(C => C[i] ? set(C, i, { ...C[i]!, start: Number(e.target.value) }) : C)} />
          </label>
          <Button type="button" variant="ghost" size="sm" onClick={() => setCutaways(C => set(C, i, null))}>Retirer ce plan</Button>
        </div>}
      </details>}

      {montageMode === "cache" &&
        clips[i]?.source === "mine" &&
        clips[i]?.duration != null &&
        (clips[i]!.duration as number) > sectionDuration(s) + 0.5 && (
          <div className="space-y-1">
            <label className="text-2xs text-muted-foreground">
              Fenêtre : {Math.round(clips[i]!.seek)} s →{" "}
              {Math.round(clips[i]!.seek + sectionDuration(s))} s (sur{" "}
              {Math.round(clips[i]!.duration as number)} s)
            </label>
            <input
              type="range"
              min={0}
              max={Math.max(0, (clips[i]!.duration as number) - sectionDuration(s))}
              step={0.5}
              value={clips[i]!.seek}
              onChange={(e) =>
                setClips((C) => {
                  const c = C[i];
                  return c ? set(C, i, { ...c, seek: Number(e.target.value) }) : C;
                })
              }
              className="w-full"
              aria-label="Choisir la fenêtre de lecture dans ma vidéo"
            />
          </div>
        )}
    </CardContent>
  </Card>
  );
}
