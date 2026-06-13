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

export function saveFlowState(state: Partial<FlowState>) {
  try {
    const existing = loadFlowState();
    const merged = { ...existing, ...state, ts: Date.now() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    // Backup to localStorage for tab-recycling / HMR protection
    // Save on any step beyond "idea" so in-progress work survives reloads
    if (state.step && state.step !== "idea") {
      try {
        localStorage.setItem(STORAGE_KEY + "_backup", JSON.stringify(merged));
      } catch {}
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
    // Fallback: try localStorage backup (survives tab recycling)
    const backup = localStorage.getItem(STORAGE_KEY + "_backup");
    if (backup) {
      const parsed = JSON.parse(backup) as FlowState;
      if (parsed.ts && Date.now() - parsed.ts > MAX_AGE_MS) {
        localStorage.removeItem(STORAGE_KEY + "_backup");
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
    localStorage.removeItem(STORAGE_KEY + "_backup");
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
