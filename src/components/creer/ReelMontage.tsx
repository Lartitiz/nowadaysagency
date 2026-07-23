/**
 * ReelMontage — écran de montage d'un reel (Phase 1, beta).
 *
 * À partir des sections du script, propose UN clip libre de droit par section
 * (recherche Pexels via `searchStockVideos`), laisse relancer la recherche par
 * section, puis assemble le tout en MP4 via le moteur `reel-render`.
 *
 * Sources d'un clip : les VIDÉOS DE LA CRÉATRICE (dépôt ou bibliothèque
 * `reel-videos`, avec fenêtre de lecture réglable — la coupe est faite par le
 * moteur via `seek`, on ne découpe rien côté client) et la banque libre en
 * secours. La voix : enregistrée au téléprompteur (ReelVoiceRecorder) ou
 * générée, avec repli phrase par phrase.
 */

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Film, Download, Mic, Wand2, Upload } from "lucide-react";
import { toast } from "sonner";
import ReelVoiceRecorder from "@/components/creer/ReelVoiceRecorder";
import {
  searchStockVideos,
  suggestStockKeywords,
  type StockVideo,
} from "@/lib/stock-videos";
import {
  buildRenderPlan,
  submitReelRender,
  pollReelRender,
  sectionDuration,
} from "@/lib/reel-render";
import {
  uploadReelVideo,
  listReelVideos,
  loadVideoDuration,
  type UserReelVideo,
} from "@/lib/reel-user-videos";

interface Section {
  timing?: string;
  texte_parle?: string;
  format_visuel?: string;
}

interface Props {
  sections: Section[];
  subject?: string;
}

type Phase = "idle" | "rendering" | "done" | "error";

/** Clip retenu pour une section : banque libre ou vidéo de la créatrice. */
interface SelectedClip {
  id: string;
  url: string;
  thumbnail: string | null;
  /** Durée du clip source (pour la fenêtre), null si inconnue. */
  duration: number | null;
  source: "stock" | "mine";
  label: string;
  /** Seconde d'entrée dans le clip (fenêtre choisie). */
  seek: number;
}

function fromStock(v: StockVideo): SelectedClip {
  return {
    id: `stock-${v.id}`,
    url: v.url,
    thumbnail: v.thumbnail || null,
    duration: v.duration,
    source: "stock",
    label: "Banque libre",
    seek: 0,
  };
}

function fromMine(v: UserReelVideo, duration: number | null): SelectedClip {
  return {
    id: `mine-${v.url}`,
    url: v.url,
    thumbnail: null,
    duration,
    source: "mine",
    label: v.name,
    seek: 0,
  };
}

