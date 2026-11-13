// Fiche du calendrier d'une série de stories (13/11/2026). Avant, la fiche
// montrait un grand texte modifiable (« SÉQUENCE À PUBLIER… STORY 1… ») qui
// n'agissait pas sur les visuels, et le bouton de l'éditeur était caché en
// dessous. Ici : les stories en vignettes (un clic ouvre l'éditeur sur cette
// story), ce qui reste à préparer, comment publier, et le texte en lecture seule.
import { useState } from "react";
import { ChevronDown, Copy, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import StoryFramePreview from "@/components/stories/StoryFramePreview";
import { useStoryFrames } from "@/hooks/use-story-frames";
import { storiesPhotosToTake, storiesPublicationMoment } from "@/lib/calendar-story-open";
import { cn } from "@/lib/utils";

interface Props {
  detail: any;
  contentDraft: string | null;
  isPublished: boolean;
  onOpenEditor: (storyIndex?: number) => void;
  onCopy: () => void;
}

export function CalendarStoriesOverview({ detail, contentDraft, isPublished, onOpenEditor, onCopy }: Props) {
  const stories: any[] = Array.isArray(detail?.stories) ? detail.stories : [];
  const frames = useStoryFrames(stories, stories.length > 0);
  const toPrepare = isPublished ? [] : storiesPhotosToTake(stories);
  const moment = storiesPublicationMoment(detail);
  const [showText, setShowText] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">
          📱 {stories.length === 1 ? "Ta story" : `Tes ${stories.length} stories`}
        </p>
        <Button size="sm" onClick={() => onOpenEditor()} className="rounded-pill gap-1.5">
          <Pencil className="h-3.5 w-3.5" /> Modifier les stories
        </Button>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
        {stories.map((story, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onOpenEditor(i)}
            aria-label={`Modifier la story ${i + 1}`}
            title={`Modifier la story ${i + 1}`}
            className="group text-left min-w-0"
          >
            <div className="rounded-lg overflow-hidden border border-border group-hover:border-primary group-focus-visible:ring-2 group-focus-visible:ring-primary transition-colors pointer-events-none">
              {frames[i] ? (
                <StoryFramePreview html={frames[i] as string} title={`Story ${i + 1}`} fluid className="border-0 rounded-none" />
              ) : (
                <div className="aspect-[9/16] bg-muted/40 flex items-center justify-center p-2 text-2xs text-center text-muted-foreground leading-snug">
                  {story?.face_cam ? "🎥 Face caméra" : String(story?.text || story?.texte || "").slice(0, 80) || `Story ${i + 1}`}
                </div>
              )}
            </div>
            <p className="mt-1 text-2xs text-muted-foreground truncate">
              {i + 1}{story?.format_label || story?.format ? ` · ${story.format_label || story.format}` : ""}
            </p>
          </button>
        ))}
      </div>
      <p className="text-2xs text-muted-foreground -mt-2">Clique sur une story pour l'ouvrir directement dans l'éditeur.</p>

      {toPrepare.length > 0 && (
        <div className="rounded-[10px] border border-border p-3">
          <p className="text-xs font-semibold text-foreground mb-1.5">📷 À préparer avant de publier</p>
          <ul className="space-y-1 text-xs text-foreground">
            {toPrepare.map((item) => (
              <li key={item.number}>Story {item.number} : {item.directive}</li>
            ))}
          </ul>
        </div>
      )}

      {!isPublished && (
        <div className="rounded-[10px] bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">Comment publier : </span>
          les stories se publient depuis l'app Instagram. Télécharge-les avec le bouton « Télécharger » de l'aperçu, puis poste-les à la suite{moment ? `, ${moment}` : ""}.
        </div>
      )}

      {contentDraft && (
        <Collapsible open={showText} onOpenChange={setShowText}>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors py-1 w-full">
            <span>📄 Version texte de la séquence</span>
            <ChevronDown className={cn("h-3.5 w-3.5 ml-auto transition-transform", showText && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            <div className="rounded-[10px] border border-border bg-muted/20 p-3 text-xs leading-relaxed whitespace-pre-wrap max-h-[320px] overflow-y-auto text-foreground">
              {contentDraft}
            </div>
            <p className="text-2xs text-muted-foreground">Pour changer le texte d'une story, ouvre-la dans l'éditeur : les visuels suivront.</p>
            <Button variant="outline" size="sm" onClick={onCopy} className="rounded-pill text-xs gap-1.5">
              <Copy className="h-3 w-3" /> Copier le texte
            </Button>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
