// Lot E3-6 (14/10/2026) : en-tête de l'éditeur (titre, Annuler / Rétablir,
// aperçu Instagram, raccourcis clavier), déplacé à l'identique depuis
// CarouselEditor.tsx. L'historique est lu au rendu, comme avant (`history`).
import { Fragment, type MutableRefObject } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Keyboard, Redo2, SlidersHorizontal, Smartphone, Undo2 } from "lucide-react";
import type { CarouselDocument } from "@/lib/carousel-editor";
import type { EditorMode } from "@/components/creer/CarouselEditorParts/editor-mode";
import { useHideAppBreadcrumb } from "@/lib/app-breadcrumb";

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

/** Titre et boutons du haut de l'éditeur (une ligne), avec le passage au mode complet. */
export function EditorHeader({ history, mode, setInstaOpen, setMode, undo }: {
  history: MutableRefObject<{ past: CarouselDocument[]; future: CarouselDocument[]; key: string; time: number }>;
  mode: EditorMode;
  setInstaOpen: (open: boolean) => void;
  setMode: (mode: EditorMode) => void;
  undo: (redo?: boolean) => unknown;
}) {
  // La place du fil d'Ariane et du sous-titre va à la slide (17/10/2026) ; « Tes retouches
  // ne coûtent aucun crédit » est dans l'aide « ? » (mode simple et gestes sur la slide).
  useHideAppBreadcrumb();
  return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 font-display text-xl text-primary md:text-2xl">Personnaliser mon carrousel</h2>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!history.current.past.length}
            onClick={() => undo()}
            aria-label="Annuler la modification"
            aria-keyshortcuts="Meta+Z Control+Z"
            className="gap-1.5 px-2 sm:px-3"
          >
            <Undo2 size={15} /> <span className="hidden sm:inline">Annuler</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!history.current.future.length}
            onClick={() => undo(true)}
            aria-label="Rétablir la modification"
            aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z Control+Y"
            className="gap-1.5 px-2 sm:px-3"
          >
            <Redo2 size={15} /> <span className="hidden sm:inline">Rétablir</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 px-2 sm:px-3" onClick={() => setInstaOpen(true)} aria-label="Aperçu Instagram">
            <Smartphone size={15} /> <span className="hidden sm:inline">Aperçu Instagram</span>
          </Button>
          {mode === "complet" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="hidden gap-1.5 md:inline-flex" aria-label="Voir les raccourcis clavier">
                <Keyboard size={15} /> Raccourcis
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
          )}
          <Button
            variant="outline"
            size="sm"
            aria-pressed={mode === "complet"}
            onClick={() => setMode(mode === "simple" ? "complet" : "simple")}
            className="gap-1.5 border-primary/40 text-primary"
          >
            <SlidersHorizontal size={15} /> {mode === "simple" ? "Plus d’outils" : "Mode simple"}
          </Button>
        </div>
      </div>
  );
}
