import { act, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Reel en brouillon (13/11/2026) : l'accroche choisie s'affiche tout de suite,
   puis le script écrit arrive par l'évènement SSE `draft` de creative-flow,
   pendant la relecture. Avant : téléphone vide pendant 1 à 2 minutes. */

const mocks = vi.hoisted(() => ({ heartbeat: vi.fn(), timeout: vi.fn() }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.timeout }));
vi.mock("@/lib/invoke-with-heartbeat", () => ({ invokeWithHeartbeat: mocks.heartbeat }));
vi.mock("@/hooks/use-streaming-invoke", () => ({ useStreamingInvoke: () => ({ invoke: vi.fn(), reset: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "workspace" }));
vi.mock("@/lib/posthog-lazy", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@/lib/quota-error-handler", () => ({ handleQuotaError: () => false }));

import { useContentGenerator } from "@/hooks/use-content-generator";
import { ReelDraftPreview, chosenHookText } from "@/components/creer/ReelDraftPreview";

const SCRIPT = [
  { timing: "0-3 sec", texte_parle: "J'ai arrêté les remises.", texte_overlay: "REMISES" },
  { timing: "3-20 sec", texte_parle: "La cliente a signé quand même.", texte_overlay: "" },
];

beforeEach(() => vi.clearAllMocks());

describe("useContentGenerator — reel en flux", () => {
  it("passe par le flux, montre l'accroche choisie, puis le brouillon, puis vide le brouillon à la fin", async () => {
    const seen: any[] = [];
    let release!: () => void;
    const hook = renderHook(useContentGenerator);
    mocks.heartbeat.mockImplementation(async (fn: string, opts: any) => {
      expect(fn).toBe("creative-flow");
      seen.push(hook.result.current.reelDraft);
      opts.onStatus("draft", { reel: { hook: "Accroche du brouillon", sections: SCRIPT } });
      opts.onStatus("correcting");
      await new Promise<void>((r) => { release = r; });
      return { data: { format: "reel", hook: "J'ai arrêté les remises.", script: SCRIPT, sections: SCRIPT }, error: null };
    });
    let done!: Promise<unknown>;
    act(() => { done = hook.result.current.generate({ format: "reel", subject: "Mes remises", selectedHook: { text: "J'ai arrêté les remises." } } as any); });
    await vi.waitFor(() => expect(hook.result.current.reelDraft?.sections).toHaveLength(2));
    expect(mocks.timeout).not.toHaveBeenCalled();
    // L'accroche choisie reste celle affichée, le script arrive en brouillon.
    expect(hook.result.current.reelDraft?.hook).toBe("J'ai arrêté les remises.");
    expect(hook.result.current.generationStage).toBe("correcting");
    await act(async () => { release(); await done; });
    expect(hook.result.current.reelDraft).toBeNull();
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.result).not.toBeNull();
  });
});

describe("ReelDraftPreview", () => {
  it("avant le script : accroche dans le téléphone et scènes en attente", () => {
    render(<ReelDraftPreview draft={{ hook: "J'ai arrêté les remises.", sections: [] }} />);
    expect(screen.getByTestId("reel-draft-phone").textContent).toContain("J'ai arrêté les remises.");
    expect(screen.getByTestId("reel-draft-skeleton")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("scène par scène");
  });
  it("script écrit : scènes en brouillon signalées, relecture en cours", () => {
    render(<ReelDraftPreview draft={{ hook: "", sections: SCRIPT }} stage="correcting" />);
    expect(screen.getByTestId("reel-draft-scenes").querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByText("Brouillon, sera relu")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Je relis");
    // Sans accroche choisie, le texte à l'écran de la 1re scène occupe le téléphone.
    expect(screen.getByTestId("reel-draft-phone").textContent).toContain("REMISES");
  });
  it("lit l'accroche choisie sous ses deux formes", () => {
    expect(chosenHookText({ text: " Une accroche " })).toBe("Une accroche");
    expect(chosenHookText("Texte")).toBe("Texte");
    expect(chosenHookText(null)).toBe("");
  });
});
