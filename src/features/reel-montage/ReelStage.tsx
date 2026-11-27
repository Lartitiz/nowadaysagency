// Scène de l'atelier du reel (26/11/2026) : la vidéo, toujours visible à gauche
// (en haut sur téléphone), et la ligne de temps dessous.
// Depuis le 27/11/2026 (Loom « je vois le début, la fin »), le bouton lecture joue
// TOUT le reel, dans les trois façons de monter : le lecteur est celui de la
// fabrication. La ligne de temps (un bloc par passage, large comme sa durée) est sa
// seule barre d'avancement ; un clic sur un bloc ouvre le passage et y amène la vidéo.
// Pendant l'enregistrement de la voix, la scène joue l'image du passage lu.
// Tant que rien n'est lancé, rien n'est téléchargé : on voit l'image du passage.
import { useEffect, useRef, useState } from "react";
import { Check, Film, Loader2, Play } from "lucide-react";
import { HyperframesPlayer, type ReelPlayerHandle } from "./ReelPreview";
import { blockAt, formatClock, timelineTotal, type TimelineBlock } from "./reel-timeline";
import type { Section, SelectedClip } from "./types";

interface ReelStageProps {
  spoken: Section[];
  clips: (SelectedClip | null)[];
  page: number;
  goTo: (index: number) => void;
  /** Les passages dans l'ordre du reel, avec leur durée. */
  timeline: TimelineBlock[];
  /** La page de montage du reel entier, une fois préparée (null = pas encore demandée). */
  reelHtml?: string | null;
  /** Demande de préparer le reel entier pour le lire. */
  onPlayAll: () => void;
  /** Préparation en cours après le clic sur lecture. */
  preparing?: boolean;
  /** Augmente à chaque demande de lecture du reel entier. */
  focus?: number;
  /** La lecture avance d'un passage à l'autre : le panneau de droite suit, sans faire défiler la page. */
  onFollow?: (index: number) => void;
  /** Vidéo fabriquée, à montrer quand elle existe. */
  mp4Url?: string | null;
  /** Recherche automatique des vidéos en cours, passage par passage. */
  searching?: boolean[];
  /** Passage dont la voix est en cours d'enregistrement (null = aucun). */
  recording?: number | null;
}

/** Le texte montré sur l'image du passage : celui prévu à l'écran, sinon la phrase dite. */
function passageCaption(s: Section | undefined): string {
  const text = (typeof s?.texte_overlay === "string" && s.texte_overlay.trim()) || s?.texte_parle || "";
  return text.length > 110 ? `${text.slice(0, 107).trimEnd()}…` : text;
}

/** L'image du passage. Elle ne bouge que pendant l'enregistrement de la voix (muette, en boucle). */
function PassageImage({ clip, searching, moving }: { clip: SelectedClip | null; searching?: boolean; moving: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (moving) void el.play()?.catch?.(() => undefined);
    else if (!el.paused) el.pause();
  }, [moving, clip?.url]);
  if (!clip) {
    // Pendant la recherche automatique, on le dit : « Choisis… » laissait croire
    // qu'il fallait agir alors que les vidéos arrivaient seules (Loom du 27/11/2026).
    return searching ? (
      <div role="status" className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-white/80">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Je cherche des vidéos pour ce passage…
      </div>
    ) : (
      <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs text-white/80">Choisis la vidéo de ce passage</div>
    );
  }
  if (clip.source === "photo") return <img src={clip.url} alt="" className="h-full w-full object-cover" />;
  // Rien n'est téléchargé tant que rien ne joue (clip sans vignette : sa première image).
  return (
    <video ref={video} key={clip.url} src={clip.seek ? `${clip.url}#t=${clip.seek}` : clip.url} poster={clip.thumbnail || undefined}
      muted loop playsInline preload={clip.thumbnail && !moving ? "none" : "metadata"} className="h-full w-full object-cover" />
  );
}

