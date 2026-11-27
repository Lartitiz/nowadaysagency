import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

/* Post LinkedIn au fil de l'eau (27/11/2026) : le serveur envoie le texte écrit
   (évènement `draft`) pendant l'écriture ; il s'affiche, puis le post relu le
   remplace. Un brouillon non relu n'est jamais gardé comme résultat. */

const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: mocks.session, refreshSession: vi.fn() } } }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ activeWorkspace: null, workspaces: [] }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u" }, session: null }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useStreamingInvoke } from "@/hooks/use-streaming-invoke";
import { useGenerationReloadGuard } from "@/hooks/use-generation-reload-guard";
import CreerStepResult from "@/components/creer/CreerStepResult";

beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ data: { session: { access_token: "fixture" } } }); });
afterEach(() => vi.unstubAllGlobals());

const line = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
const FINAL = JSON.stringify({ content: "J'ai arrêté les remises. Relu.", accroche: "J'ai arrêté les remises." });

describe("useStreamingInvoke — brouillon envoyé pendant l'écriture", () => {
  it("affiche le brouillon, le signale comme tel, puis rend le texte final", async () => {
    let push!: (s: string) => void; let close!: () => void;
    const body = new ReadableStream<Uint8Array>({ start(c) { const e = new TextEncoder(); push = (s) => c.enqueue(e.encode(s)); close = () => c.close(); } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } })));
    const { result } = renderHook(useStreamingInvoke);
    let pending!: Promise<string>;
    act(() => { pending = result.current.invoke("creative-flow", {}); });
    await act(async () => { push(line({ type: "status", stage: "writing" }) + line({ type: "status", stage: "draft", text: "J'ai arrêté" })); });
    await vi.waitFor(() => expect(result.current.content).toBe("J'ai arrêté"));
    expect(result.current.isDraft).toBe(true);
    expect(result.current.stage).toBe("writing"); // « draft » n'écrase pas l'étape affichée
    await act(async () => { push(line({ type: "status", stage: "draft", text: "J'ai arrêté les remises." }) + line({ type: "status", stage: "correcting" })); });
    await vi.waitFor(() => expect(result.current.stage).toBe("correcting"));
    expect(result.current.content).toBe("J'ai arrêté les remises.");
    let full = "";
    await act(async () => { push(line({ type: "done", full: FINAL })); close(); full = await pending; });
    expect(full).toBe(FINAL);
    expect(result.current.content).toBe(FINAL);
    act(() => result.current.reset());
    expect(result.current.isDraft).toBe(false);
  });
});

describe("rechargement pendant un brouillon", () => {
  it("un texte vide (brouillon masqué) n'est jamais gardé ; un vrai flux l'est", () => {
    const save = vi.fn();
    const props = { restoredInterrupted: false, step: "result", result: null, busy: true, streaming: true, selectedFormat: "linkedin", conflictPending: false, saveFlowState: save };
    const { rerender } = renderHook((p: { streamingContent: string }) => useGenerationReloadGuard({ ...props, ...p }), { initialProps: { streamingContent: "" } });
    expect(save.mock.calls.some(([s]) => s.pendingStream)).toBe(false);
    rerender({ streamingContent: '{"content":"Texte reçu' });
    expect(save.mock.calls.some(([s]) => s.pendingStream?.text)).toBe(true);
  });
});

describe("CreerStepResult — post LinkedIn pendant l'attente", () => {
  const show = (stage: string, draft = true) => render(
    <MemoryRouter><CreerStepResult result={null} format="linkedin" generating streamingContent="J'ai arrêté les remises." streamIsDraft={draft} generationStage={stage}
      onEdit={vi.fn()} onReset={vi.fn()} onRegenerate={vi.fn()} onCopy={vi.fn()} /></MemoryRouter>,
  );
  it("pendant l'écriture : le texte est à l'écran", () => {
    show("writing");
    expect(screen.getByText("J'ai arrêté les remises.")).toBeTruthy();
    expect(screen.getByText(/rédige en temps réel/)).toBeTruthy();
    expect(screen.getByText("Brouillon, sera relu")).toBeTruthy();
  });
  it("texte d'un vrai flux (post Instagram) : pas d'étiquette brouillon", () => {
    show("writing", false);
    expect(screen.queryByText("Brouillon, sera relu")).toBeNull();
  });
  it("pendant la relecture : le texte reste, le message dit la relecture", () => {
    show("correcting");
    expect(screen.getByText("J'ai arrêté les remises.")).toBeTruthy();
    expect(screen.getByText(/Relecture finale/)).toBeTruthy();
  });
});
