// Tiroir « Outils et créations » du Studio : photos proposées, références de
// la charte, compositions enregistrées (avec les plus anciennes), avant / après
// et mockup. Fiche 4 de docs/robustesse/gros-fichiers.md, lot 4 : JSX déplacé à
// l'identique depuis src/pages/VisualStudioPage.tsx ; la relecture d'une
// composition et la page suivante de l'historique restent dans la page
// (`onResumeComposition`, `onLoadOlderCompositions`).
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { StudioCompositionEntry, StudioReference, StudioState } from "@/features/visual-studio/api";
import type { StudioExistingTool } from "@/features/visual-studio/StudioToolDialogs";

export function StudioToolsSheet({
  open,
  onOpenChange,
  current,
  references,
  compositionHistory,
  moreCompositions,
  olderCompositionsBusy,
  writable,
  busy,
  generating,
  mutate,
  onResumeComposition,
  onLoadOlderCompositions,
  onOpenTool,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: StudioState | undefined;
  references: StudioReference[];
  compositionHistory: StudioCompositionEntry[];
  moreCompositions: boolean;
  olderCompositionsBusy: boolean;
  writable: boolean;
  busy: string;
  generating: boolean | undefined;
  mutate: (action: string, extra?: Record<string, unknown>) => Promise<unknown>;
  onResumeComposition: (entry: StudioCompositionEntry) => void;
  onLoadOlderCompositions: () => void;
  onOpenTool: (tool: Exclude<StudioExistingTool, null>) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="left" className="w-[92vw] sm:max-w-md overflow-y-auto">
      <SheetHeader><SheetTitle>Outils et créations</SheetTitle></SheetHeader>
    <div className="studio-references">
      {!!current?.suggested_photos?.length && (
        <div className="my-4">
          <h3 className="font-medium text-sm">
            Photos proposées · choisis celle qui convient
          </h3>
          <div className="studio-versions">
            {current.suggested_photos
              .filter(
                (p) =>
                  !references.some((r) => r.photo_id === p.id),
              )
              .map((photo) => (
                <button
                  type="button"
                  key={photo.id}
                  disabled={!writable || !!busy || generating}
                  onClick={() =>
                    void mutate("reference", {
                      photo_id: photo.id,
                      reference_role: "subject",
                      revision: current.session.revision,
                    })}
                >
                  <img src={photo.url} alt={photo.name} />
                  <span>Choisir {photo.name}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
    {!!current?.charter_references?.length && (
      <details className="my-4 text-sm">
        <summary>Références visuelles de ma charte</summary>
        <p className="text-xs text-muted-foreground my-2">
          Choisis une ambiance à joindre à cette demande.
        </p>
        <div className="studio-versions">
          {current.charter_references.map((r) => (
            <button
              type="button"
              key={r.index}
              disabled={!writable || !!busy || generating}
              onClick={() =>
                void mutate("reference", {
                  charter_index: r.index,
                  revision: current.session.revision,
                })}
            >
              <img src={r.url} alt={r.name} />
              <span>Utiliser {r.name}</span>
            </button>
          ))}
        </div>
      </details>
    )}
    {current && (
      <div className="flex flex-wrap gap-2 my-3">
        {!!compositionHistory.length && (
          <details className="w-full text-sm">
            <summary>Compositions enregistrées · {compositionHistory.length}{moreCompositions && current.composition_history?.length === 20 ? "+" : ""}</summary>
            <div className="flex flex-wrap gap-2 mt-2">
              {compositionHistory.map((entry) => (
                <Button
                  key={entry.id}
                  variant="outline"
                  size="sm"
                  disabled={!writable || !!busy}
                  onClick={() => onResumeComposition(entry)}
                >
                  Reprendre {entry.title.slice(0, 48) || "Composition"} · {new Date(entry.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </Button>
              ))}
            </div>
            {moreCompositions && current.composition_history?.length === 20 && (
              <Button variant="ghost" size="sm" className="mt-2" disabled={olderCompositionsBusy}
                onClick={onLoadOlderCompositions}
              >{olderCompositionsBusy ? "Chargement…" : "Voir les compositions plus anciennes"}</Button>
            )}
          </details>
        )}
        <Button
          variant="ghost"
          disabled={!writable || !!busy}
          onClick={() => { onOpenChange(false); onOpenTool("before_after"); }}
        >
          Avant / après
        </Button>
        <Button
          variant="ghost"
          disabled={!writable || !!busy}
          onClick={() => { onOpenChange(false); onOpenTool("mockup"); }}
        >
          Mockup d’offre
        </Button>
      </div>
    )}
    </SheetContent>
    </Sheet>
  );
}
