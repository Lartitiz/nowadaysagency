import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

/* Le déclencheur (bouton hamburger) est dessiné par AppHeader — il vit dans
   le flux de sa barre du haut, comme n'importe quel autre bouton — tandis que
   le panneau qu'il ouvre (tiroir, fond assombri, survol desktop) reste dans
   AppSidebar. Ce contexte est le seul pont entre les deux : sans lui, la
   position du bouton ne pourrait être devinée que par un padding en dur (l'ancien
   `pl-14`), qui se désynchronise dès que l'un des deux composants change. */

interface MobileNavContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const MobileNavContext = createContext<MobileNavContextType | undefined>(undefined);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false);
  const setOpen = useCallback((v: boolean) => setOpenState(v), []);
  const value = useMemo<MobileNavContextType>(() => ({ open, setOpen }), [open, setOpen]);
  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav() {
  const context = useContext(MobileNavContext);
  if (!context) throw new Error("useMobileNav must be used within MobileNavProvider");
  return context;
}
