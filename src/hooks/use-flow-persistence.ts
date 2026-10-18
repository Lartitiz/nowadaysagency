import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { UserSlidesInputDraft } from "@/components/creer/UserSlidesStep";
import { clearCloudMarker, slimFlowState } from "@/features/creer/flow-state-slim";

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
  reelSourceKey?: string;
  step: string;
  ideaText: string;
  objective: string | null;
  selectedFormat: string | null;
  editorialAngle: string | null;
  answers: Record<string, string>;
  editContent: string;
  /** Texte de l'étape « Modifier » à son ouverture ou à la dernière sauvegarde. */
  editBaseline?: string | null;
  result: any;
  visualSlides: { slide_number: number; html: string }[];
  /** Visuels trop lourds pour l'onglet : à relire dans la fiche de Mes idées (editingIdeaId). */
  visualsInCloud?: boolean;
  savedId: string | null;
  questions: { id: string; question: string; placeholder?: string }[];
  inspirationAnalysis: any;
  inspirationProposals: any[];
  inspirationImagePreview: string | null;
  // Filet anti-perte : texte déjà streamé pendant une génération en cours.
  // Un reload/fermeture mi-streaming renvoyait à l'étape format et jetait le
  // texte alors que le crédit était déjà débité — on le restaure à la place.
  pendingStream?: { text: string; format: string; ts: number } | null;
  /** Génération en cours (posé au départ, retiré à l'arrivée du résultat ou de
   * l'erreur). Encore présent au rechargement = création interrompue par le
   * rechargement : on le dit au lieu de renvoyer à l'étape 2 (15/10/2026). */
  generationInFlight?: { format: string; ts: number } | null;
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
  slideLength?: "auto" | "short" | "classic" | "long";
  userSlidesInput?: UserSlidesInputDraft | null;
  photoDescription?: string;
  photoSubject?: string;
  photoEntry?: boolean;
  forcedChannel?: "instagram" | "linkedin" | "pinterest" | "newsletter" | null;
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
export function setFlowUserId(id: string | null) { currentFlowUserId = id; if (id) startTabPresence(); }
function getFlowUserId(): string | null { return currentFlowUserId; }
let currentFlowWorkspaceId: string | null = null;
function scopeSuffix() { return currentFlowWorkspaceId ? `:${currentFlowWorkspaceId}` : ""; }
function flowStorageKey() { return STORAGE_KEY + scopeSuffix(); }
function photosStorageKey() { return PHOTOS_KEY + scopeSuffix(); }
function backupKeyFor(userId: string) { return `${BACKUP_PREFIX}:${userId}${scopeSuffix()}`; }

// ════════════════════════════════════════════════════════════════════════
// Une copie de secours PAR ONGLET (lot 10, 14/10/2026).
// Avant : une seule copie localStorage par compte et par espace, réécrite par
// chaque onglet → le dernier onglet qui écrit gagne. Un onglet qui perdait sa
// sessionStorage (navigateur relancé, nouvel onglet) reprenait le brouillon
// d'UN AUTRE onglet, parfois encore ouvert : deux onglets sur la même idée.
// Maintenant :
//   • chaque onglet écrit sa propre copie (`…:tab:<id>`), rien ne s'écrase ;
//   • chaque onglet signale sa présence (horodatage rafraîchi régulièrement) ;
//   • un onglet sans sessionStorage ne reprend QUE sa propre copie ou celle d'un
//     onglet fermé (la plus récente), et la fait sienne (photos comprises) pour
//     qu'aucun autre onglet ne la reprenne aussi. Après une remise à zéro dans
//     cet onglet, les copies d'autres onglets plus anciennes ne reviennent pas.
// ════════════════════════════════════════════════════════════════════════
const TAB_KEY = "creer_flow_tab";
const RESET_KEY = "creer_flow_reset_at";
const PRESENCE_PREFIX = "creer_flow_presence";
// Les navigateurs ralentissent les minuteurs des onglets en arrière-plan
// (jusqu'à un passage par minute) : la présence doit tenir plus longtemps.
const PRESENCE_EVERY_MS = 20_000;
const PRESENCE_TTL_MS = 2 * 60_000;
const STALE_BACKUP_MS = 30 * 24 * 60 * 60_000;