export default function ReelMontage({ sections, subject }: Props) {
  const spoken = sections.filter((s) => typeof s.texte_parle === "string" && s.texte_parle.trim());

  const [keywords, setKeywords] = useState<string[]>(() => spoken.map(() => ""));
  const [results, setResults] = useState<StockVideo[][]>(() => spoken.map(() => []));
  const [clips, setClips] = useState<(SelectedClip | null)[]>(() => spoken.map(() => null));
  const [loading, setLoading] = useState<boolean[]>(() => spoken.map(() => true));

  // Mes vidéos : bibliothèque perso (dépôts précédents) + upload en cours.
  const [myVideos, setMyVideos] = useState<UserReelVideo[]>([]);
  const [uploadingSection, setUploadingSection] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [tick, setTick] = useState(0);
  const [mp4Url, setMp4Url] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Voix : "recorded" = la créatrice lit le script (téléprompteur) ;
  // "tts" = voix générée. Les phrases non enregistrées retombent sur la
  // voix générée (repli géré par buildRenderPlan + le moteur).
  const [voiceMode, setVoiceMode] = useState<"recorded" | "tts">("recorded");
  const [voiceUrls, setVoiceUrls] = useState<(string | null)[]>(() => spoken.map(() => null));

  // Suggestion initiale : un clip par section.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let kws: string[] = [];
      try {
        const { keywords: k, primary } = await suggestStockKeywords({
          subject: subject || spoken.map((s) => s.texte_parle).join(" ").slice(0, 120),
          slides: spoken.map((s) => s.texte_parle || ""),
        });
        kws = spoken.map((_, i) => k[i] || primary || subject || "");
      } catch {
        kws = spoken.map(() => subject || "");
      }
      if (cancelled) return;
      setKeywords(kws);
      await Promise.all(kws.map((kw, i) => runSearch(i, kw, { cancelledRef: () => cancelled })));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(i: number, kw: string, o?: { cancelledRef?: () => boolean }) {
    const term = kw.trim();
    setLoading((L) => set(L, i, true));
    try {
      const vids = term
        ? await searchStockVideos(term, { perPage: 6, orientation: "portrait", locale: "en-US" })
        : [];
      if (o?.cancelledRef?.()) return;
      setResults((R) => set(R, i, vids));
      // Ne remplace jamais une vidéo perso déjà choisie par un résultat stock.
      setClips((C) =>
        set(C, i, C[i]?.source === "mine" ? C[i] : vids[0] ? fromStock(vids[0]) : C[i]),
      );
    } catch (e) {
      if (!o?.cancelledRef?.()) toast.error(e instanceof Error ? e.message : "Recherche impossible.");
    } finally {
      if (!o?.cancelledRef?.()) setLoading((L) => set(L, i, false));
    }
  }

  // Bibliothèque perso, chargée une fois (best-effort).
  useEffect(() => {
    listReelVideos().then(setMyVideos).catch(() => {});
  }, []);

  function openFilePicker(i: number) {
    uploadTargetRef.current = i;
    fileInputRef.current?.click();
  }

  async function handleFileChosen(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const i = uploadTargetRef.current;
    setUploadingSection(i);
    try {
      const video = await uploadReelVideo(file);
      const duration = await loadVideoDuration(video.url);
      setMyVideos((v) => [video, ...v]);
      setClips((C) => set(C, i, fromMine(video, duration)));
      toast.success("Ta vidéo est prête pour cette section.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "L'envoi de la vidéo a échoué.");
    } finally {
      setUploadingSection(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function pickFromLibrary(i: number, url: string) {
    const video = myVideos.find((v) => v.url === url);
    if (!video) return;
    const duration = await loadVideoDuration(video.url);
    setClips((C) => set(C, i, fromMine(video, duration)));
  }

  async function handleAssemble() {
    const chosen = clips.map((c) => (c ? { url: c.url, seek: c.seek } : null));
    if (!chosen.some(Boolean)) {
      toast.error("Choisis au moins un clip avant d'assembler.");
      return;
    }
    setPhase("rendering");
    setTick(0);
    setMp4Url(null);
    setErrorMsg("");
    try {
      const plan = buildRenderPlan(spoken, chosen, {
        voice_mode: voiceMode,
        voiceAudioUrls: voiceUrls,
      });
      const project = await submitReelRender(plan);
      const url = await pollReelRender(project, { onTick: setTick });
      setMp4Url(url);
      setPhase("done");
      toast.success("Ton reel est monté !");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Le montage a échoué.");
      setPhase("error");
    }
  }

  const ready = clips.filter(Boolean).length;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-primary uppercase tracking-wide">
          <Film className="inline h-3.5 w-3.5 mr-1" /> Monter la vidéo
        </span>
        <Badge variant="secondary" className="text-2xs">beta</Badge>
      </div>
      <p className="text-2xs text-muted-foreground">
        Un clip libre de droit par phrase, ta voix par-dessus, les sous-titres suivent.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setVoiceMode("recorded")}
          className={`flex-1 rounded-md border px-3 py-2 text-left ${
            voiceMode === "recorded" ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <Mic className="h-3.5 w-3.5" /> Ma voix
          </span>
          <span className="block text-2xs text-muted-foreground">J'enregistre en lisant le script</span>
        </button>
        <button
          type="button"
          onClick={() => setVoiceMode("tts")}
          className={`flex-1 rounded-md border px-3 py-2 text-left ${
            voiceMode === "tts" ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <Wand2 className="h-3.5 w-3.5" /> Voix générée
          </span>
          <span className="block text-2xs text-muted-foreground">Lecture automatique du script</span>
        </button>
      </div>

      {voiceMode === "recorded" && (
        <ReelVoiceRecorder
          texts={spoken.map((s) => s.texte_parle as string)}
          onVoicesChange={setVoiceUrls}
        />
      )}

      <div className="space-y-2">
        {spoken.map((s, i) => (
          <Card key={i} className="border-border">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {s.timing && <Badge variant="secondary" className="font-mono text-2xs">{s.timing}</Badge>}
                <span className="text-2xs text-muted-foreground">≈ {sectionDuration(s)} s</span>
              </div>
              {s.texte_parle && (
                <p className="text-xs text-foreground leading-snug line-clamp-2">{s.texte_parle}</p>
              )}

              <div className="flex gap-1.5">
                <Input
                  value={keywords[i] ?? ""}
                  onChange={(e) => setKeywords((K) => set(K, i, e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && runSearch(i, keywords[i] ?? "")}
                  placeholder="mots-clés du plan (ex: mains savon atelier)"
                  className="h-8 text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => runSearch(i, keywords[i] ?? "")}
                  disabled={loading[i]}
                >
                  {loading[i] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
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
                  Ma vidéo
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
              </div>

              {clips[i]?.source === "mine" &&
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
        ))}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => handleFileChosen(e.target.files)}
      />

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-2xs text-muted-foreground">
          {ready} clip{ready > 1 ? "s" : ""} sur {spoken.length} prêt{ready > 1 ? "s" : ""}
        </span>
        <Button size="sm" onClick={handleAssemble} disabled={phase === "rendering" || ready === 0}>
          {phase === "rendering" ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Montage en cours…
            </>
          ) : (
            <>
              <Film className="h-4 w-4 mr-1.5" />
              Assembler mon reel
            </>
          )}
        </Button>
      </div>

      {phase === "rendering" && (
        <p className="text-2xs text-muted-foreground text-center">
          Assemblage des clips, incrustation des sous-titres et de la voix… (≈ {Math.max(1, tick * 6)} s)
        </p>
      )}

      {phase === "error" && (
        <p className="text-xs text-destructive">{errorMsg}</p>
      )}

      {phase === "done" && mp4Url && (
        <div className="space-y-2">
          <video src={mp4Url} controls playsInline className="w-full max-h-[420px] rounded-lg bg-black" />
          <a href={mp4Url} download className="inline-flex">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1.5" />
              Télécharger le MP4
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}

// Petit helper immuable : remplace l'index i d'un tableau.
function set<T>(arr: T[], i: number, v: T): T[] {
  const copy = arr.slice();
  copy[i] = v;
  return copy;
}
