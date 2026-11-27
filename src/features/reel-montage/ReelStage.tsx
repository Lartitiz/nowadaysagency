// Scène de l'atelier du reel (26/11/2026) : la vidéo, toujours visible à gauche
// (en haut sur téléphone), et les passages en vignettes dessous. Elle montre, dans
// l'ordre : l'aperçu immédiat s'il est ouvert, la vidéo fabriquée si elle existe,
// sinon l'image du passage en cours avec son texte. Elle n'est donc jamais vide.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Film, Loader2, Play } from "lucide-react";
import type { Section, SelectedClip } from "./types";

interface ReelStageProps {
  spoken: Section[];
  clips: (SelectedClip | null)[];
  page: number;
  goTo: (index: number) => void;
  /** Le lecteur de l'aperçu immédiat (reel sans voix), quand il est ouvert. */
  player?: ReactNode;
  /** Augmente à chaque demande de remontrer l'aperçu. */
  focus?: number;
  /** Vidéo fabriquée, à montrer quand aucun aperçu n'est ouvert. */
  mp4Url?: string | null;
  /** Recherche automatique des vidéos en cours, passage par passage. */
  searching?: boolean[];
}

/** Le texte montré sur l'image du passage : celui prévu à l'écran, sinon la phrase dite. */
function passageCaption(s: Section | undefined): string {
  const text = (typeof s?.texte_overlay === "string" && s.texte_overlay.trim()) || s?.texte_parle || "";
  return text.length > 110 ? `${text.slice(0, 107).trimEnd()}…` : text;
}

function PassageImage({ clip, searching }: { clip: SelectedClip | null; searching?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setPlaying(false); }, [clip?.url]);
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
  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) { void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
    else { el.pause(); setPlaying(false); }
  };
  return (
    <button type="button" onClick={toggle} aria-label={playing ? "Mettre le clip en pause" : "Lire le clip de ce passage"} className="group relative block h-full w-full">
      {/* Rien n'est téléchargé tant qu'elle ne lance pas la lecture (clip sans vignette : sa première image). */}
      <video ref={video} key={clip.url} src={clip.seek ? `${clip.url}#t=${clip.seek}` : clip.url} poster={clip.thumbnail || undefined}
        muted loop playsInline preload={clip.thumbnail ? "none" : "metadata"} className="h-full w-full object-cover" />
      {!playing && (
        <span className="absolute left-1/2 top-[42%] flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-primary shadow">
          <Play className="h-5 w-5 translate-x-px" aria-hidden />
        </span>
      )}
    </button>
  );
}

export function ReelStage({ spoken, clips, page, goTo, player, focus = 0, mp4Url, searching }: ReelStageProps) {
  // « video » = l'aperçu ou la vidéo fabriquée ; « passage » = l'image du passage en cours.
  const hasVideo = !!player || !!mp4Url;
  const [view, setView] = useState<"video" | "passage">(hasVideo ? "video" : "passage");
  useEffect(() => { setView(hasVideo ? "video" : "passage"); }, [hasVideo, mp4Url, focus]);
  const root = useRef<HTMLDivElement>(null);
  // Aperçu ouvert ou redemandé : on l'amène à l'écran (sur téléphone il est en haut de page).
  const opened = !!player;
  useEffect(() => { if (opened) root.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }); }, [opened, focus]);
  const showVideo = hasVideo && view === "video";
  const section = spoken[page];

  return (
    <div ref={root} data-testid="reel-stage" className="flex scroll-mt-20 items-start gap-3 lg:sticky lg:top-16 lg:flex-col lg:items-center">
      <div className="relative aspect-[9/16] w-[132px] shrink-0 overflow-hidden rounded-xl bg-neutral-900 shadow-md sm:w-[168px] lg:h-[min(54vh,470px)] lg:w-auto lg:rounded-2xl">
        {/* Le lecteur de l'aperçu reste monté pendant qu'on regarde un passage : il ne recharge pas ses clips. */}
        {player && <div className={showVideo ? "h-full w-full" : "hidden"}>{player}</div>}
        {!player && mp4Url && showVideo && <video src={mp4Url} controls playsInline className="h-full w-full bg-black object-contain" />}
        {!showVideo && (
          <>
            <PassageImage clip={clips[page] ?? null} searching={!!searching?.[page]} />
            {clips[page] && passageCaption(section) && (
              <>
                {/* Même voile sombre et même ombre que la vidéo assemblée (reel-render/hyperframes.ts,
                    #shade et .line p) : sur un clip clair, le texte se lit dès ici, pas seulement
                    après « Assembler » (Loom du 27/11/2026). */}
                <span aria-hidden data-testid="reel-stage-shade" className="pointer-events-none absolute inset-x-0 bottom-0 h-[57%] bg-gradient-to-b from-transparent via-[rgba(10,8,6,0.5)] to-[rgba(10,8,6,0.82)]" />
                <p className="pointer-events-none absolute inset-x-[8%] bottom-[14%] text-center text-2xs font-bold leading-snug text-white [text-shadow:0_1px_3px_rgba(0,0,0,.55),0_0_14px_rgba(0,0,0,.75)] lg:text-sm">
                  {passageCaption(section)}
                </p>
              </>
            )}
          </>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2 lg:w-full lg:flex-none">
        <p className="text-2xs text-muted-foreground lg:text-center">
          {showVideo ? (player ? "Aperçu de ton reel" : "Ta vidéo") : "La vidéo de ce passage, avec son texte"}
        </p>
        <nav aria-label="Passages du reel" className="flex flex-wrap items-center gap-1.5 lg:justify-center">
          {spoken.map((_, i) => {
            const clip = clips[i];
            const current = i === page && !showVideo;
            return (
              <button key={i} type="button" onClick={() => { setView("passage"); goTo(i); }} aria-current={i === page ? "step" : undefined}
                aria-label={`Passage ${i + 1}${clip ? ", prêt" : ""}`}
                className={`relative h-[52px] w-[35px] overflow-hidden rounded-md border bg-muted text-xs font-semibold lg:h-[66px] lg:w-[44px] ${
                  current ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
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
          {hasVideo && (
            <button type="button" onClick={() => setView("video")} aria-pressed={showVideo}
              className={`flex h-[52px] items-center gap-1 rounded-md border px-2 text-2xs font-medium lg:h-[66px] ${showVideo ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
              <Film className="h-3.5 w-3.5" aria-hidden />{player ? "Aperçu" : "Ma vidéo"}
            </button>
          )}
        </nav>
      </div>
    </div>
  );
}
