import { Button } from "@/components/ui/button";
import type { Prospect } from "./ProspectionSection";
import { MessageCircle, SkipForward } from "lucide-react";

interface Props {
  reminders: Prospect[];
  onSelect: (p: Prospect) => void;
  onPostpone: (id: string) => void;
}

export default function ProspectionReminders({ reminders, onSelect, onPostpone }: Props) {
  return (
    <div className="rounded-xl border-2 border-primary/20 bg-rose-pale/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold">📅 Aujourd'hui</span>
        <span className="text-xs text-muted-foreground">
          🔔 {reminders.length} relance{reminders.length > 1 ? "s" : ""} à faire
        </span>
      </div>
      {reminders.map(p => (
        <div key={p.id} className="flex items-center gap-2 text-sm">
          <span className="flex-1 min-w-0 truncate">
            <span className="font-mono font-semibold text-primary">@{p.instagram_username}</span>
            {p.next_reminder_text && (
              <span className="text-muted-foreground"> · {p.next_reminder_text}</span>
            )}
          </span>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onSelect(p)}>
            <MessageCircle className="h-3 w-3 mr-1" /> Écrire
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onPostpone(p.id)}>
            <SkipForward className="h-3 w-3 mr-1" /> Demain
          </Button>
        </div>
      ))}
    </div>
  );
}
