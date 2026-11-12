import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Crop, Move, RotateCcw, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import StoryFramePreview from "@/components/stories/StoryFramePreview";
import { resolveStoryViewport, type StoryVisualPlan } from "@/lib/story-visual";
import { useIsMobile } from "@/hooks/use-mobile";

type Mode = "text" | "photo";

interface Props {
  storyIndex: number;
  html: string;
  visual: StoryVisualPlan;
  photoEnabled: boolean;
  onTextMove: (x: number, y: number) => void;
  onPhotoMove: (x: number, y: number) => void;
  onPhotoZoom: (zoom: number) => void;
  onReset: (mode: Mode) => void;
  /** Placement dans la mise en page de l'atelier (grille de StoryResult). */
  className?: string;
}

/**
 * Taille de l'aperçu (chantier 3 des stories, 12/11/2026) : 170 px de large
 * était trop petit sur ordi. 250 px sur ordi, 200 px sur téléphone (l'aperçu
 * y est posé juste sous la case de texte, il ne doit pas tout repousser).
 */
const PREVIEW_WIDTH = { desktop: 250, mobile: 200 } as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Manipulation directe du texte et du cadrage sur la miniature de la story. */
export default function StoryVisualDirectControls({
  storyIndex,
  html,
  visual,
  photoEnabled,
  onTextMove,
  onPhotoMove,
  onPhotoZoom,
  onReset,
  className = "",
}: Props) {
  const width = useIsMobile() ? PREVIEW_WIDTH.mobile : PREVIEW_WIDTH.desktop;
  const [mode, setMode] = useState<Mode>("text");
  const drag = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    photoX: number;
    photoY: number;
  } | null>(null);
  const viewport = resolveStoryViewport(visual);
  const defaultTextY = visual.text_position === "top" ? 28 : visual.text_position === "bottom" ? 72 : 50;
  const handleY = Number.isFinite(visual.text_position_y) ? viewport.textY : defaultTextY;
  // Texte poussé à gauche (il peut alors toucher le bord gauche) : la poignée passe
  // sur le bord droit, toujours libre dans ce cas (largeur bornée dans story-visual).
  const handleRight = viewport.textX < 50;

  useEffect(() => {
    if (!photoEnabled && mode === "photo") setMode("text");
  }, [mode, photoEnabled]);

  const begin = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      photoX: viewport.photoX,
      photoY: viewport.photoY,
    };
    if (mode === "text") {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      onTextMove(
        clamp(((event.clientX - rect.left) / rect.width) * 100, 25, 75),
        clamp(((event.clientY - rect.top) / rect.height) * 100, 20, 80),
      );
    }
  };

  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (mode === "text") {
      onTextMove(
        clamp(((event.clientX - rect.left) / rect.width) * 100, 25, 75),
        clamp(((event.clientY - rect.top) / rect.height) * 100, 20, 80),
      );
      return;
    }
    onPhotoMove(
      clamp(start.photoX - ((event.clientX - start.clientX) / rect.width) * 100, 0, 100),
      clamp(start.photoY - ((event.clientY - start.clientY) / rect.height) * 100, 0, 100),
    );
  };

  const end = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  return (
    <div className={`shrink-0 space-y-2 ${className}`} style={{ width }} data-story-direct-controls={storyIndex + 1}>
      {/* Pas d'overflow-hidden ici : la poignée déborde à gauche du cadre au lieu de cacher le texte. */}
      <div className="relative rounded-lg" style={{ aspectRatio: "9 / 16" }}>
        <StoryFramePreview html={html} title={`Aperçu story ${storyIndex + 1}`} width={width} />
        <button
          type="button"
          aria-label={mode === "text" ? `Déplacer le texte de la story ${storyIndex + 1}` : `Recadrer la photo de la story ${storyIndex + 1}`}
          className={`absolute inset-0 z-10 touch-none select-none rounded-lg ${mode === "text" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          {mode === "text" && (
            // Poignée posée sur un bord, à la hauteur du texte : elle montre
            // où est le bloc sans recouvrir de mots (elle était au milieu du texte).
            <span
              aria-hidden="true"
              data-story-text-handle={handleRight ? "right" : "left"}
              className={`absolute ${handleRight ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2"} grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-primary text-white shadow-lg`}
              style={{ top: `${handleY}%` }}
            >
              <Move className="h-3 w-3" />
            </span>
          )}
        </button>
      </div>
      {/* Consigne sous l'aperçu, plus par-dessus (elle cachait le haut de la story). */}
      <p className="text-center text-2xs text-muted-foreground">
        {mode === "text" ? "Glisse le texte sur l'aperçu" : "Fais glisser la photo sur l'aperçu"}
      </p>

      <div className="grid grid-cols-2 gap-1">
        <Button
          type="button"
          size="sm"
          variant={mode === "text" ? "secondary" : "outline"}
          className="h-7 gap-1 px-1 text-[10px]"
          onClick={() => setMode("text")}
        >
          <Type className="h-3 w-3" /> Texte
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "photo" ? "secondary" : "outline"}
          className="h-7 gap-1 px-1 text-[10px]"
          disabled={!photoEnabled}
          onClick={() => setMode("photo")}
        >
          <Crop className="h-3 w-3" /> Photo
        </Button>
      </div>

      {mode === "photo" && photoEnabled && (
        <div className="space-y-1 rounded-lg border border-border bg-background/90 p-2">
          <label htmlFor={`story-${storyIndex}-photo-zoom`} className="flex justify-between text-[10px] text-muted-foreground">
            <span>Zoom</span><span>{Math.round(viewport.photoZoom * 100)} %</span>
          </label>
          <input
            id={`story-${storyIndex}-photo-zoom`}
            aria-label={`Zoom de la photo de la story ${storyIndex + 1}`}
            type="range"
            min="100"
            max="200"
            step="5"
            value={Math.round(viewport.photoZoom * 100)}
            onChange={(event) => onPhotoZoom(Number(event.target.value) / 100)}
            className="w-full accent-primary"
          />
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 w-full gap-1 text-[10px] text-muted-foreground"
        onClick={() => onReset(mode)}
      >
        <RotateCcw className="h-3 w-3" /> Réinitialiser {mode === "text" ? "le texte" : "la photo"}
      </Button>
    </div>
  );
}
