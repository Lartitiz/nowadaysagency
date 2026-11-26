import React, { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import StoryFramePreview from "@/components/stories/StoryFramePreview";
import { resolveStoryViewport, type StoryVisualPlan } from "@/lib/story-visual";
import { useIsMobile } from "@/hooks/use-mobile";
import { hitStoryText, storyTextBoxes, unionBox, type StoryTextBox } from "@/components/stories/story-text-hit";

/** Ce qu'on écrit quand on touche un texte de la story (null = la case du panneau prend le relais). */
export interface StoryInlineField {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

interface Props {
  storyIndex: number;
  html: string;
  visual: StoryVisualPlan;
  photoEnabled: boolean;
  onTextMove: (x: number, y: number) => void;
  onPhotoMove: (x: number, y: number) => void;
  /** Texte touché sans glisser : champ à écrire sur la story, ou null. */
  inlineField?: (box: StoryTextBox) => StoryInlineField | null;
  /** Texte touché qu'on ne peut pas écrire sur la story (liste, citation…). */
  onTextTouched?: (box: StoryTextBox) => void;
  /** Placement dans la mise en page de l'atelier (grille de StoryResult). */
  className?: string;
  /** Story pas affichée (une seule l'est à la fois) : sa taille se mesure quand elle le devient. */
  hidden?: boolean;
}

/**
 * Stories comme le carrousel (12/11/2026) : on touche un texte pour l'écrire
 * directement sur la story, on le glisse pour le déplacer, on glisse le fond
 * photo pour le recadrer. Avant : un bouton « Texte / Photo » à choisir, et le
 * texte s'écrivait seulement dans la case à gauche.
 * Aperçu : 200 px sur téléphone. Sur ordinateur (26/11/2026), la story prend la hauteur
 * libre entre le haut de son cadre et la barre « Publier » collée en bas : 240 à 360 px de
 * large, par paliers de 8 px (300 px fixes avant : coupée en bas sur un petit portable,
 * petite sur un grand écran).
 */
const PREVIEW_WIDTH = { desktop: 300, mobile: 200, min: 240, max: 360 } as const;
/** Sous la story : la ligne d'aide et un peu d'air au-dessus de la barre du bas. */
const UNDER_STORY = 44;

/** Largeur de la story sur ordinateur, mesurée sur la page en haut de défilement. */
function measureStoryWidth(frame: HTMLElement): number {
  const top = frame.getBoundingClientRect().top + window.scrollY;
  const bar = window.document.querySelector<HTMLElement>('[data-testid="result-actions"]');
  const bottom = window.innerHeight - (bar ? bar.getBoundingClientRect().height : 0);
  const free = ((bottom - top - UNDER_STORY) * 9) / 16;
  if (!Number.isFinite(free) || top <= 0) return PREVIEW_WIDTH.desktop;
  return Math.max(PREVIEW_WIDTH.min, Math.min(PREVIEW_WIDTH.max, Math.floor(free / 8) * 8));
}

function useStoryWidth(frame: React.RefObject<HTMLDivElement>, mobile: boolean, key: unknown): number {
  const [width, setWidth] = useState<number>(PREVIEW_WIDTH.desktop);
  useLayoutEffect(() => {
    if (mobile) return;
    let raf = 0;
    const update = () => { if (frame.current?.offsetParent) setWidth(measureStoryWidth(frame.current)); };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    update();
    // La page se met en place après l'arrivée (haut replié, barre du bas) : on remesure quand elle bouge.
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    observer?.observe(window.document.body);
    window.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(raf); observer?.disconnect(); window.removeEventListener("resize", schedule); };
  }, [frame, mobile, key]);
  return mobile ? PREVIEW_WIDTH.mobile : width;
}
const STORY_W = 1080;
/** Au-delà de 4 px, le geste est un glissé, pas un toucher. */
const DRAG_THRESHOLD = 4;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function StoryVisualDirectControls({
  storyIndex,
  html,
  visual,
  photoEnabled,
  onTextMove,
  onPhotoMove,
  inlineField,
  onTextTouched,
  className = "",
  hidden = false,
}: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const width = useStoryWidth(frame, useIsMobile(), hidden);
  const scale = width / STORY_W;
  const [editing, setEditing] = useState<StoryTextBox | null>(null);
  const [hover, setHover] = useState<"text" | "photo" | null>(null);
  const drag = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    moved: boolean;
    hit: StoryTextBox | null;
    textX: number;
    textY: number;
    photoX: number;
    photoY: number;
  } | null>(null);
  const viewport = resolveStoryViewport(visual);
  const defaultTextY = visual.text_position === "top" ? 28 : visual.text_position === "bottom" ? 72 : 50;
  const textY = Number.isFinite(visual.text_position_y) ? viewport.textY : defaultTextY;

  // Une autre story affichée : on referme l'écriture en cours.
  useEffect(() => setEditing(null), [storyIndex]);

  const readBoxes = () => storyTextBoxes(frame.current?.querySelector("iframe")?.contentDocument);
  const pointInStory = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { rect, x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  };

  const begin = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const { x, y } = pointInStory(event);
    drag.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false,
      hit: hitStoryText(readBoxes(), x, y),
      textX: viewport.textX,
      textY,
      photoX: viewport.photoX,
      photoY: viewport.photoY,
    };
  };

  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) {
      // Survol : le curseur dit ce que fera le geste.
      if (event.pointerType === "mouse") {
        const { x, y } = pointInStory(event);
        setHover(hitStoryText(readBoxes(), x, y) ? "text" : photoEnabled ? "photo" : null);
      }
      return;
    }
    const dx = event.clientX - start.clientX;
    const dy = event.clientY - start.clientY;
    if (!start.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    start.moved = true;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (start.hit) {
      setEditing(null);
      onTextMove(
        clamp(start.textX + (dx / rect.width) * 100, 25, 75),
        clamp(start.textY + (dy / rect.height) * 100, 20, 80),
      );
      return;
    }
    if (!photoEnabled) return;
    onPhotoMove(
      clamp(start.photoX - (dx / rect.width) * 100, 0, 100),
      clamp(start.photoY - (dy / rect.height) * 100, 0, 100),
    );
  };

  const end = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    drag.current = null;
    if (start.moved) return;
    if (!start.hit) {
      setEditing(null);
      return;
    }
    const field = inlineField?.(start.hit);
    if (field) {
      // Tout le texte du même rôle (un texte coupé autour d'une citation reste un seul champ).
      setEditing(unionBox(readBoxes(), start.hit.role, start.hit.role === "item" ? start.hit.index : undefined) ?? start.hit);
    } else {
      setEditing(null);
      onTextTouched?.(start.hit);
    }
  };

  const field = editing ? inlineField?.(editing) ?? null : null;
  // Case d'écriture posée sur le texte touché, un peu plus large que lui pour écrire à l'aise.
  const editorBox = editing && field ? (() => {
    const pad = 20;
    const w = Math.max(editing.w + pad * 2, 640);
    const x = clamp(editing.x + editing.w / 2 - w / 2, 24, STORY_W - 24 - w);
    return { left: x * scale, top: Math.max(0, (editing.y - pad) * scale), width: w * scale, minHeight: (editing.h + pad * 2) * scale };
  })() : null;

  return (
    <div className={`shrink-0 space-y-2 ${className}`} style={{ width }} data-story-direct-controls={storyIndex + 1}>
      <div ref={frame} className="relative rounded-lg" style={{ aspectRatio: "9 / 16" }}>
        <StoryFramePreview html={html} title={`Aperçu story ${storyIndex + 1}`} width={width} />
        <button
          type="button"
          aria-label={`Déplacer le texte de la story ${storyIndex + 1}`}
          className={`absolute inset-0 z-10 touch-none select-none rounded-lg ${hover === "text" ? "cursor-move" : hover === "photo" ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={() => { drag.current = null; }}
          onPointerLeave={() => setHover(null)}
        />
        {editorBox && field && (
          <textarea
            // La clé change avec le texte touché : la case revient en haut et garde le focus.
            key={`${editing!.role}-${editing!.index}`}
            autoFocus
            aria-label={field.label}
            value={field.value}
            onChange={(e) => field.onChange(e.target.value)}
            onBlur={() => setEditing(null)}
            onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }}
            onFocus={(e) => { const end = e.currentTarget.value.length; e.currentTarget.setSelectionRange(end, end); }}
            data-story-inline-editor
            className="absolute z-20 resize-none rounded-md border-2 border-primary bg-white/95 p-2 text-sm leading-snug text-foreground shadow-lg outline-none"
            style={{ ...editorBox, height: "auto", maxHeight: "70%" }}
            rows={Math.min(8, Math.max(2, Math.ceil(field.value.length / 32)))}
          />
        )}
      </div>
      <p className="text-center text-2xs text-muted-foreground">
        Touche un texte pour l'écrire, glisse-le pour le déplacer{photoEnabled ? ", glisse la photo pour la recadrer" : ""}.
      </p>
    </div>
  );
}
