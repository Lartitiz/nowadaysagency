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
import type { Blocker } from "react-router-dom";

interface Props {
  blocker: Blocker;
}

export default function UnsavedChangesDialog({ blocker }: Props) {
  if (blocker.state !== "blocked") return null;

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Modifications non enregistrées</AlertDialogTitle>
          <AlertDialogDescription>
            Tu as des modifications non enregistrées. Quitter sans sauvegarder ?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.reset?.()}>
            Rester sur la page
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => blocker.proceed?.()}>
            Quitter sans sauvegarder
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