function currentTabId(create: boolean): string | null {
  try {
    let id = sessionStorage.getItem(TAB_KEY);
    if (!id && create) {
      id = newPhotoId();
      sessionStorage.setItem(TAB_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}
function tabBackupKey(base: string, tabId: string) { return `${base}:tab:${tabId}`; }
function ownBackupKey(base: string): string | null {
  const id = currentTabId(true);
  return id ? tabBackupKey(base, id) : null;
}
function markTabPresent() {
  const id = currentTabId(false);
  if (!id) return;
  try { localStorage.setItem(`${PRESENCE_PREFIX}:${id}`, String(Date.now())); } catch { /* stockage plein ou indisponible : présence non signalée */ }
}
let presenceStarted = false;
function startTabPresence() {
  if (presenceStarted || typeof window === "undefined") return;
  presenceStarted = true;
  markTabPresent();
  const timer = setInterval(markTabPresent, PRESENCE_EVERY_MS) as unknown as { unref?: () => void };
  timer?.unref?.();
  try { document.addEventListener("visibilitychange", markTabPresent); } catch { /* hors navigateur */ }
}
function tabIsOpen(tabId: string): boolean {
  try {
    const seen = Number(localStorage.getItem(`${PRESENCE_PREFIX}:${tabId}`));
    return Number.isFinite(seen) && seen > 0 && Date.now() - seen < PRESENCE_TTL_MS;
  } catch {
    return false;
  }
}
/** Copies de secours d'un préfixe : l'ancienne copie unique (onglet inconnu) et celles par onglet. */
function backupsUnder(base: string): { key: string; tabId: string | null }[] {
  const out: { key: string; tabId: string | null }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === base) out.push({ key, tabId: null });
      else if (key?.startsWith(base + ":tab:")) out.push({ key, tabId: key.slice(base.length + 5) });
    }
  } catch { /* stockage indisponible : aucune copie */ }
  return out;
}
function ownsSessionItem(key: string, userId: string): boolean {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return false;
    const owner = JSON.parse(raw).ownerId;
    return !owner || owner === userId;
  } catch {
    return false;
  }
}
function resetMarkerKey(userId: string) { return `${RESET_KEY}:${userId}${scopeSuffix()}`; }

/**
 * Onglet sans brouillon en sessionStorage : reprend sa propre copie de secours
 * ou la plus récente d'un onglet FERMÉ (jamais celle d'un onglet encore
 * ouvert), avec ses photos, et la range sous son propre identifiant.
 */
