import { useEffect, useRef, useCallback, useState } from "react";

/**
 * Persists form state to sessionStorage so it survives re-renders and tab switches.
 *
 * Usage:
 *   const { restored, clearDraft } = useFormPersist("stories-form", { subject, objective, ... }, setters);
 *
 * `restored` is true if values were restored on mount → show a "Brouillon restauré" banner.
 * Call `clearDraft()` after successful generation or when user clicks "Recommencer".
 */
export function useFormPersist<T extends Record<string, any>>(
  key: string,
  values: T,
  restoreFn: (saved: T) => void,
) {
  const [restored, setRestored] = useState(false);
  const hasRestored = useRef(false);
  const isFirstRender = useRef(true);

  // On mount: restore from sessionStorage
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    try {
      const raw = sessionStorage.getItem(`form_draft_${key}`);
      if (raw) {
        const saved = JSON.parse(raw) as T;
        // Only restore if there's meaningful content
        const hasContent = Object.values(saved).some(
          (v) => v !== "" && v !== null && v !== undefined && v !== false && v !== 0
        );
        if (hasContent) {
          restoreFn(saved);
          setRestored(true);
        }
      }
    } catch {
      // corrupt data — ignore
    }
  }, []); // mount only

  // Save to sessionStorage on every value change (but skip first render to avoid saving initial empty state)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    try {
      sessionStorage.setItem(`form_draft_${key}`, JSON.stringify(values));
    } catch {
      // storage full — ignore
    }
  }, [key, ...Object.values(values)]);

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(`form_draft_${key}`);
    setRestored(false);
  }, [key]);

  return { restored, clearDraft };
}
