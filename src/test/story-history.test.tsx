import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useStoryHistory } from "@/components/stories/use-story-history";
import StoryUndoButtons from "@/components/stories/StoryUndoButtons";

/* « Annuler / Rétablir » des stories, branché sur la pile commune (27/11/2026).
   Les quatre premiers cas passaient déjà sur l'ancienne écriture : ils figent
   le comportement. Le dernier fige la lecture commune du raccourci. */

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup(automatic?: { current: boolean }) {
  return renderHook(({ epoch }: { epoch: string }) => {
    const [value, setValue] = useState<{ champ: string; texte: string }>({ champ: "titre", texte: "" });
    const history = useStoryHistory(value, setValue, epoch, (_prev, next) => next.champ, automatic);
    return { value, setValue, history };
  }, { initialProps: { epoch: "1" } });
}

describe("Annuler / Rétablir des stories", () => {
  it("regroupe les frappes rapprochées du même champ, sépare un autre champ et une pause", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    const { result } = setup();
    act(() => result.current.setValue({ champ: "titre", texte: "a" }));
    clock.mockReturnValue(1300);
    act(() => result.current.setValue({ champ: "titre", texte: "ab" }));
    clock.mockReturnValue(1400);
    act(() => result.current.setValue({ champ: "photo", texte: "ab+photo" }));
    clock.mockReturnValue(3000);
    act(() => result.current.setValue({ champ: "photo", texte: "ab+photo2" }));
    act(() => result.current.history.undo());
    expect(result.current.value.texte).toBe("ab+photo");
    act(() => result.current.history.undo());
    expect(result.current.value.texte).toBe("ab");
    act(() => result.current.history.undo());
    expect(result.current.value.texte).toBe("");
    expect(result.current.history.canUndo).toBe(false);
    act(() => result.current.history.redo());
    expect(result.current.value.texte).toBe("ab");
    expect(result.current.history.canRedo).toBe(true);
  });

  it("un nouveau changement après Annuler vide Rétablir et compte pour une étape", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const { result } = setup();
    act(() => result.current.setValue({ champ: "titre", texte: "a" }));
    act(() => result.current.history.undo());
    act(() => result.current.setValue({ champ: "titre", texte: "b" }));
    expect(result.current.history.canRedo).toBe(false);
    act(() => result.current.history.undo());
    expect(result.current.value.texte).toBe("");
  });

  it("un changement fait par l'app seule n'est pas une étape", () => {
    const automatic = { current: false };
    const { result } = setup(automatic);
    automatic.current = true;
    act(() => result.current.setValue({ champ: "photo", texte: "photo posée d'office" }));
    expect(result.current.history.canUndo).toBe(false);
    expect(automatic.current).toBe(false);
  });

  it("une nouvelle séquence venue du parent repart de zéro", () => {
    const { result, rerender } = setup();
    act(() => result.current.setValue({ champ: "titre", texte: "a" }));
    expect(result.current.history.canUndo).toBe(true);
    rerender({ epoch: "2" });
    expect(result.current.history.canUndo).toBe(false);
  });

  it("raccourcis : ⌘Z, Ctrl+Z, ⌘⇧Z, Ctrl+Y ; rien dans une case de texte ni avec Alt", () => {
    const undo = vi.fn(), redo = vi.fn();
    render(<><StoryUndoButtons history={{ undo, redo, canUndo: true, canRedo: true }} /><input aria-label="case" /></>);
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: "Z", metaKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(redo).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByLabelText("case"), { key: "z", metaKey: true });
    fireEvent.keyDown(window, { key: "z", metaKey: true, altKey: true });
    expect(undo).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByLabelText("Annuler la modification"));
    fireEvent.click(screen.getByLabelText("Rétablir la modification"));
    expect(undo).toHaveBeenCalledTimes(3);
    expect(redo).toHaveBeenCalledTimes(3);
  });
});
