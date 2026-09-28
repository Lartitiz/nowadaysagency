import { act, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOnboarding } from "@/hooks/use-onboarding";

const m = vi.hoisted(() => ({
  userId: "qa-a",
  query: vi.fn(),
  writes: [] as Array<{ table: string; operation: string; data: Record<string, unknown> }>,
  navigate: vi.fn(),
  failCompletion: false,
  failSave: false,
  existingCompleted: false,
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: m.userId, user_metadata: {} } }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: false, demoData: null }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ ownWorkspace: null }) }));
vi.mock("@/hooks/use-workspace-query", () => ({
  useWorkspaceFilter: () => ({ column: "user_id", value: m.userId }),
  useWorkspaceId: () => m.userId,
  useProfileUserId: () => m.userId,
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => m.navigate }));
vi.mock("@/lib/posthog", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@/lib/onboarding-status", () => ({ resolveOnboardingStatus: async () => "needs" }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let operation = "read";
      const chain = {
        select: () => chain,
        update: (data: Record<string, unknown>) => { operation = "update"; m.writes.push({ table, operation, data }); return chain; },
        insert: (data: Record<string, unknown>) => { operation = "insert"; m.writes.push({ table, operation, data }); return chain; },
        eq: (...args: unknown[]) => { if (table === "user_documents") m.query("eq", ...args); return chain; },
        order: () => chain,
        limit: () => chain,
        in: (...args: unknown[]) => {
          m.query("in", ...args);
          return Promise.resolve({ data: [{ id: "file-a", file_name: "profil.png", file_url: "qa-a/onboarding/profil.png" }], error: null });
        },
        maybeSingle: async () => ({
          data: operation === "update" && !m.failCompletion
            ? { id: "saved" }
            : operation === "read" && m.existingCompleted && ["profiles", "user_plan_config"].includes(table)
              ? { id: "existing", onboarding_completed: true, onboarding_completed_at: "2026-09-01T09:00:00Z" }
              : null,
          error: null,
        }),
        then: (resolve: (value: { data: null; error: Error | null }) => void) =>
          Promise.resolve({ data: null, error: m.failSave && (operation === "insert" || operation === "update") ? new Error("offline") : null }).then(resolve),
      };
      return chain;
    },
  },
}));

beforeEach(() => { localStorage.clear(); m.userId = "qa-a"; m.failCompletion = false; m.failSave = false; m.existingCompleted = false; m.query.mockClear(); m.writes.length = 0; m.navigate.mockClear(); });

