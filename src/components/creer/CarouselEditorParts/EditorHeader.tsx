// Lot E3-6 (14/10/2026) : en-tête de l'éditeur (titre, Annuler / Rétablir,
// aperçu Instagram, raccourcis clavier), déplacé à l'identique depuis
// CarouselEditor.tsx. L'historique est lu au rendu, comme avant (`history`).
import { Fragment, type MutableRefObject } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Keyboard, Redo2, Smartphone, Undo2 } from "lucide-react";
import type { CarouselDocument } from "@/lib/carousel-editor";

// Sur PC, les raccourcis s'affichent avec Ctrl (et Maj) au lieu de ⌘ (et ⇧).
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const shortcutLabel = (keys: string, mac = IS_MAC) =>
  mac ? keys : keys.replace(/⌘ \+/g, "Ctrl +").replace(/⌘⇧/g, "Ctrl+Maj+").replace(/⌘/g, "Ctrl+");

const SHORTCUTS: [string, string][] = [
  ["⌘Z", "Annuler"],
  [IS_MAC ? "⌘⇧Z" : "⌘⇧Z · Ctrl+Y", "Rétablir"],
  ["⌘C · ⌘X · ⌘V", "Copier · couper · coller (aussi sur une autre slide)"],
  ["⌘D", "Dupliquer l’élément"],
  ["⌘A", "Tout sélectionner"],
  ["Maj + clic", "Ajouter / retirer de la sélection"],
  ["Tab · Maj+Tab", "Élément suivant · précédent"],
  ["Entrée · double-clic", "Écrire dans le texte choisi"],
  ["Échap", "Valider la saisie · choisir le cadre · désélectionner"],
  ["⌘B · ⌘I · ⌘U", "Gras · italique · souligné (mots choisis en écrivant)"],
  ["Flèches · Maj+flèches", "Déplacer de 1 px · 10 px"],
  ["Suppr", "Retirer l’élément"],
  ["⌘] · ⌘[", "Passer devant · derrière"],
  ["⌘G · ⌘⇧G", "Grouper · dégrouper"],
  ["⌘⇧L", "Verrouiller · déverrouiller l’élément"],
  ["Alt + glisser", "Déplacer le texte seul, hors de son cadre"],
  ["⌘ + glisser", "Placer librement, sans repères"],
];

/** Titre et boutons du haut de l'éditeur. */
export function EditorHeader({ history, setInstaOpen, undo }: {
  history: MutableRefObject<{ past: CarouselDocument[]; future: CarouselDocument[]; key: string; time: number }>;
  setInstaOpen: (open: boolean) => void;
  undo: (redo?: boolean) => unknown;
}) {
  return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-3xl text-primary">Personnaliser mon carrousel</h2>
          <p className="text-xs text-muted-foreground">
            Clique sur un élément ou choisis-le dans les calques. Tes retouches ne
            consomment aucun crédit IA.
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!history.current.past.length}
            onClick={() => undo()}
            aria-label="Annuler la modification"
            aria-keyshortcuts="Meta+Z Control+Z"
            title={`Annuler (${shortcutLabel("⌘Z")})`}
            className="gap-1.5"
          >
            <Undo2 size={15} /> Annuler
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!history.current.future.length}
            onClick={() => undo(true)}
            aria-label="Rétablir la modification"
            aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z Control+Y"
            title={`Rétablir (${shortcutLabel(SHORTCUTS[1][0])})`}
            className="gap-1.5"
          >
            <Redo2 size={15} /> Rétablir
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setInstaOpen(true)} aria-label="Aperçu Instagram">
            <Smartphone size={15} /> <span className="hidden sm:inline">Aperçu Instagram</span>
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" aria-label="Voir les raccourcis clavier">
                <Keyboard size={15} /> <span className="hidden sm:inline">Raccourcis</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 text-xs">
              <p className="mb-2 font-semibold">Raccourcis clavier</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {SHORTCUTS.map(([keys, label]) => (
                  <Fragment key={keys}>
                    <dt className="whitespace-nowrap font-mono text-2xs">{shortcutLabel(keys)}</dt>
                    <dd>{label}</dd>
                  </Fragment>
                ))}
              </dl>
              <p className="mt-2 text-muted-foreground">Ils marchent partout dans l’éditeur, même après un clic à côté de la slide.</p>
            </PopoverContent>
          </Popover>
        </div>
      </div>
  );
}