function adoptClosedTabBackup(userId: string) {
  try {
    if (ownsSessionItem(flowStorageKey(), userId) || ownsSessionItem(photosStorageKey(), userId)) return;
    const me = currentTabId(true);
    const resetAt = Number(sessionStorage.getItem(resetMarkerKey(userId))) || 0;
    const base = backupKeyFor(userId);
    const photosBase = photosBackupKeyFor(userId);
    let best: { key: string; tabId: string | null; raw: string; ts: number } | null = null;
    for (const candidate of backupsUnder(base)) {
      if (candidate.tabId && candidate.tabId !== me && tabIsOpen(candidate.tabId)) continue;
      const raw = localStorage.getItem(candidate.key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as FlowState;
      if (parsed.ownerId && parsed.ownerId !== userId) continue;
      const ts = Number(parsed.ts) || 0;
      if (candidate.tabId !== me && ts <= resetAt) continue;
      // Sa propre copie passe avant celle de tout autre onglet.
      const mine = candidate.tabId === me, bestIsMine = best?.tabId === me;
      if (!best || (mine && !bestIsMine) || (mine === bestIsMine && ts > best.ts)) best = { ...candidate, raw, ts };
    }
    // Ménage : copies d'onglets fermés depuis plus de 30 jours.
    for (const candidate of [...backupsUnder(base), ...backupsUnder(photosBase)]) {
      if (candidate.key === best?.key || (candidate.tabId && tabIsOpen(candidate.tabId))) continue;
      try {
        const ts = Number(JSON.parse(localStorage.getItem(candidate.key) || "{}").ts) || 0;
        if (ts && Date.now() - ts > STALE_BACKUP_MS) localStorage.removeItem(candidate.key);
      } catch { /* copie illisible : laissée en place */ }
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(PRESENCE_PREFIX + ":") && Date.now() - (Number(localStorage.getItem(key)) || 0) > 24 * 60 * 60_000) {
        localStorage.removeItem(key);
      }
    }
    if (!best || !me) return;
    sessionStorage.setItem(flowStorageKey(), best.raw);
    const mine = tabBackupKey(base, me);
    if (best.key !== mine) {
      localStorage.setItem(mine, best.raw);
      localStorage.removeItem(best.key);
    }
    const photosKey = best.tabId ? tabBackupKey(photosBase, best.tabId) : photosBase;
    const photos = localStorage.getItem(photosKey);
    if (photos) {
      sessionStorage.setItem(photosStorageKey(), photos);
      const myPhotos = tabBackupKey(photosBase, me);
      if (photosKey !== myPhotos) {
        localStorage.setItem(myPhotos, photos);
        localStorage.removeItem(photosKey);
      }
    }
    startTabPresence();
    markTabPresent();
  } catch { /* La copie reste en place si la reprise échoue. */ }
}
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
    const ownFlowKey = owner ? ownBackupKey(backupKeyFor(owner)) : null;
    if (ownFlowKey) localStorage.setItem(ownFlowKey, migrated);
    const photos = sessionStorage.getItem(PHOTOS_KEY) || (owner ? localStorage.getItem(`${PHOTOS_BACKUP_PREFIX}:${owner}`) : null);
    if (photos) {
      sessionStorage.setItem(photosStorageKey(), photos);
      const ownPhotosKey = owner ? ownBackupKey(photosBackupKeyFor(owner)) : null;
      if (ownPhotosKey) localStorage.setItem(ownPhotosKey, photos);
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
    // Carrousel trop lourd pour l'onglet (photos dans le HTML) : copie légère,
    // les visuels reviennent de Mes idées au rechargement (chantier U).
    let stored = clearCloudMarker(merged);
    try { sessionStorage.setItem(flowStorageKey(), JSON.stringify(stored)); }
    catch (error) {
      stored = slimFlowState(merged);
      if (!stored) throw error;
      sessionStorage.setItem(flowStorageKey(), JSON.stringify(stored));
      if (!stored.visualsInCloud) toast.warning("Tes visuels sont trop lourds pour la copie de ce navigateur. Enregistre ton contenu dans Mes idées avant de fermer cet onglet.", { id: "carousel-storage-warning" });
    }

    const userId = getFlowUserId();
    // Backup to localStorage for tab-recycling / HMR protection — scoped per user.
    // Initial typing is work too; explicit reset alone removes the backup.
    if (userId && merged.step) {
      try {
        const key = ownBackupKey(backupKeyFor(userId));
        if (!key) throw new Error("tab_id_unavailable");
        try { localStorage.setItem(key, JSON.stringify(stored)); }
        catch (error) { const light = slimFlowState(stored); if (!light) throw error; localStorage.setItem(key, JSON.stringify(light)); }
        startTabPresence();
        markTabPresent();
      } catch { toast.warning("La copie de secours n’a pas pu être enregistrée. Enregistre ton contenu dans Mes idées avant de fermer cet onglet.", { id: "carousel-storage-warning" }); }
    }
  } catch {
    if (state.step || state.ideaText !== undefined || state.result) toast.warning("Sauvegarde locale indisponible. Enregistre ton contenu dans Mes idées avant de fermer cet onglet.", { id: "carousel-storage-warning" });
  }
}

export function loadFlowState(): FlowState | null {
  try {
    const raw = sessionStorage.getItem(flowStorageKey());
    if (raw) {
      const parsed = JSON.parse(raw) as FlowState;
      if (!parsed.ownerId || parsed.ownerId === getFlowUserId()) return parsed;
      // Another account may have used this tab. Try this account's own backup.
    }
    // Fallback: copie de secours d'un onglet fermé (survit au recyclage d'onglet).
    const userId = getFlowUserId();
    if (!userId) return null; // No blind rehydration when user is unknown.
    adoptClosedTabBackup(userId);
    const adopted = sessionStorage.getItem(flowStorageKey());
    if (!adopted || adopted === raw) return null;
    const parsed = JSON.parse(adopted) as FlowState;
    return parsed.ownerId && parsed.ownerId !== userId ? null : parsed;
  } catch {
    return null;
  }
}

