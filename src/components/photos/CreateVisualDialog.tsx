/**
 * CreateVisualDialog — « Créer un visuel » : la porte unique des outils qui
 * FABRIQUENT une image (par opposition aux outils qui retouchent une photo
 * existante, rangés dans la fiche photo).
 *
 * Audit UX 14/08 : les 5 boutons du haut de /photos mélangeaient trois métiers
 * (remplir la bibliothèque / retoucher / fabriquer). Les deux outils de
 * fabrication passent ici, chacun avec sa promesse en clair et son coût AVANT
 * le clic — les deux sont du montage par code, donc offerts.
 */

import { ArrowLeftRight, BookOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CreateVisualChoice = "avant-apres" | "offer-mockup";

interface CreateVisualDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChoose: (choice: CreateVisualChoice) => void;
}

const CHOICES: {
  key: CreateVisualChoice;
  icon: typeof ArrowLeftRight;
  title: string;
  hint: string;
}[] = [
  {
    key: "avant-apres",
    icon: ArrowLeftRight,
    title: "Avant / Après",
    hint: "Deux photos côte à côte pour montrer une transformation.",
  },
  {
    key: "offer-mockup",
    icon: BookOpen,
    title: "Mettre mon ebook en image",
    hint: "Ta couverture posée sur un livre, un carnet ou un écran.",
  },
];

export function CreateVisualDialog({ open, onOpenChange, onChoose }: CreateVisualDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Créer un visuel</DialogTitle>
          <DialogDescription>
            Fabriquer une image quand tu n'as pas de photo à montrer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {CHOICES.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onChoose(c.key)}
                className="w-full text-left rounded-xl border border-border p-3 transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground min-w-0">
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{c.title}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-2xs text-emerald-700">
                    Offert
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
