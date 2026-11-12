// Stories comme le carrousel (12/11/2026) : Annuler / Rétablir, avec les mêmes
// raccourcis (⌘Z / Ctrl+Z, ⌘⇧Z / Ctrl+Y). Dans une case de texte, le raccourci
// reste celui de la case (il défait la dernière frappe).
import { useEffect } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface History { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }

const typingIn = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export default function StoryUndoButtons({ history }: { history: History }) {
  const { undo, redo } = history;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || typingIn(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((key === "z" && e.shiftKey) || key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);
  const btn = "h-7 gap-1 px-2 text-2xs";
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className={btn} disabled={!history.canUndo} onClick={undo} aria-label="Annuler la modification">
        <Undo2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Annuler</span>
      </Button>
      <Button type="button" variant="ghost" size="sm" className={btn} disabled={!history.canRedo} onClick={redo} aria-label="Rétablir la modification">
        <Redo2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Rétablir</span>
      </Button>
    </>
  );
}