export function clearFlowState() {
  try {
    sessionStorage.removeItem(flowStorageKey());
    const userId = getFlowUserId();
    if (userId) {
      // Sa propre copie seulement : celles des autres onglets restent.
      const own = currentTabId(false);
      if (own) localStorage.removeItem(tabBackupKey(backupKeyFor(userId), own));
      localStorage.removeItem(backupKeyFor(userId));
      // Après une remise à zéro, ne pas faire réapparaître un brouillon plus
      // ancien laissé par un autre onglet.
      sessionStorage.setItem(resetMarkerKey(userId), String(Date.now()));
    } // An unknown session must never sweep other accounts' backups.
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
  libraryContext?: string;
  userPhotoId?: string;
  edited?: boolean;
  stockSource?: string;
  stockPhotographer?: string;
  stockSourceUrl?: string;
  /** Photo d'ambiance posée par l'app (src/lib/stock-ambient-photos.ts). */
  stockAmbient?: boolean;
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
async function idbGet(key: string, prefix: string): Promise<any> {
  const legacyKey = key;
  key = prefix + key;
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
async function idbClearAll(keep: Set<string> = new Set()): Promise<void> {
  const prefix = photoRecordPrefix();
  if (!idbAvailable()) return;
  try {
    const db = await idbOpen();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const store = tx.objectStore(IDB_STORE);
        const req = store.getAllKeys();
        req.onsuccess = () => req.result.forEach(k => {
          const key = String(k);
          if (key.startsWith(prefix) && !keep.has(key.slice(prefix.length))) store.delete(k);
        });
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
        context: p.context, libraryContext: p.libraryContext,
        userPhotoId: p.userPhotoId,
        edited: !!p.edited,
        stockSource: p.stockSource, stockPhotographer: p.stockPhotographer, stockSourceUrl: p.stockSourceUrl,
        ...(p.stockAmbient ? { stockAmbient: true } : {}),
        local: !isLibraryOriginal,
      });
      if (!isLibraryOriginal && p.base64 && idbAvailable()) {
        writes.push(idbPut(id, { base64: p.base64, mimeType: p.mimeType, name: p.name, originalBase64: p.originalBase64, originalMimeType: p.originalMimeType }));
      }
    }
    const payload = JSON.stringify({ photos: manifest, ownerId: getFlowUserId(), ts: Date.now() });
    try {
      sessionStorage.setItem(photosStorageKey(), payload);
      const userId = getFlowUserId();
      const key = userId ? ownBackupKey(photosBackupKeyFor(userId)) : null;
      if (key) localStorage.setItem(key, payload);
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
    if (raw) {
      const owner = JSON.parse(raw).ownerId;
      if (owner && owner !== getFlowUserId()) raw = null;
    }
    if (!raw) {
      const userId = getFlowUserId();
      if (userId) {
        adoptClosedTabBackup(userId);
        raw = sessionStorage.getItem(photosStorageKey());
        if (raw && JSON.parse(raw).ownerId && JSON.parse(raw).ownerId !== userId) raw = null;
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
            context: e.context, libraryContext: e.libraryContext,
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
  const prefix = photoRecordPrefix();
  const out: any[] = [];
  for (const e of manifest) {
    if (e._legacyBase64) {
      out.push({ ...e, id: e.id, base64: e._legacyBase64, preview: e._legacyBase64, name: e.name, mimeType: e.mimeType, context: e.context || "", userPhotoId: e.userPhotoId, edited: e.edited });
      continue;
    }
    if (e.local) {
      try {
        const rec = idbAvailable() ? await idbGet(e.id, prefix) : null;
        if (rec?.base64) {
          out.push({ ...e, originalBase64: rec.originalBase64, originalMimeType: rec.originalMimeType, id: e.id, base64: rec.base64, preview: rec.base64, name: e.name || rec.name, mimeType: e.mimeType || rec.mimeType, context: e.context || "", userPhotoId: e.userPhotoId, edited: e.edited });
          continue;
        }
      } catch {}
      // Preserve the slot so an incomplete photo set cannot look complete.
      out.push({ ...e, id: e.id, base64: "", preview: "", name: e.name, mimeType: e.mimeType, context: e.context || "", edited: e.edited, missingLocalPhoto: true });
      toast.warning("Une photo du brouillon n’a pas pu être restaurée. Réimporte-la avant d’enregistrer.", { id: "missing-draft-photo" });
    } else {
      out.push({ ...e, id: e.id, base64: "", preview: "", name: e.name, mimeType: e.mimeType, context: e.context || "", userPhotoId: e.userPhotoId, edited: e.edited, needsLibraryFetch: true });
    }
  }
  return out;
}

export function clearPhotos() {
  try { sessionStorage.removeItem(photosStorageKey()); } catch {}
  const keep = new Set<string>();
  try {
    const userId = getFlowUserId();
    if (userId) {
      const own = currentTabId(false);
      if (own) localStorage.removeItem(tabBackupKey(photosBackupKeyFor(userId), own));
      localStorage.removeItem(photosBackupKeyFor(userId));
      // Les photos encore citées par la copie d'un autre onglet restent.
      for (const { key } of backupsUnder(photosBackupKeyFor(userId))) {
        try {
          const photos = JSON.parse(localStorage.getItem(key) || "{}").photos;
          if (Array.isArray(photos)) photos.forEach((p: any) => p?.id && keep.add(p.id));
        } catch { /* manifeste illisible : ignoré */ }
      }
    }
  } catch { /* stockage indisponible */ }
  void idbClearAll(keep);
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
