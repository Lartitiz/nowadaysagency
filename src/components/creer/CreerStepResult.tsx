import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import CarouselResult from "@/components/creer/formatRenderers/CarouselResult";
import ReelResult from "@/components/creer/formatRenderers/ReelResult";
import StoryResult from "@/components/creer/formatRenderers/StoryResult";
import PostResult from "@/components/creer/formatRenderers/PostResult";
import LinkedInResult from "@/components/creer/formatRenderers/LinkedInResult";

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

  const commonProps = {
    result,
    onCopy: () => onCopy(JSON.stringify(result, null, 2)),
    onRegenerate,
    onReset,
    onSave,
    onCalendar,
  };

  const renderResult = () => {
    switch (format) {
      case "carousel":
        return <CarouselResult {...commonProps} />;
      case "reel":
        return <ReelResult {...commonProps} />;
      case "story":
        return <StoryResult {...commonProps} />;
      case "post":
        return <PostResult {...commonProps} />;
      case "linkedin":
        return <LinkedInResult {...commonProps} />;
      default:
        return <PostResult {...commonProps} />;
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {renderResult()}
      <Button variant="outline" size="sm" onClick={onEdit} className="w-full gap-1.5">
        <Pencil className="h-3.5 w-3.5" /> Peaufiner
      </Button>
    </div>
  );
}
