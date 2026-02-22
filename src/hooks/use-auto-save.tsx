import { useRef, useState, useCallback, useEffect } from "react";

/**
 * Reusable debounced auto-save hook.
 * Returns { saved, saving, triggerSave } to show save indicator.
 * 
 * Usage:
 *   const { saved, saving, triggerSave } = useAutoSave(saveFn, 1000);
 *   // Call triggerSave() whenever a field changes
 */
export function useAutoSave(
  saveFn: () => Promise<void>,
  debounceMs = 1000
) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);

  // Keep saveFn ref up to date without re-triggering effects
  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  const triggerSave = useCallback(() => {
    setSaved(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await saveFnRef.current();
        setSaved(true);
        if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
        savedTimeoutRef.current = setTimeout(() => setSaved(false), 2000);
      } catch {
        // silent fail — toast handled by caller if needed
      } finally {
        setSaving(false);
      }
    }, debounceMs);
  }, [debounceMs]);

  // Cleanup on unmount — flush pending save
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        // Fire save immediately on unmount
        saveFnRef.current().catch(() => {});
      }
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  return { saving, saved, triggerSave };
}

/**
 * Tiny save indicator component.
 * Shows "✓ Sauvegardé" briefly after each auto-save.
 */
export function SaveIndicator({ saved, saving }: { saved: boolean; saving: boolean }) {
  if (saving) {
    return <span className="text-[11px] text-muted-foreground animate-pulse">Sauvegarde...</span>;
  }
  if (saved) {
    return <span className="text-[11px] text-muted-foreground">✓ Sauvegardé</span>;
  }
  return null;
}
