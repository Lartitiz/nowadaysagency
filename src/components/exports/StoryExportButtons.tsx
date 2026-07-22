/**
 * StoryExportButtons — Canva + Télécharger pour une séquence stories persistée.
 *
 * Même paire d'actions que la toolbar carrousel du calendrier : bouton Canva
 * (PPTX natif importé comme design) + menu Télécharger (Images PNG / PowerPoint
 * éditable). Branchée sur useStoryExport, qui reconstruit les visuels depuis le
 * JSON sauvegardé. Ne rend rien si aucune story n'a de visuel (vieilles
 * séquences d'avant les plans visuels, face cam only).
 */

import { Loader2, ExternalLink, Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DownloadMenuItems } from "@/components/exports/DownloadMenuItems";
import type { StoryExportApi } from "@/hooks/use-story-export";

export function StoryExportButtons({ api }: { api: StoryExportApi }) {
  if (!api.hasFrames) return null;
  return (
    <>
      <Button
        size="sm"
        onClick={api.openInCanva}
        disabled={api.openingCanva}
        className="gap-1.5 h-7 text-xs text-white border-0 hover:opacity-90"
        style={{ backgroundColor: "#FB3D80" }}
        title="Ouvrir ces stories dans Canva pour les retoucher"
        aria-label="Ouvrir dans Canva"
      >
        {api.openingCanva
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <ExternalLink className="h-3.5 w-3.5" />}
        Canva
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={api.exporting || api.exportingPptx}
            className="gap-1.5 h-7 text-xs"
            title="Télécharger les visuels des stories"
          >
            {(api.exporting || api.exportingPptx)
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />}
            Télécharger
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DownloadMenuItems
            onPng={api.exportPng}
            onPptxEditable={api.exportPptx}
            downloadingPng={api.exporting}
            downloadingPptx={api.exportingPptx}
            count={api.frameCount}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
