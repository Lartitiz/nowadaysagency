import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

const STORAGE_KEY = "creer_flow_state";
const PHOTOS_KEY = "creer_flow_photos";

interface FlowState {
  schemaVersion?: 2;
  ownerId?: string | null;
  workspaceId?: string;
  creationId?: string;
  newsjackingContext?: string | null;
  newsjackingSuggestedFormat?: string | null;
  calendarPostId?: string | null;
  calendarPostDate?: string | null;
  calendarPostUpdatedAt?: string | null;
  reelMp4Url?: string | null;
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
  /** Brief repris depuis « Mes idées » : conservé après un rechargement pour
   * mettre à jour le même brief au lieu d'en créer un second. */
  incomingBriefId?: string | null;
  currentBriefId?: string | null;
  /** Ligne créée par une publication immédiate, afin que les actions calendrier
   * suivantes réutilisent ce suivi au lieu de dupliquer le contenu. */
  publishedCalendarId?: string | null;
  carouselSubMode?: "text" | "photo" | "mix" | "pure_photo" | "user_slides" | null;
  slideLength?: "auto" | "short" | "classic";
  photoDescription?: string;
  isLinkedInCarousel?: boolean;
  /** Mode « 1er contenu » (?auto=1) : l'URL est nettoyée après l'init, le mode
   *  survit ici pour que le récap « Ton premier contenu » tienne au reload. */
  autoFlow?: boolean;
  ts: number;
}

const BACKUP_PREFIX = STORAGE_KEY + "_backup";

// User-scoping registry: set from AuthContext on session changes.
// When null, we degrade gracefully (no backup write, no backup read).
let currentFlowUserId: string | null = null;
export function setFlowUserId(id: string | null) { currentFlowUserId = id; }
function getFlowUserId(): string | null { return currentFlowUserId; }
let currentFlowWorkspaceId: string | null = null;
function scopeSuffix() { return currentFlowWorkspaceId ? `:${currentFlowWorkspaceId}` : ""; }
function flowStorageKey() { return STORAGE_KEY + scopeSuffix(); }
function photosStorageKey() { return PHOTOS_KEY + scopeSuffix(); }
function backupKeyFor(userId: string) { return `${BACKUP_PREFIX}:${userId}${scopeSuffix()}`; }
export function setFlowWorkspaceId(id: string | null) {
  currentFlowWorkspaceId = id || null;
  if (!id) return;
  // Adopt the old single-workspace draft once, without copying it into every brand.
  try {
    if (sessionStorage.getItem(flowStorageKey())) return;
    const owner = getFlowUserId();
    const legacy = sessionStorage.getItem(STORAGE_KEY) || (owner ? localStorage.getItem(`${BACKUP_PREFIX}:${owner}`) : null);
    if (!legacy) return;
    const parsed = JSON.parse(legacy);
    if ((parsed.workspaceId && parsed.workspaceId !== id) || (parsed.ownerId && parsed.ownerId !== owner)) return;
    const migrated = JSON.stringify({ ...parsed, workspaceId: id, ownerId: owner });
    sessionStorage.setItem(flowStorageKey(), migrated);
    if (owner) localStorage.setItem(backupKeyFor(owner), migrated);
    const photos = sessionStorage.getItem(PHOTOS_KEY) || (owner ? localStorage.getItem(`${PHOTOS_BACKUP_PREFIX}:${owner}`) : null);
    if (photos) {
      sessionStorage.setItem(photosStorageKey(), photos);
      if (owner) localStorage.setItem(photosBackupKeyFor(owner), photos);
    }
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(PHOTOS_KEY);
    if (owner) {
      localStorage.removeItem(`${BACKUP_PREFIX}:${owner}`);
      localStorage.removeItem(`${PHOTOS_BACKUP_PREFIX}:${owner}`);
    }
  } catch { /* The existing draft remains available if migration fails. */ }
}


export function saveFlowState(state: Partial<FlowState>) {
  try {
    const existing = loadFlowState();
    const merged = { ...existing, ...state, schemaVersion: 2 as const, ownerId: getFlowUserId(), ts: Date.now() };
    // One HTML copy in browser storage. The source is restored through visualSlides.
    if (merged.result?.raw?.carousel_editor_version && merged.visualSlides?.length) {
      const { visual_html: _html, ...raw } = merged.result.raw;
      if (raw._carousel_cloud) raw._carousel_cloud = { ...raw._carousel_cloud, history: [] };
      merged.result = { ...merged.result, raw };
    }
    sessionStorage.setItem(flowStorageKey(), JSON.stringify(merged));

    const userId = getFlowUserId();
    // Backup to localStorage for tab-recycling / HMR protection — scoped per user.
    // Save on any step beyond "idea" so in-progress work survives reloads.
    if (userId && merged.step && merged.step !== "idea") {
      try {
        localStorage.setItem(backupKeyFor(userId), JSON.stringify(merged));
      } catch { toast.warning("La copie de secours n’a pas pu être enregistrée. Enregistre ton carrousel dans Mes idées avant de fermer cet onglet.", { id: "carousel-storage-warning" }); }
    }
    // Returning to the "idea" step purges any stale backup for this user.
    if (userId && state.step === "idea") {
      try { localStorage.removeItem(backupKeyFor(userId)); } catch {}
    }
  } catch {
    if (state.result?.raw?.carousel_editor_version) toast.warning("Sauvegarde locale indisponible. Enregistre ton carrousel dans Mes idées avant de fermer cet onglet.", { id: "carousel-storage-warning" });
  }
}

