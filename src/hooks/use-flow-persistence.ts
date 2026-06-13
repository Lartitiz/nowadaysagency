import { useState, useCallback, useEffect, useRef } from "react";

const STORAGE_KEY = "creer_flow_state";
const PHOTOS_KEY = "creer_flow_photos";

interface FlowState {
  step: string;
  ideaText: string;
  objective: string | null;
  selectedFormat: string | null;
  editorialAngle: string | null;
  answers: Record<string, string>;
  editContent: string;
  result: any;
  visualSlides: { slide_number: number; html: string }[];
  savedId: string | null;
  questions: { id: string; question: string; placeholder?: string }[];
  inspirationAnalysis: any;
  inspirationProposals: any[];
  inspirationImagePreview: string | null;
  demoScenario?: string | null;
  editingIdeaId?: string | null;
  carouselSubMode?: "text" | "photo" | "mix" | "pure_photo" | null;
  photoDescription?: string;
  ts: number;
}

const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
const BACKUP_PREFIX = STORAGE_KEY + "_backup";

// User-scoping registry: set from AuthContext on session changes.
// When null, we degrade gracefully (no backup write, no backup read).
let currentFlowUserId: string | null = null;
export function setFlowUserId(id: string | null) { currentFlowUserId = id; }
function getFlowUserId(): string | null { return currentFlowUserId; }
function backupKeyFor(userId: string) { return `${BACKUP_PREFIX}:${userId}`; }

export function saveFlowState(state: Partial<FlowState>) {
  try {
    const existing = loadFlowState();
    const merged = { ...existing, ...state, ts: Date.now() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));

    const userId = getFlowUserId();
    // Backup to localStorage for tab-recycling / HMR protection — scoped per user.
    // Save on any step beyond "idea" so in-progress work survives reloads.
    if (userId && state.step && state.step !== "idea") {
      try {
        localStorage.setItem(backupKeyFor(userId), JSON.stringify(merged));
      } catch {}
    }
    // Returning to the "idea" step purges any stale backup for this user.
    if (userId && state.step === "idea") {
      try { localStorage.removeItem(backupKeyFor(userId)); } catch {}
    }
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function loadFlowState(): FlowState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FlowState;
      if (parsed.ts && Date.now() - parsed.ts > MAX_AGE_MS) {
        clearFlowState();
        return null;
      }
      return parsed;
    }
    // Fallback: try localStorage backup (survives tab recycling) — scoped per user.
    const userId = getFlowUserId();
    if (!userId) return null; // No blind rehydration when user is unknown.
    const backup = localStorage.getItem(backupKeyFor(userId));
    if (backup) {
      const parsed = JSON.parse(backup) as FlowState;
      if (parsed.ts && Date.now() - parsed.ts > MAX_AGE_MS) {
        localStorage.removeItem(backupKeyFor(userId));
        return null;
      }
      // Re-hydrate sessionStorage from backup
      sessionStorage.setItem(STORAGE_KEY, backup);
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearFlowState() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    const userId = getFlowUserId();
    if (userId) {
      localStorage.removeItem(backupKeyFor(userId));
    } else {
      // Safety net: sweep any scoped backup if user unknown.
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(BACKUP_PREFIX)) localStorage.removeItem(k);
      }
    }
  } catch {}
  clearPhotos();
}

export function savePhotos(photos: any[]) {
  try {
    const payload = (photos || []).slice(0, 10).map((p) => ({
      base64: p.base64,
      mimeType: p.mimeType,
      context: p.context,
    }));
    sessionStorage.setItem(PHOTOS_KEY, JSON.stringify({ photos: payload, ts: Date.now() }));
  } catch (e) {
    console.warn("[use-flow-persistence] savePhotos failed (storage quota?)", e);
  }
}

export function loadPhotos(): any[] {
  try {
    const raw = sessionStorage.getItem(PHOTOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed?.ts && Date.now() - parsed.ts > MAX_AGE_MS) {
      sessionStorage.removeItem(PHOTOS_KEY);
      return [];
    }
    return Array.isArray(parsed?.photos) ? parsed.photos : [];
  } catch {
    return [];
  }
}

export function clearPhotos() {
  try {
    sessionStorage.removeItem(PHOTOS_KEY);
  } catch {}
}

/**
 * Hook that auto-saves creation flow state to sessionStorage on every change.
 * Returns the initial saved state (if any) for restoration.
 */
export function useFlowPersistence(deps: Partial<FlowState>) {
  const saved = useRef(false);

  useEffect(() => {
    // Don't save on the very first render (let initialization happen first)
    if (!saved.current) {
      saved.current = true;
      return;
    }
    saveFlowState(deps);
  }, [
    deps.step,
    deps.ideaText,
    deps.objective,
    deps.selectedFormat,
    deps.editorialAngle,
    deps.editContent,
    deps.result,
    deps.savedId,
    // visualSlides changes often — save on length change
    deps.visualSlides?.length,
    deps.questions,
  ]);
}
