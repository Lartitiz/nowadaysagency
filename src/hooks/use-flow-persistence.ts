import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

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
  // Filet anti-perte : texte déjà streamé pendant une génération en cours.
  // Un reload/fermeture mi-streaming renvoyait à l'étape format et jetait le
  // texte alors que le crédit était déjà débité — on le restaure à la place.
  pendingStream?: { text: string; format: string; ts: number } | null;
  demoScenario?: string | null;
  editingIdeaId?: string | null;
  carouselSubMode?: "text" | "photo" | "mix" | "pure_photo" | null;
  photoDescription?: string;
  isLinkedInCarousel?: boolean;
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

// ════════════════════════════════════════════════════════════════════════
// Photos — persistance hybride (décision produit « photothèque propre ») :
//   • photo de la photothèque (userPhotoId, non retouchée) → on ne garde que
//     la RÉFÉRENCE serveur ; le base64 est re-téléchargé à la restauration.
//   • photo déposée à la volée OU photo photothèque retouchée → le base64 est
//     stocké dans IndexedDB (quota large, survit au recyclage d'onglet),
//     SANS être ajouté à la photothèque.
// Le MANIFESTE (léger : refs + métadonnées, sans base64) vit dans
// sessionStorage + un backup localStorage scopé par user, comme le flow.
// Avant : tout le base64 entassé dans sessionStorage (≈5 Mo, sans backup) →
// quota saturé en silence + perte au moindre recyclage d'onglet.
// ════════════════════════════════════════════════════════════════════════

const PHOTOS_BACKUP_PREFIX = PHOTOS_KEY + "_backup";
function photosBackupKeyFor(userId: string) { return `${PHOTOS_BACKUP_PREFIX}:${userId}`; }

const MAX_PHOTOS = 10; // aligné sur maxPhotos de PhotoUploadZone

export interface PhotoManifestEntry {
  id: string;
  name?: string;
  mimeType?: string;
  context?: string;
  userPhotoId?: string;
  edited?: boolean;
  /** true → le base64 est dans IndexedDB sous la clé `id`. */
  local: boolean;
  /** Ancien format inline (rétro-compat) — base64 directement dans le manifeste. */
  _legacyBase64?: string;
}

