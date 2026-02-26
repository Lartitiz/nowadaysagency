import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus } from "lucide-react";
import { useState } from "react";

interface Props {
  dateStr: string;
  onAddIdea: (dateStr: string) => void;
  children?: React.ReactNode;
}

const FORMATS = [
  { id: "post", emoji: "📝", label: "Post", route: "/creer" },
  { id: "carousel", emoji: "🎠", label: "Carrousel", route: "/instagram/carousel" },
  { id: "reel", emoji: "🎬", label: "Reel", route: "/instagram/reels" },
  { id: "story", emoji: "📱", label: "Story", route: "/instagram/stories" },
  { id: "linkedin", emoji: "💼", label: "LinkedIn", route: "/linkedin/post" },
];

export function AddPostMenu({ dateStr, onAddIdea, children }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleFormat = (route: string) => {
    setOpen(false);
    navigate(`${route}?calendar_date=${dateStr}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children || (
          <button className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary">
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1.5" align="start">
        <p className="text-[10px] font-semibold text-muted-foreground px-2 py-1">
          + Ajouter pour le {new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
        </p>
        {FORMATS.map(f => (
          <button key={f.id} onClick={() => handleFormat(f.route)}
            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted/50 transition-colors">
            {f.emoji} {f.label}
          </button>
        ))}
        <div className="border-t border-border my-1" />
        <button onClick={() => { setOpen(false); onAddIdea(dateStr); }}
          className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground">
          💡 Juste une idée
        </button>
      </PopoverContent>
    </Popover>
  );
}
