import { ImageIcon, FileText, Loader2, Sparkles } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

interface Props {
  onPng?: () => void;
  onPptxEditable?: () => void;
  downloadingPng?: boolean;
  downloadingPptx?: boolean;
  /** Nombre de slides — sert à afficher "(ZIP)" si >1 */
  count?: number;
  /**
   * Quand fourni, l'item PowerPoint éditable est affiché grisé (non cliquable)
   * avec cette raison en sous-texte. Utile pour expliquer pourquoi l'export
   * éditable n'est pas disponible (ex: HTML source manquant pour vieux post).
   */
  pptxDisabledReason?: string;
  /** CTA optionnel affiché sous l'item grisé (ex: "Régénérer le carrousel"). */
  onPptxRegenerate?: () => void;
  pptxRegenerateLabel?: string;
}

/**
 * Items menu téléchargement unifiés (calendrier + atelier).
 * Toujours 2 options strictement identiques :
 *  1. Images PNG  — à publier directement
 *  2. PowerPoint éditable ✨ — texte modifiable, fond préservé
 *     → peut être affiché grisé avec une raison via `pptxDisabledReason`
 */
export function DownloadMenuItems({
  onPng,
  onPptxEditable,
  downloadingPng,
  downloadingPptx,
  count = 1,
  pptxDisabledReason,
  onPptxRegenerate,
  pptxRegenerateLabel = "Régénérer le carrousel",
}: Props) {
  const showPptxDisabled = !!pptxDisabledReason && !onPptxEditable;

  return (
    <>
      {onPng && (
        <DropdownMenuItem onClick={onPng} disabled={downloadingPng}>
          {downloadingPng ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ImageIcon className="h-4 w-4 mr-2" />
          )}
          <div className="flex flex-col">
            <span>Images PNG{count > 1 ? " (ZIP)" : ""}</span>
            <span className="text-[10px] text-muted-foreground">
              À publier directement
            </span>
          </div>
        </DropdownMenuItem>
      )}
      {onPptxEditable && (
        <DropdownMenuItem onClick={onPptxEditable} disabled={downloadingPptx}>
          {downloadingPptx ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileText className="h-4 w-4 mr-2" />
          )}
          <div className="flex flex-col">
            <span>PowerPoint — éditable ✨</span>
            <span className="text-[10px] text-muted-foreground">
              Modifie le texte dans PowerPoint, fond préservé
            </span>
          </div>
        </DropdownMenuItem>
      )}
      {showPptxDisabled && (
        <>
          <DropdownMenuItem disabled className="opacity-60 cursor-not-allowed">
            <FileText className="h-4 w-4 mr-2" />
            <div className="flex flex-col">
              <span>PowerPoint — éditable ✨</span>
              <span className="text-[10px] text-muted-foreground whitespace-normal max-w-[220px] leading-snug">
                {pptxDisabledReason}
              </span>
            </div>
          </DropdownMenuItem>
          {onPptxRegenerate && (
            <DropdownMenuItem onClick={onPptxRegenerate}>
              <Sparkles className="h-4 w-4 mr-2 text-primary" />
              <span className="text-primary font-medium">{pptxRegenerateLabel}</span>
            </DropdownMenuItem>
          )}
        </>
      )}
    </>
  );
}
