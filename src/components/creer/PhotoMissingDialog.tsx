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
import { Button } from "@/components/ui/button";

interface PhotoMissingDialogProps {
  open: boolean;
  rawType: "photo" | "mix" | null;
  onOpenChange: (open: boolean) => void;
  onContinueText: () => void;
  onAddPhotos: () => void;
}

/** Dialog "photos manquantes" : remplace le downgrade silencieux des
    carrousels mix/photo générés sans photos uploadées (cas typique :
    entrée par le coaching, qui ne propose pas d'upload). */
export default function PhotoMissingDialog({ open, rawType, onOpenChange, onContinueText, onAddPhotos }: PhotoMissingDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ce carrousel gagnerait à avoir des photos</AlertDialogTitle>
          <AlertDialogDescription>
            L'IA a structuré un carrousel{" "}
            <strong>{rawType === "mix" ? "mixte (texte + photos)" : "photo"}</strong>,
            mais aucune photo n'a été uploadée. Tu peux en ajouter maintenant
            ou continuer en mode texte uniquement.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel
            onClick={() => onOpenChange(false)}
          >
            Annuler
          </AlertDialogCancel>
          <Button
            variant="outline"
            onClick={onContinueText}
          >
            Continuer en texte
          </Button>
          <AlertDialogAction
            onClick={onAddPhotos}
          >
            Ajouter des photos
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
