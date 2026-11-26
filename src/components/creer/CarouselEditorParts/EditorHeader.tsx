// Lot E3-6 (14/10/2026) : en-tête de l'éditeur (titre, Annuler / Rétablir,
// aperçu Instagram, raccourcis clavier), déplacé à l'identique depuis
// CarouselEditor.tsx. L'historique est lu au rendu, comme avant (`history`).
// Chantier W élargi (18/10/2026) : une seule ligne d'outils (~40 px) au-dessus de
// la slide : « Slide 1 / 14 », Annuler, Rétablir, Aperçu Instagram, zoom, En grand,
// Plus d'outils. Le titre devient le nom de la ligne (lu par les lecteurs d'écran,
// petit libellé sur grand écran).
// Éditeur facile (20/11/2026, maquette validée par Laetitia) : moins de boutons. À
// gauche « Slide 1 sur 14 » et les boutons de la slide (ajouter, dupliquer,
// supprimer) ; les flèches ‹ › sont à côté de la slide. Zoom, « En grand » et le
// bouton « Refaire cette slide » ne restent que dans « Plus d'outils » (en mode
// simple, la demande à l'IA est dans le panneau).
// Slide en grand (26/11/2026, maquette validée par Laetitia) : en mode « Plus d'outils »,
// le zoom, « En grand » et les raccourcis clavier tiennent dans un seul bouton « ⋯ »
// (cinq boutons de moins sur la ligne), et les boutons de la slide ouverte sont dans
// cette ligne comme en mode simple (plus de rangée à eux sous les vignettes).
// Panneau à onglets (26/11/2026) : il n'y a plus qu'un seul panneau, donc plus de bouton
// « Plus d'outils » / « Mode simple » ; le bouton « ⋯ » est toujours là, et la demande à
// l'IA (« Refaire cette slide ») est dans le panneau (collée en bas).
import { Fragment, type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Maximize2, MoreHorizontal, Redo2, Smartphone, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { HelpTip } from "@/components/creer/CarouselEditorParts/HelpTip";
import type { CarouselDocument } from "@/lib/carousel-editor";
import { useHideAppBreadcrumb } from "@/lib/app-breadcrumb";
import { useMarkCarouselEditorShown } from "@/lib/carousel-editor-shown";
import { useAppHeaderHeightVar } from "@/lib/app-header-height";

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

/** Ligne d'outils du haut de l'éditeur (une ligne). */
export function EditorHeader({ showInstagramPreview = true, active, count, slideTools, history, redo, setFullscreen, setInstaOpen, setZoom, undo, zoom }: {
  showInstagramPreview?: boolean;
  active: number;
  count: number;
  /** Boutons de la slide ouverte (ordinateur). */
  slideTools?: ReactNode;
  setFullscreen: (on: boolean) => void;
  setZoom: Dispatch<SetStateAction<number>>;
  zoom: number;
  history: MutableRefObject<{ past: CarouselDocument[]; future: CarouselDocument[]; key: string; time: number }>;
  setInstaOpen: (open: boolean) => void;
  undo: (redo?: boolean) => unknown;
  /** « Demander un changement à l'IA » (chantier AA) : s'affiche dans le panneau (portail). */
  redo?: ReactNode;
}) {
  // La place du fil d'Ariane et du sous-titre va à la slide (17/10/2026) ; « Tes retouches
  // ne coûtent aucun crédit » est dans l'aide « ? » (mode simple et gestes sur la slide).
  useHideAppBreadcrumb();
  // Étapes repliées et barre « Publier » sur une ligne tant que l'éditeur est là.
  useMarkCarouselEditorShown();
  // Hauteur réelle du menu de l'app, lue en direct (--app-header-h) : la ligne d'outils
  // et la slide se collent dessous même si le menu change de hauteur.
  useAppHeaderHeightVar();
  const tool = "h-8 gap-1.5 px-2 lg:px-3";
  return (
      // Collée sous le menu de l'app (hauteur mesurée, repli 49 / 57 / 81 px) : « Refaire cette
      // slide », Annuler et Rétablir restent à portée quand on fait défiler
      // (passe Auriana du 12/11). La slide se colle juste dessous (CarouselEditor.tsx).
      <div role="group" aria-labelledby="carousel-editor-title" data-editor-toolbar className="sticky top-[var(--app-header-h,49px)] z-30 -mx-1 flex items-center justify-between gap-1.5 bg-background/95 px-1 py-1 backdrop-blur-sm md:top-[var(--app-header-h,57px)] lg:top-[var(--app-header-h,81px)]">
        <h2 id="carousel-editor-title" className="sr-only 2xl:not-sr-only 2xl:shrink-0 2xl:whitespace-nowrap 2xl:font-display 2xl:text-base 2xl:text-primary">Personnaliser mon carrousel</h2>
        <div className="mr-auto flex min-w-0 shrink items-center gap-1.5 overflow-hidden whitespace-nowrap text-2xs text-muted-foreground md:text-xs">
          <span className="shrink-0 text-sm font-semibold text-foreground" data-testid="slide-count">Slide {active + 1} <span className="font-normal text-muted-foreground">sur {count}</span></span>
          {slideTools}
          <HelpTip label="gestes sur la slide"><span className="md:hidden">Glisse la slide du doigt pour passer à la suivante. Écris dans les cases sous la slide pour changer un texte. Pour déplacer un bloc, touche-le d’abord, puis glisse-le : il s’aligne sur les repères roses. Glisse une photo plein écran pour la recadrer, les poignées pour agrandir. Tes retouches ne coûtent aucun crédit.</span><span className="hidden md:inline">Double-clique (ou touche « Écrire ») pour écrire dans un texte. Glisse un bloc pour le déplacer : il s’aligne sur les repères roses (⌘/Ctrl pour placer librement). Glisse une photo plein écran pour la recadrer (double-clic pour une photo encadrée), les poignées pour agrandir. Alt + glisser : le texte seul. Glisser depuis le vide, ou clic long puis glisser, choisit plusieurs éléments. Flèches pour ajuster, Suppr pour retirer, Échap pour choisir le cadre. Tes retouches ne coûtent aucun crédit.</span></HelpTip>
        </div>
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
            <Undo2 size={15} /> <span className="hidden xl:inline">Annuler</span>
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
            <Redo2 size={15} /> <span className="hidden xl:inline">Rétablir</span>
          </Button>
          {showInstagramPreview && (
            <Button variant="outline" size="sm" className={tool} onClick={() => setInstaOpen(true)} aria-label="Aperçu Instagram">
              <Smartphone size={15} /> <span className="hidden lg:inline">Aperçu Instagram</span>
            </Button>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 px-0" aria-label="Affichage : zoom, plein écran, raccourcis clavier" title="Zoom, plein écran, raccourcis clavier" data-testid="editor-view-menu">
                <MoreHorizontal size={16} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" collisionPadding={8} className="max-h-[var(--radix-popover-content-available-height)] w-80 space-y-3 overflow-y-auto text-xs">
              <div className="hidden items-center justify-between gap-2 md:flex">
                <p className="font-semibold">Zoom de la slide</p>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" className="h-8 px-2" aria-label="Dézoomer l’aperçu" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
                    <ZoomOut size={14} />
                  </Button>
                  <span className="w-10 text-center text-2xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)} %</span>
                  <Button size="sm" variant="outline" className="h-8 px-2" aria-label="Zoomer l’aperçu" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>
                    <ZoomIn size={14} />
                  </Button>
                </div>
              </div>
              <Button size="sm" variant="outline" className="h-8 w-full gap-1.5" aria-label="Ouvrir l’aperçu en grand" onClick={() => setFullscreen(true)}>
                <Maximize2 size={14} /> Voir la slide en plein écran
              </Button>
              <div className="hidden md:block">
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
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
  );
}