// ── IndexedDB (base64 lourd, durable) ──
const IDB_NAME = "creer_photos";
const IDB_STORE = "photos";
function idbAvailable(): boolean {
  try { return typeof indexedDB !== "undefined"; } catch { return false; }
}
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(key: string, value: any): Promise<void> {
  const db = await idbOpen();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function idbGet(key: string): Promise<any> {
  const db = await idbOpen();
  try {
    return await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const r = tx.objectStore(IDB_STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}
async function idbPrune(keepKeys: string[]): Promise<void> {
  if (!idbAvailable()) return;
  const keep = new Set(keepKeys);
  const db = await idbOpen();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAllKeys();
      req.onsuccess = () => {
        (req.result as IDBValidKey[]).forEach((k) => {
          if (!keep.has(String(k))) store.delete(k);
        });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function idbClearAll(): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const db = await idbOpen();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  } catch {}
}

let photoQuotaWarned = false;

function newPhotoId(existing?: string): string {
  if (existing) return existing;
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `p_${Date.now()}_${Math.round(Math.random() * 1e9)}`;
}

export async function savePhotos(photos: any[]): Promise<void> {
  try {
    const list = (photos || []).slice(0, MAX_PHOTOS);
    const manifest: PhotoManifestEntry[] = [];
    const keepKeys: string[] = [];
    const writes: Promise<void>[] = [];
    for (const p of list) {
      const id = newPhotoId(p.id);
      const isLibraryOriginal = !!p.userPhotoId && !p.edited;
      manifest.push({
        id,
        name: p.name,
        mimeType: p.mimeType,
        context: p.context,
        userPhotoId: p.userPhotoId,
        edited: !!p.edited,
        local: !isLibraryOriginal,
      });
      if (!isLibraryOriginal && p.base64 && idbAvailable()) {
        keepKeys.push(id);
        writes.push(idbPut(id, { base64: p.base64, mimeType: p.mimeType, name: p.name }));
      }
    }
    const payload = JSON.stringify({ photos: manifest, ts: Date.now() });
    try {
      sessionStorage.setItem(PHOTOS_KEY, payload);
      const userId = getFlowUserId();
      if (userId) localStorage.setItem(photosBackupKeyFor(userId), payload);
    } catch {}
    try {
      await Promise.all(writes);
      await idbPrune(keepKeys);
    } catch (e) {
      console.warn("[use-flow-persistence] IDB photo write failed", e);
      if (!photoQuotaWarned) {
        photoQuotaWarned = true;
        toast.warning(
          "Tes photos n'ont pas pu être mises en mémoire. Évite de recharger la page avant d'avoir fini ton contenu.",
        );
      }
    }
  } catch (e) {
    console.warn("[use-flow-persistence] savePhotos failed", e);
  }
}

/**
 * Manifeste seul (synchrone, sans base64) — sert à décider du step de
 * restauration et à compter les photos. Lit sessionStorage, retombe sur le
 * backup localStorage scopé par user (survit au recyclage d'onglet).
 */
export function loadPhotos(): PhotoManifestEntry[] {
  try {
    let raw = sessionStorage.getItem(PHOTOS_KEY);
    if (!raw) {
      const userId = getFlowUserId();
      if (userId) {
        const b = localStorage.getItem(photosBackupKeyFor(userId));
        if (b) { sessionStorage.setItem(PHOTOS_KEY, b); raw = b; }
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed?.ts && Date.now() - parsed.ts > MAX_AGE_MS) { clearPhotos(); return []; }
    const arr = Array.isArray(parsed?.photos) ? parsed.photos : [];
    // Rétro-compat : ancien format { base64, mimeType, context, name } sans `local`.
    return arr.map((e: any) =>
      typeof e.local === "boolean"
        ? (e as PhotoManifestEntry)
        : {
            id: e.id || newPhotoId(),
            name: e.name,
            mimeType: e.mimeType,
            context: e.context,
            userPhotoId: e.userPhotoId,
            edited: !!e.edited,
            local: !!e.base64,
            _legacyBase64: e.base64,
          },
    );
  } catch {
    return [];
  }
}

/**
 * Rehydrate (asynchrone) les photos stockées LOCALEMENT : base64 depuis
 * IndexedDB (dépôts + retouches) ou ancien format inline. Les originaux
 * photothèque sont renvoyés sans base64 avec `needsLibraryFetch: true`, à
 * compléter par l'appelant via le serveur (userPhotoId).
 */
export async function loadPhotosLocal(): Promise<any[]> {
  const manifest = loadPhotos();
  const out: any[] = [];
  for (const e of manifest) {
    if (e._legacyBase64) {
      out.push({ id: e.id, base64: e._legacyBase64, preview: e._legacyBase64, name: e.name, mimeType: e.mimeType, context: e.context || "", userPhotoId: e.userPhotoId, edited: e.edited });
      continue;
    }
    if (e.local) {
      try {
        const rec = idbAvailable() ? await idbGet(e.id) : null;
        if (rec?.base64) {
          out.push({ id: e.id, base64: rec.base64, preview: rec.base64, name: e.name || rec.name, mimeType: e.mimeType || rec.mimeType, context: e.context || "", userPhotoId: e.userPhotoId, edited: e.edited });
          continue;
        }
      } catch {}
      // base64 local introuvable → photo perdue, on la saute (signalé en aval)
    } else {
      out.push({ id: e.id, base64: "", preview: "", name: e.name, mimeType: e.mimeType, context: e.context || "", userPhotoId: e.userPhotoId, edited: e.edited, needsLibraryFetch: true });
    }
  }
  return out;
}

export function clearPhotos() {
  try { sessionStorage.removeItem(PHOTOS_KEY); } catch {}
  try {
    const userId = getFlowUserId();
    if (userId) {
      localStorage.removeItem(photosBackupKeyFor(userId));
    } else {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PHOTOS_BACKUP_PREFIX)) localStorage.removeItem(k);
      }
    }
  } catch {}
  void idbClearAll();
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
