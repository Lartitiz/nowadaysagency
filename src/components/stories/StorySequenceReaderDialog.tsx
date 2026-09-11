import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import StoryFramePreview from "@/components/stories/StoryFramePreview";
import type { StoryFrameStory } from "@/lib/story-visual";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stories: StoryFrameStory[];
  frames: (string | null)[];
}

function storyText(story: StoryFrameStory): string {
  return String(story.text || story.texte || story.content || "").trim();
}

/** Lecture plein écran, story par story, pour juger le fil avant publication. */
export default function StorySequenceReaderDialog({ open, onOpenChange, stories, frames }: Props) {
  const [active, setActive] = useState(0);
  const last = Math.max(0, stories.length - 1);

  useEffect(() => {
    if (open) setActive(0);
  }, [open]);

  const go = (delta: number) => setActive((current) => Math.min(last, Math.max(0, current + delta)));
  const story = stories[active];
  const frame = frames[active];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[min(94vw,470px)] max-w-none max-h-[96vh] overflow-y-auto bg-neutral-950 border-white/15 p-3 text-white"
        data-story-sequence-reader
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") go(-1);
          if (event.key === "ArrowRight") go(1);
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Lire la séquence</DialogTitle>
          <DialogDescription>Prévisualise les stories à la suite avant de les publier.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 px-1" aria-label={`Story ${active + 1} sur ${stories.length}`}>
          {stories.map((_item, index) => (
            <button
              type="button"
              key={index}
              onClick={() => setActive(index)}
              aria-label={`Voir la story ${index + 1}`}
              className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"
            >
              <span className={`block h-full w-full rounded-full ${index <= active ? "bg-white" : "bg-transparent"}`} />
            </button>
          ))}
        </div>

        <div
          className="relative mx-auto h-[min(76vh,693px)] max-w-full overflow-hidden rounded-2xl bg-neutral-900"
          style={{ aspectRatio: "9 / 16" }}
        >
          {frame ? (
            <StoryFramePreview html={frame} title={`Lecture story ${active + 1}`} fluid className="h-full border-0 rounded-2xl" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-5 px-10 text-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
                <Video className="h-4 w-4" /> Face caméra
              </span>
              <p className="text-lg font-semibold leading-relaxed">{storyText(story)}</p>
              <p className="text-xs text-white/60">C’est le texte à dire. Pense aux sous-titres dans Instagram.</p>
            </div>
          )}

          <button
            type="button"
            aria-label="Story précédente"
            disabled={active === 0}
            onClick={() => go(-1)}
            className="absolute inset-y-0 left-0 z-10 w-1/3 cursor-w-resize disabled:cursor-default"
          />
          <button
            type="button"
            aria-label="Story suivante"
            disabled={active === last}
            onClick={() => go(1)}
            className="absolute inset-y-0 right-0 z-10 w-1/3 cursor-e-resize disabled:cursor-default"
          />
        </div>

        <div className="flex items-center justify-between gap-3 px-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => go(-1)}
            disabled={active === 0}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Précédente
          </Button>
          <span className="text-xs font-medium text-white/70">{active + 1} / {stories.length}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => go(1)}
            disabled={active === last}
            className="gap-1"
          >
            Suivante <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
