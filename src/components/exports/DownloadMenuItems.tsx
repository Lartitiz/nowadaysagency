import { ImageIcon, FileText, Loader2 } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

interface Props {
  onPng?: () => void;
  onPptxEditable?: () => void;
  downloadingPng?: boolean;
  downloadingPptx?: boolean;
  /** Nombre de slides — sert à afficher "(ZIP)" si >1 */
  count?: number;
}

/**
 * Items menu téléchargement unifiés (calendrier + atelier).
 * Toujours 2 options strictement identiques :
 *  1. Images PNG  — à publier directement
 *  2. PowerPoint éditable ✨ — texte modifiable, fond préservé
 */
export function DownloadMenuItems({
  onPng,
  onPptxEditable,
  downloadingPng,
  downloadingPptx,
  count = 1,
}: Props) {
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
    </>
  );
}
