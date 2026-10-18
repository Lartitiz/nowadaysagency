// Lot E3-6 (14/10/2026) : en-tête de l'éditeur (titre, Annuler / Rétablir,
// aperçu Instagram, raccourcis clavier), déplacé à l'identique depuis
// CarouselEditor.tsx. L'historique est lu au rendu, comme avant (`history`).
// Chantier W élargi (18/10/2026) : une seule ligne d'outils (~40 px) au-dessus de
// la slide : « Slide 1 / 14 », Annuler, Rétablir, Aperçu Instagram, zoom, En grand,
// Plus d'outils. Le titre devient le nom de la ligne (lu par les lecteurs d'écran,
// petit libellé sur grand écran).
import { Fragment, type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Keyboard, Maximize2, Redo2, SlidersHorizontal, Smartphone, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { HelpTip } from "@/components/creer/CarouselEditorParts/HelpTip";
import type { CarouselDocument } from "@/lib/carousel-editor";
import type { EditorMode } from "@/components/creer/CarouselEditorParts/editor-mode";
import { useHideAppBreadcrumb } from "@/lib/app-breadcrumb";
import { useMarkCarouselEditorShown } from "@/lib/carousel-editor-shown";

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

/** Ligne d'outils du haut de l'éditeur (une ligne), avec le passage au mode complet. */
export function EditorHeader({ active, count, history, mode, redo, setFullscreen, setInstaOpen, setMode, setZoom, undo, zoom }: {
  active: number;
  count: number;
  setFullscreen: (on: boolean) => void;
  setZoom: Dispatch<SetStateAction<number>>;
  zoom: number;
  history: MutableRefObject<{ past: CarouselDocument[]; future: CarouselDocument[]; key: string; time: number }>;
  mode: EditorMode;
  setInstaOpen: (open: boolean) => void;
  setMode: (mode: EditorMode) => void;
  undo: (redo?: boolean) => unknown;
  /** « Refaire cette slide » (chantier AA), en tête des outils, dans les deux modes. */
  redo?: ReactNode;
}) {
  // La place du fil d'Ariane et du sous-titre va à la slide (17/10/2026) ; « Tes retouches
  // ne coûtent aucun crédit » est dans l'aide « ? » (mode simple et gestes sur la slide).
  useHideAppBreadcrumb();
  // Étapes repliées et barre « Publier » sur une ligne tant que l'éditeur est là.
  useMarkCarouselEditorShown();
  const tool = "h-8 gap-1.5 px-2 lg:px-3";
  return (
      <div role="group" aria-labelledby="carousel-editor-title" className="flex items-center justify-between gap-1.5">
        <h2 id="carousel-editor-title" className="sr-only xl:not-sr-only xl:shrink-0 xl:whitespace-nowrap xl:font-display xl:text-base xl:text-primary">Personnaliser mon carrousel</h2>
        <p className="mr-auto flex min-w-0 shrink items-center gap-1 overflow-hidden whitespace-nowrap text-2xs text-muted-foreground md:text-xs">
          Slide {active + 1} / {count}<span className="hidden 2xl:inline"> · Double-clic : écrire · Glisser : déplacer</span>
          <HelpTip label="gestes sur la slide"><span className="md:hidden">Touche un texte, puis « Écrire » pour le modifier. Glisse un bloc pour le déplacer : il s’aligne sur les repères roses. Glisse une photo plein écran pour la recadrer, les poignées pour agrandir. Tes retouches ne coûtent aucun crédit.</span><span className="hidden md:inline">Double-clique (ou touche « Écrire ») pour écrire dans un texte. Glisse un bloc pour le déplacer : il s’aligne sur les repères roses (⌘/Ctrl pour placer librement). Glisse une photo plein écran pour la recadrer (double-clic pour une photo encadrée), les poignées pour agrandir. Alt + glisser : le texte seul. Glisser depuis le vide, ou clic long puis glisser, choisit plusieurs éléments. Flèches pour ajuster, Suppr pour retirer, Échap pour choisir le cadre. Tes retouches ne coûtent aucun crédit.</span></HelpTip>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {redo}
          <Button
            variant="outline"
            size="sm"
            disabled={!history.current.past.length}
            onClick={() => undo()}
            aria-label="Annuler la modification"
            aria-keyshortcuts="Meta+Z Control+Z"
            className={tool}
          >
            <Undo2 size={15} /> <span className="hidden lg:inline">Annuler</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!history.current.future.length}
            onClick={() => undo(true)}
            aria-label="Rétablir la modification"
            aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z Control+Y"
            className={tool}
          >
            <Redo2 size={15} /> <span className="hidden lg:inline">Rétablir</span>
          </Button>
          <Button variant="outline" size="sm" className={tool} onClick={() => setInstaOpen(true)} aria-label="Aperçu Instagram">
            <Smartphone size={15} /> <span className="hidden lg:inline">Aperçu Instagram</span>
          </Button>
          <Button size="sm" variant="ghost" className="hidden h-8 px-1.5 md:inline-flex" aria-label="Dézoomer l’aperçu" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
            <ZoomOut size={14} />
          </Button>
          <span className="hidden w-9 text-center text-2xs tabular-nums text-muted-foreground md:inline">{Math.round(zoom * 100)} %</span>
          <Button size="sm" variant="ghost" className="hidden h-8 px-1.5 md:inline-flex" aria-label="Zoomer l’aperçu" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>
            <ZoomIn size={14} />
          </Button>
          <Button size="sm" variant="outline" className={tool} aria-label="Ouvrir l’aperçu en grand" onClick={() => setFullscreen(true)}>
            <Maximize2 size={14} /> <span className="hidden lg:inline">En grand</span>
          </Button>
          {mode === "complet" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="hidden h-8 gap-1.5 px-2 md:inline-flex" aria-label="Voir les raccourcis clavier">
                <Keyboard size={15} /> <span className="hidden xl:inline">Raccourcis</span>
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
            aria-label={mode === "simple" ? "Plus d’outils" : "Mode simple"}
            onClick={() => setMode(mode === "simple" ? "complet" : "simple")}
            className="h-8 gap-1.5 border-primary/40 px-2 text-primary lg:px-3"
          >
            <SlidersHorizontal size={15} /> <span className="sm:hidden">{mode === "simple" ? "Outils" : "Simple"}</span><span className="hidden sm:inline">{mode === "simple" ? "Plus d’outils" : "Mode simple"}</span>
          </Button>
        </div>
      </div>
  );
}
