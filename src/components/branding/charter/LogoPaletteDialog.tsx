import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { LogoPalette } from "@/lib/extract-logo-palette";

interface Props {
  open: boolean;
  palette: LogoPalette | null;
  onClose: () => void;
  onApply: (palette: LogoPalette) => void;
}

const SLOTS: Array<{ key: keyof LogoPalette; label: string }> = [
  { key: "primary", label: "Principale" },
  { key: "secondary", label: "Secondaire" },
  { key: "accent", label: "Accent" },
  { key: "background", label: "Fond" },
  { key: "text", label: "Texte" },
];

export default function LogoPaletteDialog({ open, palette, onClose, onApply }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>🎨 On a repéré ces couleurs dans ton logo</DialogTitle>
          <DialogDescription>
            Tu veux les appliquer à ta palette de marque ? Ça remplacera tes 5 couleurs principales.
          </DialogDescription>
        </DialogHeader>

        {palette && (
          <div className="grid grid-cols-5 gap-2 py-3">
            {SLOTS.map(({ key, label }) => (
              <div key={key} className="flex flex-col items-center gap-1.5">
                <div
                  className="h-14 w-full rounded-lg border border-border shadow-sm"
                  style={{ backgroundColor: palette[key] }}
                />
                <span className="text-2xs text-muted-foreground">{label}</span>
                <span className="font-mono text-2xs uppercase text-foreground">
                  {palette[key]}
                </span>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose}>
            Ignorer
          </Button>
          <Button onClick={() => palette && onApply(palette)}>
            Appliquer à ma palette
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
