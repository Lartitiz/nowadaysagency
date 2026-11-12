// Stories comme le carrousel (12/11/2026) : les vignettes des stories à gauche,
// comme celles des slides. On touche une vignette pour l'ouvrir ; sous la story
// ouverte, monter / descendre / dupliquer ; en bas, Ajouter et Supprimer.
// Téléphone : une rangée de vignettes qui défile, les gestes sont dans « … ».
// Remplace la rangée de numéros (StoryNav) : mêmes noms de boutons.
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { MAX_STORIES } from "@/lib/story-sequence-ops";
import StoryFramePreview from "@/components/stories/StoryFramePreview";

const ICON_BTN = "h-7 w-7 p-0 text-muted-foreground hover:text-foreground";

export default function StoryStrip({ frames, current, onChange, onMove, onDuplicate, onAdd, onDelete }: {
  frames: (string | null)[];
  current: number;
  onChange: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: (index: number) => void;
  onAdd: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  const isMobile = useIsMobile();
  const count = frames.length;
  const full = count >= MAX_STORIES;
  const fullTitle = full ? `${MAX_STORIES} stories au plus dans une séquence` : undefined;
  const width = isMobile ? 40 : 64;
  return (
    <nav aria-label="Choisir la story à régler" className="min-w-0 space-y-2" data-story-strip>
      <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {frames.map((html, i) => (
          <li key={i} className="flex shrink-0 flex-col items-center gap-1">
            <button
              type="button"
              aria-label={`Voir la story ${i + 1}`}
              aria-current={i === current ? "step" : undefined}
              onClick={() => onChange(i)}
              className={`flex flex-col items-center gap-0.5 rounded-lg border-2 p-0.5 text-2xs font-semibold ${i === current ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:border-primary/40"}`}
            >
              {html ? (
                <StoryFramePreview html={html} title={`Vignette story ${i + 1}`} width={width} className="pointer-events-none" />
              ) : (
                <span className="grid place-items-center rounded-lg border bg-muted text-muted-foreground" style={{ width, aspectRatio: "9 / 16" }}>🎥</span>
              )}
              <span>{i + 1}</span>
            </button>
            {i === current && !isMobile && (
              <div className="flex items-center" role="group" aria-label={`Organiser la story ${i + 1}`}>
                {count > 1 && (
                  <>
                    <Button type="button" variant="ghost" size="sm" className={ICON_BTN} disabled={i === 0} title="Monter"
                      aria-label={`Placer la story ${i + 1} avant la story ${i}`} onClick={() => onMove(i, i - 1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className={ICON_BTN} disabled={i === count - 1} title="Descendre"
                      aria-label={`Placer la story ${i + 1} après la story ${i + 2}`} onClick={() => onMove(i, i + 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                <Button type="button" variant="ghost" size="sm" className={ICON_BTN} disabled={full} title={fullTitle ?? "Dupliquer"}
                  aria-label={`Dupliquer la story ${i + 1}`} onClick={() => onDuplicate(i)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>
      {!isMobile && (
        <div className="flex gap-1.5 lg:flex-col">
          <Button type="button" variant="outline" size="sm" className="h-auto justify-start gap-1.5 whitespace-normal py-1.5 text-left text-xs" disabled={full} title={fullTitle}
            aria-label={`Ajouter une story après la story ${current + 1}`} onClick={() => onAdd(current)}>
            <Plus className="h-3.5 w-3.5 shrink-0" /> Ajouter une story
          </Button>
          {count > 1 && (
            <Button type="button" variant="outline" size="sm" className="h-auto justify-start gap-1.5 whitespace-normal py-1.5 text-left text-xs hover:text-destructive"
              onClick={() => onDelete(current)}>
              <Trash2 className="h-3.5 w-3.5 shrink-0" /> Supprimer la story
            </Button>
          )}
        </div>
      )}
    </nav>
  );
}
