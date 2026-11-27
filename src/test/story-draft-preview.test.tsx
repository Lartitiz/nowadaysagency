import { act, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Stories en brouillon (27/11/2026) : chaque story écrite s'affiche pendant
   l'écriture (évènement SSE `draft` de creative-flow), au lieu d'un écran vide
   jusqu'à la fin. Même idée que le reel. */

const mocks = vi.hoisted(() => ({ heartbeat: vi.fn(), timeout: vi.fn() }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.timeout }));
vi.mock("@/lib/invoke-with-heartbeat", () => ({ invokeWithHeartbeat: mocks.heartbeat }));
vi.mock("@/hooks/use-streaming-invoke", () => ({ useStreamingInvoke: () => ({ invoke: vi.fn(), reset: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "workspace" }));
vi.mock("@/lib/posthog-lazy", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@/lib/quota-error-handler", () => ({ handleQuotaError: () => false }));

import { useContentGenerator } from "@/hooks/use-content-generator";
import { StoryDraftPreview, mergeStoryDraft } from "@/components/creer/StoryDraftPreview";

const S1 = { number: 1, role: "Hook", text: "Je te fais attendre six semaines.", sticker: "Sondage" };
const S2 = { number: 2, role: "Corps", text: "Un savon frais fond en trois douches.", sticker: "" };

beforeEach(() => vi.clearAllMocks());

describe("useContentGenerator — stories en flux", () => {
  it("passe par le flux, montre les stories une à une, puis vide le brouillon à la fin", async () => {
    let next!: () => void;
    let release!: () => void;
    const hook = renderHook(useContentGenerator);
    mocks.heartbeat.mockImplementation(async (fn: string, opts: any) => {
      expect(fn).toBe("creative-flow");
      expect(opts.signal).toBeTruthy();
      opts.onStatus("draft", { story: { stories: [S1] } });
      await new Promise<void>((r) => { next = r; });
      opts.onStatus("draft", { story: { stories: [S1, S2] } });
      opts.onStatus("correcting");
      await new Promise<void>((r) => { release = r; });
      return { data: { format: "story", stories: [{ ...S1 }, { ...S2 }] }, error: null };
    });
    let done!: Promise<unknown>;
    act(() => { done = hook.result.current.generate({ format: "story", subject: "Mes savons" } as any); });
    await vi.waitFor(() => expect(hook.result.current.storyDraft?.stories).toHaveLength(1));
    act(() => next());
    await vi.waitFor(() => expect(hook.result.current.storyDraft?.stories).toHaveLength(2));
    expect(mocks.timeout).not.toHaveBeenCalled();
    expect(hook.result.current.generationStage).toBe("correcting");
    await act(async () => { release(); await done; });
    expect(hook.result.current.storyDraft).toBeNull();
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.result).not.toBeNull();
  });

  it("échec : le brouillon est vidé et l'erreur est dite", async () => {
    const hook = renderHook(useContentGenerator);
    mocks.heartbeat.mockImplementation(async (_fn: string, opts: any) => {
      opts.onStatus("draft", { story: { stories: [S1] } });
      return { data: null, error: { message: "Le serveur a mis trop de temps à répondre.", code: "NETWORK" } };
    });
    await act(async () => { await hook.result.current.generate({ format: "story", subject: "Mes savons" } as any); });
    expect(hook.result.current.storyDraft).toBeNull();
    expect(hook.result.current.error).toBeTruthy();
    expect(hook.result.current.result).toBeNull();
  });
});

describe("StoryDraftPreview", () => {
  it("stories écrites : une carte par story, signalées en brouillon", () => {
    render(<StoryDraftPreview draft={{ stories: [S1, S2] }} stage="generating" />);
    expect(screen.getByTestId("story-draft-list").querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByText("Brouillon, sera relu")).toBeTruthy();
    expect(screen.getByText("Je te fais attendre six semaines.")).toBeTruthy();
    expect(screen.getByText("Sticker : Sondage")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("2 déjà écrites");
  });
  it("relecture : le message le dit", () => {
    render(<StoryDraftPreview draft={{ stories: [S1] }} stage="correcting" />);
    expect(screen.getByRole("status").textContent).toContain("Je relis");
  });
  it("les stories déjà affichées ne reculent jamais", () => {
    const two = { stories: [S1, S2] };
    expect(mergeStoryDraft(two, { stories: [S1] })).toBe(two);
    expect(mergeStoryDraft(null, { stories: [S1] }).stories).toHaveLength(1);
  });
});

/* Rendu réel de l'écran d'attente de /creer : les stories écrites remplacent le rectangle vide. */
import CreerStepResult from "@/components/creer/CreerStepResult";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ activeWorkspace: null, workspaces: [] }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("CreerStepResult — attente des stories", () => {
  const renderWaiting = (storyDraft: any, format = "story") => render(
    <MemoryRouter><CreerStepResult result={null} format={format} generating storyDraft={storyDraft} generationStage="writing"
      onEdit={vi.fn()} onReset={vi.fn()} onRegenerate={vi.fn()} onCopy={vi.fn()} /></MemoryRouter>,
  );
  it("avec un brouillon : les stories écrites sont à l'écran", () => {
    renderWaiting({ stories: [S1, S2] });
    expect(screen.getByTestId("story-draft-preview")).toBeTruthy();
    expect(screen.getByText("Un savon frais fond en trois douches.")).toBeTruthy();
  });
  it("sans brouillon : l'attente habituelle, pas d'aperçu", () => {
    renderWaiting(null);
    expect(screen.queryByTestId("story-draft-preview")).toBeNull();
  });
  it("un brouillon de stories n'apparaît jamais sur un autre format", () => {
    renderWaiting({ stories: [S1] }, "post");
    expect(screen.queryByTestId("story-draft-preview")).toBeNull();
  });
});
