import { describe, it, expect, vi, beforeEach } from "vitest";

// Garde anti-fuite : `invokeWithTimeout` ne doit JAMAIS remonter à l'utilisateur
// le message technique brut du SDK Supabase. Incident du 23/07 : quand la quasi-
// totalité des edge functions avaient disparu du serveur (404 « function not
// found »), l'app affichait « L'analyse a échoué : Failed to send a request to
// the Edge Function ». Le SDK ne LÈVE pas FunctionsFetchError, il le RENVOIE dans
// result.error → il tombait dans le chemin « Other HTTP error » qui laissait
// fuiter result.error.message tel quel.

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    auth: { refreshSession: mocks.refreshSession, signOut: mocks.signOut },
  },
}));

import { invokeWithTimeout } from "@/lib/invoke-with-timeout";

const RAW_FETCH_MSG = "Failed to send a request to the Edge Function";

function fetchError() {
  return { data: null, error: { name: "FunctionsFetchError", message: RAW_FETCH_MSG } };
}
// FunctionsHttpError : status + corps lisible via context.json()
function httpError(status: number, jsonBody: any) {
  return {
    data: null,
    error: { name: "FunctionsHttpError", context: { status, json: async () => jsonBody } },
  };
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.refreshSession.mockReset();
  mocks.signOut.mockReset();
  // Session valide par défaut : le refresh réussit (pas de signOut).
  mocks.refreshSession.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
});

describe("invokeWithTimeout — jamais de message brut du SDK", () => {
  it("FunctionsFetchError (fonction injoignable) → message clair, pas le brut", async () => {
    // 1er appel + retry après refresh échouent tous deux en fetch error
    mocks.invoke.mockResolvedValue(fetchError());
    const { data, error } = await invokeWithTimeout("analyze-brand", { body: {} });

    expect(error).not.toBeNull();
    expect(error!.message).not.toContain("Failed to send a request");
    expect(error!.code).toBe("NETWORK");
    expect(error!.isNetwork).toBe(true);
    expect(error!.message).toBe("Le service est momentanément indisponible. Réessaie dans quelques instants.");
    expect(data).toBeNull();
  });

  it("404 « function not found » → message d'indisponibilité, pas le texte plateforme", async () => {
    mocks.invoke.mockResolvedValue(
      httpError(404, { code: "NOT_FOUND_FUNCTION_BLOB", message: "Requested function was not found" })
    );
    const { error } = await invokeWithTimeout("analyze-brand", { body: {} });

    expect(error!.message).not.toContain("Requested function was not found");
    expect(error!.message).toBe("Le service est momentanément indisponible. Réessaie dans quelques instants.");
  });

  it("503 BOOT_ERROR (edge plantée au démarrage) → message d'indisponibilité", async () => {
    mocks.invoke.mockResolvedValue(httpError(503, { message: "BOOT_ERROR" }));
    const { error } = await invokeWithTimeout("engagement-coaching", { body: {} });
    expect(error!.message).toBe("Le service est momentanément indisponible. Réessaie dans quelques instants.");
  });

  it("appel photo injoignable → message dédié « moins de photos »", async () => {
    mocks.invoke.mockResolvedValue(fetchError());
    const { error } = await invokeWithTimeout("carousel-visual", { body: { photo_mode: true } });
    expect(error!.code).toBe("NETWORK");
    expect(error!.message).toContain("moins de photos");
  });
});

describe("invokeWithTimeout — non-régression", () => {
  it("500 applicatif avec message métier → on garde le message métier", async () => {
    mocks.invoke.mockResolvedValue(httpError(500, { message: "Ton texte dépasse la limite autorisée" }));
    const { error } = await invokeWithTimeout("generate-content", { body: {} });
    expect(error!.code).toBe("SERVER_ERROR");
    expect(error!.message).toBe("Ton texte dépasse la limite autorisée");
  });

  it("429 → erreur de quota typée", async () => {
    mocks.invoke.mockResolvedValue(httpError(429, { message: "Limite de crédits atteinte" }));
    const { error } = await invokeWithTimeout("carousel-ai", { body: {} });
    expect(error!.code).toBe("RATE_LIMIT");
    expect(error!.isRateLimit).toBe(true);
  });

  it("succès → data passe, error null", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, result: 42 }, error: null });
    const { data, error } = await invokeWithTimeout("carousel-ai", { body: {} });
    expect(error).toBeNull();
    expect(data).toEqual({ ok: true, result: 42 });
  });

  it("erreur applicative dans le corps (200 + data.error) → GENERATION_ERROR", async () => {
    mocks.invoke.mockResolvedValue({ data: { error: "photo_mismatch", message: "La photo ne correspond pas" }, error: null });
    const { error } = await invokeWithTimeout("carousel-ai", { body: {} });
    expect(error!.code).toBe("GENERATION_ERROR");
    expect(error!.message).toBe("La photo ne correspond pas");
  });

  it("401 puis retry réussi après refresh → data passe", async () => {
    mocks.invoke
      .mockResolvedValueOnce(httpError(401, { message: "JWT expired" }))
      .mockResolvedValueOnce({ data: { ok: true }, error: null });
    const { data, error } = await invokeWithTimeout("generate-content", { body: {} });
    expect(mocks.refreshSession).toHaveBeenCalledOnce();
    expect(error).toBeNull();
    expect(data).toEqual({ ok: true });
  });
});