export function ReelStage({ spoken, clips, page, goTo, timeline, reelHtml, onPlayAll, preparing = false, focus = 0, onFollow, mp4Url, searching, recording = null }: ReelStageProps) {
  // « mp4 » = la vidéo fabriquée ; « reel » = le reel à lire (lecteur s'il est prêt, sinon l'image du passage).
  const [view, setView] = useState<"reel" | "mp4">(mp4Url ? "mp4" : "reel");
  useEffect(() => { setView(mp4Url ? "mp4" : "reel"); }, [mp4Url]);
  useEffect(() => { if (focus) setView("reel"); }, [focus]);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focus) root.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }); }, [focus]);

  const player = useRef<ReelPlayerHandle>(null);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  playingRef.current = playing;
  const [time, setTime] = useState(0);
  const total = timelineTotal(timeline);
  const startOf = (passage: number) => timeline.find((b) => b.passage === passage)?.start ?? null;

  // Lecture demandée : elle part dès que les clips sont chargés, depuis le passage affiché.
  const wantsPlay = useRef(false);
  useEffect(() => { setLoaded(false); setPlaying(false); }, [reelHtml]);
  const pageRef = useRef(page);
  pageRef.current = page;
  const loadedRef = useRef(false);
  loadedRef.current = loaded;
  useEffect(() => {
    if (!focus) return;
    // Lecteur déjà chargé (reel rouvert) : la lecture repart tout de suite ; sinon à la fin du chargement.
    if (loadedRef.current) player.current?.play(); else wantsPlay.current = true;
  }, [focus]);
  /** Dernier passage atteint par la lecture elle-même : pas la peine d'y ramener la vidéo. */
  const followed = useRef<number | null>(null);
  const onLoaded = () => {
    setLoaded(true);
    const start = startOf(pageRef.current) ?? 0;
    player.current?.seek(start);
    setTime(start);
    if (wantsPlay.current) { wantsPlay.current = false; player.current?.play(); }
  };
  const onTime = (t: number) => {
    setTime(t);
    const block = blockAt(timeline, t);
    if (block && block.passage !== pageRef.current && playingRef.current) { followed.current = block.passage; onFollow?.(block.passage); }
  };
  // Passage changé à la main (bloc, flèches du panneau) : la vidéo va à son début.
  useEffect(() => {
    if (followed.current === page) { followed.current = null; return; }
    followed.current = null;
    const start = startOf(page);
    if (!loaded || start === null) return;
    player.current?.seek(start);
    setTime(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const isRecording = recording !== null;
  // L'enregistrement coupe la lecture : on n'entend pas le reel dans sa propre prise.
  useEffect(() => { if (isRecording) player.current?.pause(); }, [isRecording]);

  const shown = isRecording ? recording : page;
  const section = spoken[shown];
  const showMp4 = !!mp4Url && view === "mp4" && !isRecording;
  const showPlayer = !!reelHtml && !showMp4 && !isRecording;
  const showPassage = !showMp4 && !showPlayer;
  const canPlayAll = clips.some(Boolean);
  const toggle = () => {
    if (!reelHtml) { onPlayAll(); return; }
    if (playing) { player.current?.pause(); return; }
    // Reel fini : il repart du début.
    if (total > 0 && time >= total - 0.15) { player.current?.seek(0); setTime(0); }
    player.current?.play();
  };

  const blockRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const cursorBlock = showPlayer && loaded ? blockAt(timeline, time) : null;
  const cursorEl = cursorBlock ? blockRefs.current[timeline.indexOf(cursorBlock)] : null;
  const cursorLeft = cursorBlock && cursorEl
    ? cursorEl.offsetLeft + cursorEl.offsetWidth * Math.min(1, Math.max(0, (time - (cursorBlock.start as number)) / Math.max(0.1, cursorBlock.duration)))
    : null;

  const label = isRecording ? `Ce qu’on verra pendant ta phrase ${(recording as number) + 1}`
    : showMp4 ? "Ta vidéo"
    : showPlayer && loaded ? `Ton reel en entier · ${formatClock(time)} / ${formatClock(total)}`
    : total > 0 ? `Ton reel en entier · ${formatClock(total)}` : "La vidéo de ce passage, avec son texte";

  return (
    <div ref={root} data-testid="reel-stage" className="grid scroll-mt-20 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 lg:sticky lg:top-16 lg:flex lg:flex-col lg:items-center">
      <div className="relative aspect-[9/16] w-[132px] shrink-0 overflow-hidden rounded-xl bg-neutral-900 shadow-md sm:w-[168px] lg:h-[min(54vh,470px)] lg:w-auto lg:rounded-2xl">
        {/* Le lecteur reste monté pendant qu'on regarde autre chose : il ne recharge pas ses clips. */}
        {reelHtml && (
          <div className={showPlayer ? "h-full w-full" : "hidden"}>
            <HyperframesPlayer ref={player} html={reelHtml} onLoaded={onLoaded} onTime={onTime} onPlayingChange={setPlaying} />
          </div>
        )}
        {showMp4 && <video src={mp4Url as string} controls playsInline className="h-full w-full bg-black object-contain" />}
        {showPassage && (
          <>
            <PassageImage clip={clips[shown] ?? null} searching={!!searching?.[shown]} moving={isRecording} />
            {clips[shown] && passageCaption(section) && (
              <>
                {/* Même voile sombre et même ombre que la vidéo fabriquée (reel-render/hyperframes.ts,
                    #shade et .line p) : sur un clip clair, le texte se lit dès ici (Loom du 27/11/2026). */}
                <span aria-hidden data-testid="reel-stage-shade" className="pointer-events-none absolute inset-x-0 bottom-0 h-[57%] bg-gradient-to-b from-transparent via-[rgba(10,8,6,0.5)] to-[rgba(10,8,6,0.82)]" />
                <p className="pointer-events-none absolute inset-x-[8%] bottom-[14%] text-center text-2xs font-bold leading-snug text-white [text-shadow:0_1px_3px_rgba(0,0,0,.55),0_0_14px_rgba(0,0,0,.75)] lg:text-sm">
                  {passageCaption(section)}
                </p>
              </>
            )}
          </>
        )}
        {isRecording && (
          <span role="status" className="absolute left-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-2xs font-semibold text-white">● J’enregistre</span>
        )}
        {preparing && !isRecording && (
          <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 px-4 text-center text-xs text-white">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Je prépare ton reel…
          </div>
        )}
        {/* Un seul bouton lecture, sur toute la vidéo : il joue le reel entier, ou le met en pause. */}
        {!showMp4 && !isRecording && !preparing && canPlayAll && (showPassage || loaded) && (
          <button type="button" onClick={toggle} aria-label={playing && showPlayer ? "Mettre le reel en pause" : "Lire tout le reel"} className="absolute inset-0 block">
            {!(playing && showPlayer) && (
              <span className="absolute left-1/2 top-[42%] flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-primary shadow">
                <Play className="h-5 w-5 translate-x-px" aria-hidden />
              </span>
            )}
          </button>
        )}
      </div>

      <p className="min-w-0 self-center text-2xs text-muted-foreground lg:self-auto lg:text-center">{label}</p>

      <nav aria-label="Passages du reel" className="relative col-span-2 flex w-full items-stretch gap-1 lg:max-w-[440px]">
        {timeline.map((block, k) => {
          const i = block.passage;
          const clip = clips[i];
          const current = cursorBlock ? cursorBlock === block : i === shown && !showMp4;
          return (
            <button key={i} ref={(el) => { blockRefs.current[k] = el; }} type="button" disabled={isRecording}
              onClick={() => { setView("reel"); goTo(i); }} aria-current={i === page ? "step" : undefined}
              aria-label={`Passage ${i + 1}${clip ? ", prêt" : ""}`}
              style={{ flexGrow: Math.max(1, block.duration), flexBasis: 0 }}
              className={`relative h-[52px] min-w-[26px] overflow-hidden rounded-md border bg-muted text-xs font-semibold lg:h-[58px] ${
                current ? "border-primary ring-2 ring-primary/30" : "border-border"} ${block.start === null ? "border-dashed" : ""}`}>
              {clip?.thumbnail && <img src={clip.thumbnail} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
              {clip && !clip.thumbnail && <span className="absolute inset-0 bg-neutral-700" aria-hidden />}
              <span className={`absolute bottom-0.5 left-1 ${clip ? "text-white [text-shadow:0_1px_3px_rgba(0,0,0,.8)]" : "text-muted-foreground"}`}>{i + 1}</span>
              {clip && (
                <span className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-success text-white">
                  <Check className="h-2.5 w-2.5" aria-hidden />
                </span>
              )}
            </button>
          );
        })}
        {cursorLeft !== null && (
          <span aria-hidden data-testid="reel-timeline-cursor" style={{ left: cursorLeft }}
            className="pointer-events-none absolute -bottom-1 -top-1 w-[3px] -translate-x-1/2 rounded-full bg-primary shadow-[0_0_0_2px_rgba(255,255,255,.9)]" />
        )}
        {mp4Url && !isRecording && (
          <button type="button" onClick={() => setView("mp4")} aria-pressed={showMp4}
            className={`flex h-[52px] shrink-0 items-center gap-1 rounded-md border px-2 text-2xs font-medium lg:h-[58px] ${showMp4 ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
            <Film className="h-3.5 w-3.5" aria-hidden />Ma vidéo
          </button>
        )}
      </nav>
    </div>
  );
}