describe("reprise des captures de l'onboarding", () => {
  it("relit les réponses avant de reprendre une analyse interrompue", async () => {
    localStorage.setItem("lac_onboarding_step", "10");
    localStorage.setItem("lac_onboarding_answers", JSON.stringify({ prenom: "Test", website: "https://exemple.fr" }));
    localStorage.setItem("lac_onboarding_ts", new Date().toISOString());
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.draftRestored).toBe(true));
    expect(result.current.step).toBe(10);
    expect(result.current.answers.website).toBe("https://exemple.fr");
  });

  it("ne revient pas au formulaire avec Échap pendant l'analyse", async () => {
    localStorage.setItem("lac_onboarding_step", "10");
    localStorage.setItem("lac_onboarding_ts", new Date().toISOString());
    localStorage.setItem("lac_onboarding_diagnostic:qa-a", JSON.stringify({ totalScore: 50 }));
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.draftRestored).toBe(true));
    act(() => fireEvent.keyDown(window, { key: "Escape" }));
    expect(result.current.step).toBe(10);
  });

  it("réaffiche le résultat enregistré après un rafraîchissement", async () => {
    const diagnosis = { totalScore: 57, strengths: [], weaknesses: [], priorities: [], channelScores: [] };
    localStorage.setItem("lac_onboarding_step", "11");
    localStorage.setItem("lac_onboarding_ts", new Date().toISOString());
    localStorage.setItem("lac_onboarding_diagnostic:qa-a", JSON.stringify(diagnosis));
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.diagnosticData).toEqual(diagnosis));
    expect(result.current.step).toBe(11);
  });

  it("retrouve les documents du compte avant de lancer le diagnostic", async () => {
    localStorage.setItem("lac_onboarding_upload_ids:qa-a", JSON.stringify(["file-a"]));
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.uploadsRestored).toBe(false);
    await waitFor(() => expect(result.current.uploadsRestored).toBe(true));
    expect(result.current.uploadedFiles).toEqual([{
      id: "file-a", name: "profil.png", url: "qa-a/onboarding/profil.png",
    }]);
    expect(m.query).toHaveBeenCalledWith("eq", "user_id", "qa-a");
    expect(m.query).toHaveBeenCalledWith("eq", "context", "onboarding");
    expect(m.query).toHaveBeenCalledWith("in", "id", ["file-a"]);
  });

  it("ne reporte pas les captures d'un compte sur le suivant", async () => {
    localStorage.setItem("lac_onboarding_upload_ids:qa-a", JSON.stringify(["file-a"]));
    const { result, rerender } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.uploadedFiles).toHaveLength(1));
    m.userId = "qa-b";
    rerender();
    await waitFor(() => expect(result.current.uploadsRestored).toBe(true));
    expect(result.current.uploadedFiles).toEqual([]);
    expect(JSON.parse(localStorage.getItem("lac_onboarding_upload_ids:qa-b") || "[]")).toEqual([]);
  });

  it("garde le brouillon et le statut incomplet pendant l'analyse, puis confirme à la fin", async () => {
    localStorage.setItem("lac_onboarding_step", "9");
    localStorage.setItem("lac_onboarding_answers", JSON.stringify({ prenom: "Test", activite: "Céramiste" }));
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.draftRestored).toBe(true));
    await act(async () => { await result.current.handleFinish(); });
    expect(m.writes.find(w => w.table === "profiles" && w.operation === "insert")?.data.onboarding_completed).toBe(false);
    expect(m.writes.find(w => w.table === "user_plan_config" && w.operation === "insert")?.data.onboarding_completed).toBe(false);
    expect(localStorage.getItem("lac_onboarding_answers")).not.toBeNull();

    await act(async () => { await result.current.handleDiagnosticComplete(); });
    expect(m.writes.find(w => w.table === "profiles" && w.operation === "update")?.data.onboarding_completed).toBe(true);
    expect(m.writes.find(w => w.table === "user_plan_config" && w.operation === "update")?.data.onboarding_completed).toBe(true);
    expect(localStorage.getItem("lac_onboarding_answers")).toBeNull();
    expect(m.navigate).toHaveBeenCalledWith("/welcome", { replace: true });
  });

  it("ne révoque pas un onboarding déjà terminé pendant une relance volontaire", async () => {
    m.existingCompleted = true;
    const { result } = renderHook(() => useOnboarding());
    await act(async () => { await result.current.handleFinish(); });
    const profile = m.writes.find(w => w.table === "profiles" && w.operation === "update")?.data;
    const config = m.writes.find(w => w.table === "user_plan_config" && w.operation === "update")?.data;
    expect(profile?.onboarding_completed).toBe(true);
    expect(profile?.onboarding_completed_at).toBe("2026-09-01T09:00:00Z");
    expect(config?.onboarding_completed).toBe(true);
    expect(config?.onboarding_completed_at).toBe("2026-09-01T09:00:00Z");
  });

  it("ne quitte pas le résultat si aucune ligne de complétion n'a été mise à jour", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem("lac_onboarding_answers", JSON.stringify({ prenom: "Test" }));
    const { result } = renderHook(() => useOnboarding());
    m.failCompletion = true;
    await act(async () => { await result.current.handleDiagnosticComplete(); });
    expect(m.navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem("lac_onboarding_answers")).not.toBeNull();

    m.failCompletion = false;
    await act(async () => { await result.current.handleDiagnosticComplete(); });
    expect(m.navigate).toHaveBeenCalledWith("/welcome", { replace: true });
    log.mockRestore();
  });

  it("ne valide pas l'onboarding si le profil ne s'enregistre pas, puis permet de réessayer", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem("lac_onboarding_answers", JSON.stringify({ prenom: "Test" }));
    const { result } = renderHook(() => useOnboarding());
    m.failSave = true;
    await act(async () => { await result.current.handleDiagnosticComplete(); });
    expect(m.navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem("lac_onboarding_answers")).not.toBeNull();
    expect(m.writes.some(w => w.data.onboarding_completed === true)).toBe(false);

    m.failSave = false;
    await act(async () => { await result.current.handleDiagnosticComplete(); });
    expect(m.navigate).toHaveBeenCalledWith("/welcome", { replace: true });
    log.mockRestore();
  });
});
