import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Crop, Move, RotateCcw, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import StoryFramePreview from "@/components/stories/StoryFramePreview";
import { resolveStoryViewport, type StoryVisualPlan } from "@/lib/story-visual";

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
}

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
}: Props) {
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
  const handleX = Number.isFinite(visual.text_position_x) ? viewport.textX : 50;
  const handleY = Number.isFinite(visual.text_position_y) ? viewport.textY : defaultTextY;

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
    <div className="w-[170px] shrink-0 space-y-2" data-story-direct-controls={storyIndex + 1}>
      <div className="relative overflow-hidden rounded-lg" style={{ aspectRatio: "9 / 16" }}>
        <StoryFramePreview html={html} title={`Aperçu story ${storyIndex + 1}`} width={170} />
        <button
          type="button"
          aria-label={mode === "text" ? `Déplacer le texte de la story ${storyIndex + 1}` : `Recadrer la photo de la story ${storyIndex + 1}`}
          className={`absolute inset-0 z-10 touch-none select-none ${mode === "text" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <span className="absolute left-2 right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-center text-[10px] font-medium text-white backdrop-blur-sm">
            {mode === "text" ? "Glisse le texte" : "Fais glisser la photo"}
          </span>
          {mode === "text" && (
            <span
              aria-hidden="true"
              className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-primary text-white shadow-lg"
              style={{ left: `${handleX}%`, top: `${handleY}%` }}
            >
              <Move className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </div>

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
