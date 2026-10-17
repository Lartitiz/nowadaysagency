import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photoCount: number;
  onConfirm: () => void;
}

/** Garde anti-perte : confirmation avant « Créer un autre contenu » quand un
    travail est en cours (texte généré et/ou photos uploadées). Évite
    d'effacer photos + contenu par un clic réflexe. */
export default function ConfirmResetDialog({ open, onOpenChange, photoCount, onConfirm }: ConfirmResetDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Repartir de zéro ?</AlertDialogTitle>
          <AlertDialogDescription>
            {photoCount > 0 ? (
              <>
                Tu as un contenu en cours avec{" "}
                <strong>
                  {photoCount} photo{photoCount > 1 ? "s" : ""}
                </strong>
                . Créer un autre contenu efface le texte généré et retire les
                photos. Cette action est irréversible.
              </>
            ) : (
              <>
                Tu as un contenu en cours. Créer un autre contenu efface le
                texte généré et repart d'une page blanche. Cette action est
                irréversible.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={() => onOpenChange(false)}>
            Garder mon contenu
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
          >
            Repartir de zéro
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
