import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useBrandCharter } from "@/hooks/use-branding";
import { buildStoryFrameHtml, type StoryFrameBranding } from "@/lib/story-visual";
import { resolveLibraryPhotoUrls } from "@/lib/story-photos";

// Vignettes de « Mes idées » (13/11/2026), à la façon de Canva : un contenu
// qui a des visuels montre sa slide 1 (ou sa story 1) ; sinon une « page » avec
// le début du texte. La première image vient de la colonne légère `cover`,
// calculée par la base à l'enregistrement (migration 20261113120000) : la liste
// ne lit toujours pas content_data. Les vignettes ne se dessinent qu'une fois
// visibles à l'écran, pour ne pas charger 40 iframes d'un coup.

export type IdeaCoverData =
  | { kind: "slide"; html: string; count?: number }
  | { kind: "story"; story: Record<string, unknown>; count?: number };

export function readCover(raw: unknown): IdeaCoverData | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as any;
  if (c.kind === "slide" && typeof c.html === "string" && c.html.trim()) return c;
  if (c.kind === "story" && c.story && typeof c.story === "object") return c;
  return null;
}

/** Vrai dès que l'élément passe près de l'écran (et le reste ensuite). */
function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (seen || !ref.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: "300px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return { ref, seen };
}

/** HTML de taille fixe (1080 × h) réduit à la largeur de son cadre. */
function ScaledFrame({ html, height, title, scripts = false }: { html: string; height: number; title: string; scripts?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(el.getBoundingClientRect().width);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      {w > 0 && (
        <iframe
          srcDoc={html}
          title={title}
          tabIndex={-1}
          aria-hidden="true"
          sandbox={scripts ? "allow-same-origin allow-scripts" : "allow-same-origin"}
          style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: `${height}px`, transform: `scale(${w / 1080})`, transformOrigin: "top left", border: "none", pointerEvents: "none" }}
        />
      )}
    </div>
  );
}

function StoryFrame({ story }: { story: Record<string, unknown> }) {
  const { data: charter } = useBrandCharter();
  const photoId = (story as any)?.visual?.photo_id as string | undefined;
  const [libraryUrl, setLibraryUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photoId) return;
    let alive = true;
    resolveLibraryPhotoUrls([story as any]).then((map) => { if (alive) setLibraryUrl(map.get(photoId) ?? null); }, () => {});
    return () => { alive = false; };
  }, [photoId, story]);
  const html = useMemo(() => {
    const c: any = charter;
    const branding: StoryFrameBranding | null = c ? {
      color_primary: c.color_primary, color_secondary: c.color_secondary, color_background: c.color_background, color_text: c.color_text,
      story_assemblage: c.story_assemblage ?? null, story_pill_color: c.story_pill_color ?? null, story_corners: c.story_corners ?? null, story_align: c.story_align ?? null,
    } : null;
    const v = (story as any)?.visual;
    return buildStoryFrameHtml(story as any, branding, { photoUrl: v?.photo_url || libraryUrl, preview: true });
  }, [story, charter, libraryUrl]);
  if (!html) return null;
  return (
    <div className="absolute inset-0 flex justify-center bg-muted/60 py-2">
      <div className="relative h-full overflow-hidden rounded-md" style={{ aspectRatio: "1080 / 1920" }}>
        <ScaledFrame html={html} height={1920} title="Story 1" />
      </div>
    </div>
  );
}

/**
 * Cadre 4:5 d'une carte de contenu. `fallback` = la « page » texte affichée
 * quand il n'y a pas de visuel (ou tant que la vignette n'est pas dessinée).
 */
export function IdeaCover({ cover, fallback }: { cover: IdeaCoverData | null; fallback: ReactNode }) {
  const { ref, seen } = useSeen<HTMLDivElement>();
  const count = cover?.count && cover.count > 1 ? cover.count : 0;
  return (
    <div ref={ref} className="relative w-full overflow-hidden rounded-xl border border-border bg-card" style={{ aspectRatio: "4 / 5" }} data-testid="idea-cover" data-cover={cover?.kind ?? "text"}>
      {!cover && fallback}
      {cover && seen && cover.kind === "slide" && <ScaledFrame html={cover.html} height={1350} title="Slide 1" scripts />}
      {cover && seen && cover.kind === "story" && <StoryFrame story={cover.story} />}
      {count > 0 && (
        <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-2xs font-semibold text-white tabular-nums">
          1/{count}
        </span>
      )}
    </div>
  );
}

/** « Page » d'un contenu sans visuel : le format, puis le début du texte. */
export function TextCover({ label, text }: { label: string; text?: string }) {
  return (
    <div className="absolute inset-0 flex flex-col gap-2.5 bg-rose-pale p-4">
      <span className="text-2xs font-semibold uppercase tracking-wider text-primary-text">{label}</span>
      {text
        ? <p className="font-display text-[15px] leading-snug text-foreground line-clamp-[9] break-words">{text}</p>
        : <p className="text-[13px] italic text-muted-foreground">Pas encore de texte</p>}
    </div>
  );
}

/** Demande commencée dans Créer : pas encore de texte, on montre le format. */
export function BriefCover({ format }: { format: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-rose-pale p-4 text-center">
      <span className="font-display text-xl text-foreground">{format}</span>
      <span className="text-xs text-muted-foreground">Demande à reprendre</span>
    </div>
  );
}
