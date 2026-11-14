import type { DragEvent as ReactDragEvent } from "react";
import { Globe, Images, Library, Loader2, Sparkles, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Trois gros boutons côte à côte pour ajouter les photos d'un carrousel : Mes photos,
 * L'app choisit, Importer (qui reçoit aussi les photos glissées). Site / Instagram et
 * photos libres de droit en liens dessous. Maquette validée par Laetitia le 14/11/2026.
 */
type DropHandlers = {
  onDragEnter: (e: ReactDragEvent) => void;
  onDragLeave: (e: ReactDragEvent) => void;
  onDragOver: (e: ReactDragEvent) => void;
  onDrop: (e: ReactDragEvent) => void;
};

const tile = "flex flex-col items-center gap-1 rounded-xl border-2 bg-card px-2 py-3 text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const link = "inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed";

export default function PhotoSourceTiles(p: {
  libraryCount: number;
  isFull: boolean;
  importing: boolean;
  autoPicking: boolean;
  canAutoPick: boolean;
  /** « L'app choisit » pioche d'abord dans Mes photos. */
  libraryFirstPick: boolean;
  isDragOver: boolean;
  onLibrary: () => void;
  onAutoPick: () => void;
  onImport: () => void;
  dropHandlers: DropHandlers;
  onSite: () => void;
  onStock: () => void;
}) {
  return (
    <div className="space-y-2" data-testid="photo-zone-tiles">
      <div className="grid grid-cols-3 gap-2">
        <button type="button" data-testid="photo-zone-library-main" onClick={p.onLibrary} disabled={p.isFull || p.importing} className={cn(tile, "border-border hover:border-primary/40")}>
          {p.importing ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Library className="h-5 w-5 text-primary" />}
          <span className="text-sm font-semibold text-foreground">Mes photos</span>
          <span className="text-2xs text-muted-foreground">{p.importing ? "Import…" : p.libraryCount > 0 ? `${p.libraryCount} photo${p.libraryCount > 1 ? "s" : ""}` : "Ta photothèque"}</span>
        </button>
        <button type="button" data-testid="photo-zone-auto-pick" onClick={p.onAutoPick} disabled={p.isFull || p.autoPicking || !p.canAutoPick} className={cn(tile, "border-border hover:border-primary/40")}>
          {p.autoPicking ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Sparkles className="h-5 w-5 text-primary" />}
          <span className="text-sm font-semibold text-foreground">L'app choisit</span>
          <span className="text-2xs text-muted-foreground">{p.autoPicking ? "Je cherche…" : p.libraryFirstPick ? "Dans tes photos d'abord" : "Photos libres de droit"}</span>
        </button>
        <button type="button" data-testid="photo-zone-import" onClick={() => !p.isFull && p.onImport()} disabled={p.isFull} {...p.dropHandlers}
          className={cn(tile, p.isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
          <Upload className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold text-foreground">Importer</span>
          <span className="text-2xs text-muted-foreground">{p.isDragOver ? "Dépose ici" : "Ordi, téléphone"}</span>
        </button>
      </div>
      <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1.5">
        <button type="button" onClick={p.onSite} disabled={p.isFull || p.importing} className={link}>
          <Globe className="h-3.5 w-3.5" /> Depuis mon site ou Instagram
        </button>
        <button type="button" onClick={p.onStock} disabled={p.isFull} className={link}>
          <Images className="h-3.5 w-3.5" /> Photos libres de droit
        </button>
      </div>
    </div>
  );
}
