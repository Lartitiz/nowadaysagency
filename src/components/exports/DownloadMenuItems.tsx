import { ImageIcon, FileText, Loader2, Sparkles, Image as ImageLucide } from "lucide-react";
import { DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

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
  /** Logo de marque disponible (déclenche l'affichage de la checkbox). */
  logoAvailable?: boolean;
  /** État de la case "Ajouter mon logo" (contrôlée par le parent). */
  includeLogo?: boolean;
  onIncludeLogoChange?: (value: boolean) => void;
}

/**
 * Items menu téléchargement unifiés (calendrier + atelier).
 * Toujours 2 options strictement identiques :
 *  1. Images PNG  — à publier directement
 *  2. PowerPoint éditable ✨ — texte modifiable, fond préservé
 *     → peut être affiché grisé avec une raison via `pptxDisabledReason`
 *
 * Optionnel : checkbox "Ajouter mon logo" si la charte contient un logo.
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
  logoAvailable,
  includeLogo,
  onIncludeLogoChange,
}: Props) {
  const showPptxDisabled = !!pptxDisabledReason && !onPptxEditable;

  return (
    <>
      {logoAvailable && onIncludeLogoChange && (
        <>
          <DropdownMenuCheckboxItem
            checked={!!includeLogo}
            onCheckedChange={(v) => onIncludeLogoChange(!!v)}
            onSelect={(e) => e.preventDefault()}
          >
            <ImageLucide className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <span className="text-xs">Ajouter mon logo</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
        </>
      )}
      {onPng && (
        <DropdownMenuItem onClick={onPng} disabled={downloadingPng}>
          {downloadingPng ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ImageIcon className="h-4 w-4 mr-2" />
          )}
          <div className="flex flex-col">
            <span>Images PNG{count > 1 ? " (ZIP)" : ""}</span>
            <span className="text-2xs text-muted-foreground">
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
            <span>PowerPoint : éditable ✨</span>
            <span className="text-2xs text-muted-foreground">
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
              <span>PowerPoint : éditable ✨</span>
              <span className="text-2xs text-muted-foreground whitespace-normal max-w-[220px] leading-snug">
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
