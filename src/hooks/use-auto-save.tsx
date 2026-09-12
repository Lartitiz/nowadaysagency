import { useRef, useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { trackError } from "@/lib/error-tracker";

const UNSAVED_PREFIX = "unsaved_";

/**
 * Reusable debounced auto-save hook.
 * Returns { saved, saving, triggerSave } to show save indicator.
 * 
 * When offline, retains pending edits in memory and replays on reconnect.
 * Callers must store the actual draft if it should survive a reload.
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

  const revision = useRef(0);
  const persisted = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);

  const flush = useCallback(async (): Promise<void> => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    if (inFlight.current) await inFlight.current;
    if (persisted.current === revision.current) return;
    const run = async () => {
      if (mounted.current) { setSaving(true); setSaved(false); }
      try {
        while (persisted.current !== revision.current) {
          if (!navigator.onLine) {
            toast.info("Sauvegarde en attente, tu es hors-ligne", { duration: 3000 });
            throw new Error("Sauvegarde en attente, tu es hors-ligne");
          }
          const savingRevision = revision.current;
          await saveFnRef.current();
          persisted.current = savingRevision;
        }
        if (lsKey) localStorage.removeItem(lsKey);
        if (mounted.current) {
          setSaved(true);
          if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
          savedTimeoutRef.current = setTimeout(() => setSaved(false), 2000);
        }
      } catch (e) {
        if (mounted.current) setSaved(false);
        if (lsKey) { try { localStorage.setItem(lsKey, "pending"); } catch { /* draft is managed by the caller */ } }
        trackError(e, { hook: "useAutoSave", action: "doSave" });
        throw e;
      } finally {
        if (mounted.current) setSaving(false);
      }
    };
    const pending = run();
    inFlight.current = pending;
    try { await pending; } finally { if (inFlight.current === pending) inFlight.current = null; }
  }, [lsKey]);

  const triggerSave = useCallback(() => {
    revision.current++;
    setSaved(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => { void flush().catch(() => {}); }, debounceMs);
  }, [debounceMs, flush]);

  useEffect(() => {
    const handleOnline = () => {
      // A storage marker alone cannot reconstruct data after a reload.
      // Only replay edits retained in this mounted form.
      if (revision.current !== persisted.current) void flush().catch(() => {});
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [flush]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      void flush().catch(() => {});
    };
  }, [flush]);

  return { saving, saved, triggerSave, flush };
}

/**
 * Tiny save indicator component.
 * Shows "✓ Sauvegardé" briefly after each auto-save.
 */
export function SaveIndicator({ saved, saving }: { saved: boolean; saving: boolean }) {
  if (saving) {
    return <span className="text-2xs text-muted-foreground animate-pulse">Sauvegarde...</span>;
  }
  if (saved) {
    return <span className="text-2xs text-muted-foreground">✓ Sauvegardé</span>;
  }
  return null;
}
