import { useCallback, useRef, useState } from "react";
import { emptyHistory, recordStep, travelHistory } from "@/lib/edit-history";

const MAX_STEPS = 30;

/** Bounded, local history: typing is grouped, programmatic adjustments are not. Pile commune : src/lib/edit-history.ts. */
export function useTextEditHistory(initial: string) {
  const [state, setState] = useState({ value: initial });
  const history = useRef({ value: initial, stack: emptyHistory<string>() });
  const change = useCallback((next: string, typing = false) => {
    const h = history.current;
    if (next === h.value) return;
    recordStep(h.stack, h.value, typing ? "typing" : null, MAX_STEPS);
    h.value = next;
    setState({ value: next });
  }, []);
  const travel = useCallback((redo = false) => {
    const h = history.current;
    const next = travelHistory(h.stack, h.value, redo);
    if (next === undefined) return;
    h.value = next;
    setState({ value: next });
  }, []);
  const reset = useCallback((value: string) => {
    history.current = { value, stack: emptyHistory<string>() };
    setState({ value });
  }, []);
  return { value: state.value, change, travel, reset, canUndo: !!history.current.stack.past.length, canRedo: !!history.current.stack.future.length };
}
