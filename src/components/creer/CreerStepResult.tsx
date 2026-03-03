import { Loader2, Pencil, CalendarDays, Copy, Download, RefreshCw, RotateCcw, Palette, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import CarouselResult from "@/components/creer/formatRenderers/CarouselResult";
import ReelResult from "@/components/creer/formatRenderers/ReelResult";
import StoryResult from "@/components/creer/formatRenderers/StoryResult";
import PostResult from "@/components/creer/formatRenderers/PostResult";
import LinkedInResult from "@/components/creer/formatRenderers/LinkedInResult";
import NewsletterResult from "@/components/creer/formatRenderers/NewsletterResult";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Props {
  result: any;
  format: string;
  generating: boolean;
  onEdit: () => void;
  onReset: () => void;
  onRegenerate: () => void;
  onCopy: (text: string) => void;
  onSave?: () => void;
  onCalendar?: () => void;
  calendarLabel?: string;
  onGenerateVisuals?: () => void;
  visualLoading?: boolean;
  visualSlides?: { slide_number: number; html: string }[];
  onExportPptx?: () => void;
  onExportVisualPptx?: () => void;
  onSlidesUpdate?: (slides: any[], caption: any) => void;
  onStoriesUpdate?: (stories: any[]) => void;
}

const LOADING_MESSAGES: Record<string, string> = {
  carousel: "Création de ton carrousel…",
  reel: "Écriture de ton script Reel…",
  story: "Préparation de ta séquence Stories…",
  post: "Rédaction de ton post…",
  linkedin: "Rédaction de ton post LinkedIn…",
  newsletter: "Rédaction de ta newsletter…",
};

export default function CreerStepResult({
  result,
  format,
  generating,
  onEdit,
  onReset,
  onRegenerate,
  onCopy,
  onSave,
  onCalendar,
  calendarLabel,
  onGenerateVisuals,
  visualLoading,
  visualSlides,
  onExportPptx,
  onExportVisualPptx,
  onSlidesUpdate,
  onStoriesUpdate,
}: Props) {
  if (generating) {
    return (
      <div className="py-12 text-center animate-fade-in space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm font-medium text-foreground">
          {LOADING_MESSAGES[format] || "Génération en cours…"}
        </p>
        <p className="text-xs text-muted-foreground">Quelques secondes.</p>
      </div>
    );
  }

  if (!result) return null;

  const renderResult = () => {
    switch (format) {
      case "carousel":
        return <CarouselResult result={result} visualSlides={visualSlides} onSlidesUpdate={onSlidesUpdate} />;
      case "reel":
        return <ReelResult result={result} />;
      case "story":
        return <StoryResult result={result} onStoriesUpdate={onStoriesUpdate} />;
      case "post":
        return <PostResult result={result} />;
      case "linkedin":
        return <LinkedInResult result={result} />;
      case "newsletter":
        return <NewsletterResult result={result} />;
      default:
        return <PostResult result={result} />;
    }
  };

  const hasVisuals = !!(visualSlides && visualSlides.length > 0);
  const isCarousel = format === "carousel";

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 1. Contenu (slides, caption, visuels, etc.) */}
      {renderResult()}

      {/* 2. Peaufiner */}

      {/* 3. CTAs principaux */}
      {isCarousel && !hasVisuals ? (
        <div className="grid grid-cols-2 gap-3">
          {onGenerateVisuals && (
            <Button
              onClick={onGenerateVisuals}
              disabled={visualLoading}
              className="h-11 gap-2 text-sm font-semibold"
            >
              {visualLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Palette className="h-4 w-4" />
              )}
              {visualLoading ? "Création..." : "Créer les visuels"}
            </Button>
          )}
          {onCalendar && (
            <Button
              variant="outline"
              onClick={onCalendar}
              className="h-11 gap-2 text-sm font-semibold"
            >
              <CalendarDays className="h-4 w-4" /> {calendarLabel || "Ajouter au calendrier"}
            </Button>
          )}
        </div>
      ) : (
        onCalendar && (
          <Button onClick={onCalendar} className="w-full gap-2 h-11 text-sm font-semibold">
            <CalendarDays className="h-4 w-4" /> {calendarLabel || "Ajouter au calendrier"}
          </Button>
        )
      )}

      {/* 4. Actions secondaires */}
      <div className="flex items-center justify-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => onCopy(JSON.stringify(result, null, 2))} className="gap-1.5 text-xs text-muted-foreground">
          <Copy className="h-3.5 w-3.5" /> Copier
        </Button>
        {isCarousel && hasVisuals && onExportPptx && (
          onExportVisualPptx ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
                  <Download className="h-3.5 w-3.5" /> Exporter <ChevronDown className="h-3 w-3 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onExportVisualPptx}>
                  Visuels (images fidèles)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportPptx}>
                  Éditable (PowerPoint)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="ghost" size="sm" onClick={onExportPptx} className="gap-1.5 text-xs text-muted-foreground">
              <Download className="h-3.5 w-3.5" /> Export PPTX
            </Button>
          )
        )}
        {isCarousel && hasVisuals && onGenerateVisuals && (
          <Button variant="ghost" size="sm" onClick={onGenerateVisuals} className="gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" /> Regénérer visuels
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5 text-xs text-muted-foreground">
          <RotateCcw className="h-3.5 w-3.5" /> Nouveau contenu
        </Button>
      </div>
    </div>
  );
}
