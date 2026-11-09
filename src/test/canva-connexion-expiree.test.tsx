import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Vérification « la connexion Canva marche-t-elle encore ? » faite au clic
// « Ouvrir dans Canva ». Règle : ne bloquer QUE sur un refus clair de Canva.

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));

import { canvaConnexionExpiree, CANVA_VERIF_TIMEOUT_MS } from "@/lib/canva-connexion-expiree";

describe("canvaConnexionExpiree", () => {
  beforeEach(() => { invoke.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it("demande à social-status de vraiment tenter le renouvellement", async () => {
    invoke.mockResolvedValue({ data: { connections: [] }, error: null });
    await canvaConnexionExpiree("ws-1");
    expect(invoke).toHaveBeenCalledWith("social-status", { body: { workspace_id: "ws-1", verify: true } });
  });

  it("Canva refuse → true", async () => {
    invoke.mockResolvedValue({ data: { connections: [
      { platform: "pinterest", needsReconnect: true },
      { platform: "canva", needsReconnect: true },
    ] }, error: null });
    expect(await canvaConnexionExpiree()).toBe(true);
  });

  it("Canva accepte, ou seule une autre plateforme est expirée → false", async () => {
    invoke.mockResolvedValue({ data: { connections: [
      { platform: "pinterest", needsReconnect: true },
      { platform: "canva", needsReconnect: false },
    ] }, error: null });
    expect(await canvaConnexionExpiree()).toBe(false);
  });

  it("erreur, réponse inattendue ou exception → false (jamais de fausse alarme)", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await canvaConnexionExpiree()).toBe(false);
    invoke.mockResolvedValue({ data: { error: "Erreur interne" }, error: null });
    expect(await canvaConnexionExpiree()).toBe(false);
    invoke.mockRejectedValue(new Error("réseau"));
    expect(await canvaConnexionExpiree()).toBe(false);
  });

  it("serveur trop lent → false au bout du délai", async () => {
    vi.useFakeTimers();
    invoke.mockReturnValue(new Promise(() => {}));
    const p = canvaConnexionExpiree();
    await vi.advanceTimersByTimeAsync(CANVA_VERIF_TIMEOUT_MS);
    expect(await p).toBe(false);
  });
});