export function loadFlowState(): FlowState | null {
  try {
    const raw = sessionStorage.getItem(flowStorageKey());
    if (raw) {
      const parsed = JSON.parse(raw) as FlowState;
      if (parsed.ownerId && getFlowUserId() && parsed.ownerId !== getFlowUserId()) return null;
      return parsed;
    }
    // Fallback: try localStorage backup (survives tab recycling) — scoped per user.
    const userId = getFlowUserId();
    if (!userId) return null; // No blind rehydration when user is unknown.
    const backup = localStorage.getItem(backupKeyFor(userId));
    if (backup) {
      const parsed = JSON.parse(backup) as FlowState;
      if (parsed.ownerId && parsed.ownerId !== userId) return null;
      // Re-hydrate sessionStorage from backup
      sessionStorage.setItem(flowStorageKey(), backup);
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearFlowState() {
  try {
    sessionStorage.removeItem(flowStorageKey());
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
function photosBackupKeyFor(userId: string) { return `${PHOTOS_BACKUP_PREFIX}:${userId}${scopeSuffix()}`; }

const MAX_PHOTOS = 100; // original assets plus replacements across a 20-slide editor

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
function photoRecordPrefix() { return `${getFlowUserId() || "anonymous"}:${currentFlowWorkspaceId || "legacy"}:`; }
async function idbPut(key: string, value: any): Promise<void> {
  key = photoRecordPrefix() + key;
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
  const legacyKey = key;
  key = photoRecordPrefix() + key;
  const db = await idbOpen();
  try {
    return await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const r = tx.objectStore(IDB_STORE).get(key);
      r.onsuccess = () => {
        if (r.result) resolve(r.result);
        else { const legacy = tx.objectStore(IDB_STORE).get(legacyKey); legacy.onsuccess = () => resolve(legacy.result); legacy.onerror = () => reject(legacy.error); }
      };
      r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}
async function idbClearAll(): Promise<void> {
  const prefix = photoRecordPrefix();
  if (!idbAvailable()) return;
  try {
    const db = await idbOpen();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const store = tx.objectStore(IDB_STORE);
        const req = store.getAllKeys();
        req.onsuccess = () => req.result.forEach(k => { if (String(k).startsWith(prefix)) store.delete(k); });
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
        writes.push(idbPut(id, { base64: p.base64, mimeType: p.mimeType, name: p.name }));
      }
    }
    const payload = JSON.stringify({ photos: manifest, ownerId: getFlowUserId(), ts: Date.now() });
    try {
      sessionStorage.setItem(photosStorageKey(), payload);
      const userId = getFlowUserId();
      if (userId) localStorage.setItem(photosBackupKeyFor(userId), payload);
    } catch {}
    try {
      await Promise.all(writes);
      // Keep other snapshots until explicit reset; older async writes must not prune newer photos.
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
    let raw = sessionStorage.getItem(photosStorageKey());
    if (!raw) {
      const userId = getFlowUserId();
      if (userId) {
        const b = localStorage.getItem(photosBackupKeyFor(userId));
        if (b) { sessionStorage.setItem(photosStorageKey(), b); raw = b; }
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed.ownerId && parsed.ownerId !== getFlowUserId()) return [];
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
      // Preserve the slot so an incomplete photo set cannot look complete.
      out.push({ id: e.id, base64: "", preview: "", name: e.name, mimeType: e.mimeType, context: e.context || "", edited: e.edited, missingLocalPhoto: true });
      toast.warning("Une photo du brouillon n’a pas pu être restaurée. Réimporte-la avant d’enregistrer.", { id: "missing-draft-photo" });
    } else {
      out.push({ id: e.id, base64: "", preview: "", name: e.name, mimeType: e.mimeType, context: e.context || "", userPhotoId: e.userPhotoId, edited: e.edited, needsLibraryFetch: true });
    }
  }
  return out;
}

export function clearPhotos() {
  try { sessionStorage.removeItem(photosStorageKey()); } catch {}
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
