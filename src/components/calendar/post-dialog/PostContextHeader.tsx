// En-tête de contexte de la fenêtre d'un post du calendrier : réseau, format,
// date, statut (menu), objectif et angle. Sorti de CalendarPostDialog.tsx à
// l'identique (fiche 13 de docs/robustesse/gros-fichiers.md, lot 2).
import { ChevronDown } from "lucide-react";
import { format as formatDate } from "date-fns";
import { fr } from "date-fns/locale";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, STATUSES, statusStyles, OBJECTIFS } from "@/lib/calendar-constants";
import { CANAL_META, angleLabelOf } from "@/features/calendar/post-dialog-helpers";
import { FORMAT_OPTIONS_BY_CANAL } from "../CalendarPostMetadata";

interface PostContextHeaderProps {
  postCanal: string;
  format: string | null;
  objectif: string | null;
  angle: string | null;
  selectedDate: string | null;
  status: string;
  setStatus: (status: string) => void;
}

export function PostContextHeader({ postCanal, format, objectif, angle, selectedDate, status, setStatus }: PostContextHeaderProps) {
  // En-tête de contexte : un coup d'œil sur « quel réseau · quel format · quelle date · quel statut »
  const canalMeta = CANAL_META[postCanal] || { emoji: "", label: postCanal };
  const formatMeta = format ? (FORMAT_OPTIONS_BY_CANAL[postCanal] || []).find((f) => f.id === format) : null;
  const objectifMeta = objectif ? OBJECTIFS.find((o) => o.id === objectif) : null;
  const dateLabel = selectedDate ? formatDate(new Date(selectedDate + "T00:00:00"), "EEE d MMM", { locale: fr }) : null;
  const angleLabel = angleLabelOf(angle);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-base leading-none" aria-hidden="true">{canalMeta.emoji}</span>
        <span className="text-sm font-semibold text-foreground">
          {formatMeta ? `${formatMeta.label} ${canalMeta.label}` : canalMeta.label}
        </span>
        {dateLabel && (
          <>
            <span className="text-border">·</span>
            <span className="text-xs text-muted-foreground">{dateLabel}</span>
          </>
        )}
        {/* Badge de statut cliquable : changer le statut sans ouvrir « Détails » */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn("ml-auto inline-flex items-center gap-1 rounded-pill border px-2.5 py-0.5 text-2xs font-medium transition-opacity hover:opacity-80", statusStyles[status] || "bg-card border-border text-foreground")} aria-label="Changer le statut du post">
              {STATUS_LABELS[status] || status}
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {STATUSES.map((s) => (
              <DropdownMenuItem key={s.id} onClick={() => setStatus(s.id)} className={cn(status === s.id && "font-medium text-primary")}>
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {(objectifMeta || angleLabel) && (
        <p className="text-2xs text-muted-foreground">
          {objectifMeta && <span>{objectifMeta.emoji} {objectifMeta.label}</span>}
          {objectifMeta && angleLabel && <span className="mx-1.5 text-border">·</span>}
          {angleLabel && <span>{angleLabel}</span>}
        </p>
      )}
    </div>
  );
}
