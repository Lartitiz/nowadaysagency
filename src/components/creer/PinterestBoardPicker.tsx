import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PinterestBoardsState } from "@/hooks/use-creer-pinterest-publish";

/** Choix du tableau Pinterest, dans la fenêtre « Publier » de /creer. */
export default function PinterestBoardPicker({ boards, loading, error, selectedBoardId, onSelect, onRetry }: PinterestBoardsState) {
  if (loading) {
    return (
      <p className="text-xs text-muted-foreground px-1 flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" /> Lecture de tes tableaux Pinterest…
      </p>
    );
  }
  if (error) {
    return (
      <div className="px-1 space-y-1.5" data-testid="pinterest-boards-error">
        <p className="text-xs text-amber-700">{error}</p>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Relire mes tableaux
        </Button>
      </div>
    );
  }
  if (boards.length === 0) {
    return (
      <div className="px-1 space-y-1.5">
        <p className="text-xs text-amber-700">
          Ton compte Pinterest n'a pas encore de tableau. Crée-en un sur Pinterest, puis relis tes tableaux.
        </p>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Relire mes tableaux
        </Button>
      </div>
    );
  }
  return (
    <label className="block px-1 space-y-1">
      <span className="block text-xs font-medium text-foreground">Tableau où ranger l'épingle</span>
      <select
        data-testid="pinterest-board-select"
        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        value={selectedBoardId ?? ""}
        onChange={(e) => onSelect(e.target.value)}
      >
        {!selectedBoardId && <option value="">Choisir un tableau</option>}
        {boards.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </label>
  );
}
