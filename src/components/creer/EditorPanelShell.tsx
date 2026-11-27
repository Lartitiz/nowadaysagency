// Le cadre du panneau de réglages, commun à l'éditeur de carrousel et à celui des stories
// (27/11/2026, suite du « cadre d'écran commun »). Avant, la colonne d'onglets, la ligne
// « Terminé » du volet téléphone et la zone qui défile étaient écrites deux fois, avec de
// petites différences : un retour sur l'un n'arrivait pas à l'autre.
// Ici : seulement le cadre (classes, bouton d'onglet, ligne du volet). Ce que chaque onglet
// contient reste dans l'éditeur de son format (EditorPanel.tsx, StoryEditorPanel.tsx).
// Le volet lui-même : src/hooks/use-phone-sheet.ts.
// Test : src/test/editor-panel-shell.test.tsx.
import type { FocusEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openSheetOnFieldFocus, SHEET_PANEL, type PhoneSheet } from "@/hooks/use-phone-sheet";

/** Cadre du panneau : sur ordinateur, une colonne d'icônes à gauche et le contenu à droite ; volet ouvert, il prend la place sous l'aperçu. */
export const panelFrame = (sheetOpen: boolean) =>
  `md:grid md:grid-cols-[4.5rem_minmax(0,1fr)] md:overflow-hidden md:rounded-xl md:border md:bg-card ${sheetOpen ? SHEET_PANEL : ""}`;

/** Rangée (téléphone) ou colonne (ordinateur) des onglets. */
export const PANEL_TABLIST = "flex gap-0.5 rounded-xl bg-muted/60 p-1 md:flex-col md:gap-1 md:overflow-visible md:rounded-none md:border-r md:p-1.5";

/** Zone du contenu : volet ouvert, elle défile seule sous l'aperçu. */
export const panelBody = (sheetOpen: boolean) =>
  `flex min-h-0 min-w-0 flex-col ${sheetOpen ? "max-md:flex-1 max-md:overflow-y-auto max-md:overscroll-contain max-md:pb-6" : ""}`;

/** Téléphone : toucher une case des réglages ouvre le volet (l'aperçu reste visible au-dessus du clavier). */
export const panelBodyFocus = (sheet: PhoneSheet | undefined) => (e: FocusEvent<HTMLElement>) => openSheetOnFieldFocus(sheet, e.target);

/**
 * Un onglet du panneau. Téléphone : tous les onglets tiennent dans la largeur (plus de rangée
 * qui défile), d'où `short`, un nom court affiché à la place du nom complet (qui reste lu).
 */
export function PanelTabButton({ id, controls, selected, label, short = "", icon: Icon, extra = "", onClick }: {
  id: string;
  controls: string;
  selected: boolean;
  label: string;
  short?: string;
  icon: LucideIcon;
  extra?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" role="tab" id={id} aria-selected={selected} aria-controls={controls} aria-label={short ? label : undefined} onClick={onClick}
      className={`flex flex-col max-md:min-w-0 max-md:flex-1 md:min-w-[3.6rem] md:shrink-0 items-center gap-1 rounded-xl px-1 py-2 text-center text-[10.5px] font-medium leading-tight text-muted-foreground hover:text-foreground aria-selected:bg-background aria-selected:text-primary aria-selected:shadow-sm aria-selected:ring-1 aria-selected:ring-primary/25 ${extra}`}>
      <Icon size={19} aria-hidden="true" />
      {short || label}
    </button>
  );
}

/** Ligne du haut du volet téléphone : ce qu'on règle, et « Terminé » qui rend sa taille à l'aperçu. */
export function PanelSheetHeader({ children, onDone }: { children: ReactNode; onDone: () => void }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2 md:hidden">
      <p className="text-xs text-muted-foreground">{children}</p>
      <Button size="sm" variant="outline" className="h-8 shrink-0 rounded-full px-4" onClick={onDone}>Terminé</Button>
    </div>
  );
}
