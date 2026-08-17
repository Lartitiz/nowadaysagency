import { toast } from "sonner";

/**
 * Centralise le pattern "copier dans le presse-papier + toast de confirmation"
 * répété ~54 fois dans src/. Migration progressive : nouveaux usages et
 * refactos passent par ce hook plutôt que de réécrire le duo
 * navigator.clipboard.writeText + toast.success à chaque fois.
 *
 * @example
 * const copy = useCopyToClipboard();
 * <Button onClick={() => copy(caption, "Caption copiée !")}>Copier</Button>
 */
export function useCopyToClipboard() {
  return (text: string, successMessage = "Copié !") => {
    navigator.clipboard.writeText(text);
    toast.success(successMessage);
  };
}
