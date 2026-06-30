import { describe, it, expect, beforeEach, vi } from "vitest";

// Environnement "unit" = node : pas de localStorage/sessionStorage/indexedDB natifs.
// On pose des mocks mémoire minimalistes AVANT d'importer le module testé.
class MemoryStorage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  key(i: number) { return Array.from(this.store.keys())[i] ?? null; }
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

const deletedDbs: string[] = [];

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("sessionStorage", new MemoryStorage());
  vi.stubGlobal("indexedDB", { deleteDatabase: (n: string) => { deletedDbs.push(n); } });
  deletedDbs.length = 0;
});

describe("clearAppStorage — isolation entre comptes", () => {
  it("purge active_workspace_id (sinon le workspace fuite entre comptes empilés)", async () => {
    const { clearAppStorage } = await import("@/lib/storage-cleanup");
    localStorage.setItem("active_workspace_id", "ws-du-compte-precedent");

    clearAppStorage();

    expect(localStorage.getItem("active_workspace_id")).toBeNull();
  });

  it("NE purge PAS saved_accounts (sinon le sélecteur multi-comptes casserait)", async () => {
    const { clearAppStorage } = await import("@/lib/storage-cleanup");
    localStorage.setItem("saved_accounts", '[{"email":"a@b.c"}]');

    clearAppStorage();

    expect(localStorage.getItem("saved_accounts")).toBe('[{"email":"a@b.c"}]');
  });

  it("purge aussi les clés/préfixes app connus (creer_flow, backups, IDB)", async () => {
    const { clearAppStorage } = await import("@/lib/storage-cleanup");
    sessionStorage.setItem("creer_flow_state", "x");
    localStorage.setItem("creer_flow_state_backup:user-123", "y");

    clearAppStorage();

    expect(sessionStorage.getItem("creer_flow_state")).toBeNull();
    expect(localStorage.getItem("creer_flow_state_backup:user-123")).toBeNull();
    expect(deletedDbs).toContain("creer_photos");
  });

  it("purge le prénom + le brouillon d'onboarding (sinon « Camille » se réécrit entre comptes/espaces)", async () => {
    const { clearAppStorage } = await import("@/lib/storage-cleanup");
    localStorage.setItem("lac_prenom", "Camille");
    localStorage.setItem("lac_onboarding_step", "3");
    localStorage.setItem("lac_onboarding_answers", '{"prenom":"Camille"}');
    localStorage.setItem("lac_onboarding_branding", "{}");
    localStorage.setItem("lac_onboarding_ts", "2026-06-30T00:00:00.000Z");
    localStorage.setItem("lac_branding_cache_refreshed", "true");

    clearAppStorage();

    expect(localStorage.getItem("lac_prenom")).toBeNull();
    expect(localStorage.getItem("lac_onboarding_step")).toBeNull();
    expect(localStorage.getItem("lac_onboarding_answers")).toBeNull();
    expect(localStorage.getItem("lac_onboarding_branding")).toBeNull();
    expect(localStorage.getItem("lac_onboarding_ts")).toBeNull();
    expect(localStorage.getItem("lac_branding_cache_refreshed")).toBeNull();
  });

  it("purge l'état du bandeau missions (replié/masqué/vu) — sinon il bave entre espaces", async () => {
    const { clearAppStorage } = await import("@/lib/storage-cleanup");
    localStorage.setItem("lac_missions_collapsed", "true");
    localStorage.setItem("lac_missions_first_seen", "true");
    localStorage.setItem("missions_dismissed_at", String(Date.now()));

    clearAppStorage();

    expect(localStorage.getItem("lac_missions_collapsed")).toBeNull();
    expect(localStorage.getItem("lac_missions_first_seen")).toBeNull();
    expect(localStorage.getItem("missions_dismissed_at")).toBeNull();
  });
});
