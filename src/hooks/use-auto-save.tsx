import { useRef, useState, useCallback, useEffect } from "react";
import { toast } from "sonner";

const UNSAVED_PREFIX = "unsaved_";

/**
 * Reusable debounced auto-save hook.
 * Returns { saved, saving, triggerSave } to show save indicator.
 * 
 * When offline, queues data to localStorage and replays on reconnect.
 * 
 * @param storageKey — unique key for offline queue (e.g. "branding_profile")
 *
 * Usage:
 *   const { saved, saving, triggerSave } = useAutoSave(saveFn, 1000, "branding_profile");
 *   // Call triggerSave() whenever a field changes
 */
export function useAutoSave(
  saveFn: () => Promise<void>,
  debounceMs = 1000,
  storageKey?: string
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

  const lsKey = storageKey ? `${UNSAVED_PREFIX}${storageKey}` : null;

  const doSave = useCallback(async () => {
    if (!navigator.onLine) {
      // Queue a marker in localStorage so we know a save is pending
      if (lsKey) {
        try {
          localStorage.setItem(lsKey, Date.now().toString());
        } catch { /* quota exceeded — ignore */ }
      }
      toast.info("Sauvegarde en attente, tu es hors-ligne", { duration: 3000 });
      return;
    }
    setSaving(true);
    try {
      await saveFnRef.current();
      setSaved(true);
      // Clear any pending offline marker
      if (lsKey) localStorage.removeItem(lsKey);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = setTimeout(() => setSaved(false), 2000);
    } catch {
      // silent fail — toast handled by caller if needed
    } finally {
      setSaving(false);
    }
  }, [lsKey]);

  const triggerSave = useCallback(() => {
    setSaved(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(doSave, debounceMs);
  }, [debounceMs, doSave]);

  // Replay pending saves when coming back online
  useEffect(() => {
    const handleOnline = async () => {
      if (!lsKey) return;
      const pending = localStorage.getItem(lsKey);
      if (!pending) return;
      setSaving(true);
      try {
        await saveFnRef.current();
        localStorage.removeItem(lsKey);
        setSaved(true);
        toast.success("Tout est sauvegardé ✓", { duration: 2500 });
        if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
        savedTimeoutRef.current = setTimeout(() => setSaved(false), 2000);
      } catch {
        // will retry next time online fires
      } finally {
        setSaving(false);
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [lsKey]);

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
