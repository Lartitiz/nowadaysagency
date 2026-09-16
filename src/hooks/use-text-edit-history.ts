import { useCallback, useRef, useState } from "react";

/** Bounded, local history: typing is grouped, programmatic adjustments are not. */
export function useTextEditHistory(initial: string) {
  const [state, setState] = useState({ value: initial });
  const history = useRef({ value: initial, past: [] as string[], future: [] as string[], time: 0, typing: false });
  const change = useCallback((next: string, typing = false) => {
    const h = history.current;
    if (next === h.value) return;
    const now = Date.now();
    if (!typing || !h.typing || now - h.time > 800) h.past = [...h.past.slice(-29), h.value];
    h.future = [];
    h.typing = typing;
    h.time = now;
    h.value = next;
    setState({ value: next });
  }, []);
  const travel = useCallback((redo = false) => {
    const h = history.current;
    const next = (redo ? h.future : h.past).pop();
    if (next === undefined) return;
    (redo ? h.past : h.future).push(h.value);
    h.typing = false;
    h.value = next;
    setState({ value: next });
  }, []);
  const reset = useCallback((value: string) => {
    history.current = { value, past: [], future: [], time: 0, typing: false };
    setState({ value });
  }, []);
  return { value: state.value, change, travel, reset, canUndo: !!history.current.past.length, canRedo: !!history.current.future.length };
}
