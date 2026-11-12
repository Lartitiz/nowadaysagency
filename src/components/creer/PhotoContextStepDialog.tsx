import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PHOTO_CONTEXT_TEXT_MAX, hasCompletePair, setPairRole,
  type ContextStepRow, type PairRole,
} from "@/features/creer/photo-context-step";

export interface PhotoContextStepDialogProps {
  open: boolean;
  previews: string[];
  rows: ContextStepRow[];
  onRowsChange: (rows: ContextStepRow[]) => void;
  onConfirm: () => void;
  onSkip: () => void;
  onCancel: () => void;
}

const ROLE_LABEL: Record<PairRole, string> = { before: "C'est l'avant", after: "C'est l'après" };

/**
 * Étape légère avant la création d'un carrousel photo / mixte : une ligne par
 * photo (pré-remplie quand on peut le deviner gratuitement) et la paire
 * avant / après. « Passer » lance la création sans rien changer.
 */
export default function PhotoContextStepDialog({ open, previews, rows, onRowsChange, onConfirm, onSkip, onCancel }: PhotoContextStepDialogProps) {
  const canPair = rows.length >= 2;
  const pairDone = hasCompletePair(rows);
  const halfPair = !pairDone && rows.some((r) => r.role);
  const update = (i: number, patch: Partial<ContextStepRow>) =>
    onRowsChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-[20px]" data-testid="photo-context-step">
        <DialogHeader>
          <DialogTitle className="font-display font-normal">Que montre chaque photo ?</DialogTitle>
          <DialogDescription>
            Une ligne suffit. Je m'en sers pour mettre chaque photo sur le bon texte.
          </DialogDescription>
        </DialogHeader>

        {canPair && (
          <p className="rounded-2xl bg-[#FFF4F8] px-4 py-3 text-sm text-foreground">
            Deux de ces photos sont un avant/après ? Marque l'avant et l'après : je les place sur deux slides qui se suivent.
          </p>
        )}

        <ol className="space-y-3">
          {rows.map((row, i) => (
            <li key={row.key} className="flex gap-3 rounded-2xl border border-border bg-background p-3">
              {previews[i] ? (
                <img src={previews[i]} alt={`Photo ${i + 1}`} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="h-16 w-16 shrink-0 rounded-xl bg-muted" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <label htmlFor={`photo-ctx-${i}`} className="block text-xs font-medium text-muted-foreground">
                  Photo {i + 1} : que montre-t-elle ?
                </label>
                <Input
                  id={`photo-ctx-${i}`}
                  value={row.text}
                  maxLength={PHOTO_CONTEXT_TEXT_MAX}
                  placeholder="Ex. : la cuisine avant les travaux"
                  onChange={(e) => update(i, { text: e.target.value, suggested: false })}
                />
                {row.suggested && (
                  <p className="text-xs text-muted-foreground">Suggestion à vérifier : corrige-la si besoin.</p>
                )}
                {canPair && (
                  <div className="flex flex-wrap gap-2">
                    {(["before", "after"] as PairRole[]).map((role) => (
                      <button
                        key={role}
                        type="button"
                        aria-pressed={row.role === role}
                        onClick={() => onRowsChange(setPairRole(rows, i, role))}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          row.role === role
                            ? "border-[#FB3D80] bg-[#FB3D80] text-white"
                            : "border-border bg-background text-muted-foreground hover:border-[#FFA7C6]"
                        }`}
                      >
                        {ROLE_LABEL[role]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        {halfPair && (
          <p className="text-xs text-muted-foreground">Marque aussi l'autre photo de la paire, sinon je ne les relie pas.</p>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onSkip} className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Passer
          </button>
          <Button onClick={onConfirm}>Créer mon carrousel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
