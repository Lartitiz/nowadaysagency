import { ArrowLeft, type LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  channelLabel: string;
  onChangeChannel: () => void;
  /** Format déjà choisi (par elle ou par une idée). Absent : seul le canal s'affiche. */
  formatLabel?: string | null;
  onChangeFormat?: () => void;
}

/**
 * Rappel du canal, et du format une fois choisi, avec de quoi changer l'un ou l'autre.
 * Avant le 12/11/2026, une idée qui présélectionnait « Reel » n'affichait que le canal :
 * le format choisi restait invisible et impossible à changer.
 */
export default function ChannelFormatChip({ icon: Icon, channelLabel, onChangeChannel, formatLabel, onChangeFormat }: Props) {
  return (
    <div className="rounded-xl bg-muted/30 border border-border px-3 py-2 space-y-1.5" data-testid="creer-channel-format-chip">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-bordeaux shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate">{channelLabel}</span>
        </div>
        <button type="button" onClick={onChangeChannel} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 shrink-0">
          <ArrowLeft className="h-3 w-3" /> Changer de canal
        </button>
      </div>
      {formatLabel && onChangeFormat && (
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-1.5">
          <span className="text-sm text-foreground min-w-0 truncate">
            Format : <span className="font-semibold">{formatLabel}</span>
          </span>
          <button type="button" onClick={onChangeFormat} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 shrink-0">
            <ArrowLeft className="h-3 w-3" /> Changer de format
          </button>
        </div>
      )}
    </div>
  );
}
