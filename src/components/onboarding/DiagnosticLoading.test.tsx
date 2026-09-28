import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DiagnosticLoading from "./DiagnosticLoading";

let finishRequest!: (value: { data: unknown; error: null }) => void;
const invoke = vi.fn(() => new Promise<{ data: unknown; error: null }>((resolve) => { finishRequest = resolve; }));

vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: () => invoke() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "qa-user" } }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ ownWorkspace: { id: "qa-space" } }) }));

const result = (used: string[]) => ({
  data: {
    diagnostic: { scores: { total: 52, website: 48 }, strengths: [], weaknesses: [], priorities: [] },
    sources_used: used,
    sources_failed: used.includes("website") ? [] : ["website"],
  },
  error: null as null,
});

const props = {
  hasInstagram: false,
  hasWebsite: true,
  hasDocuments: false,
  isDemoMode: false,
  answers: { canaux: ["website"], instagram: "", website: "https://exemple.fr" },
  brandingAnswers: { positioning: "", mission: "", target_description: "", tone_keywords: [], offers: [], values: [] },
  onReady: vi.fn(),
};

afterEach(() => {
  vi.useRealTimers();
  invoke.mockClear();
  props.onReady.mockClear();
});

describe("provenance du chargement du diagnostic", () => {
  it("n'annonce pas une lecture réussie avant la réponse du site", async () => {
    vi.useFakeTimers();
    render(<DiagnosticLoading {...props} />);
    await act(async () => { vi.advanceTimersByTime(3500); });
    const line = screen.getByText("Ton site web").parentElement!;
    expect(within(line).getByText("en cours...")).toBeInTheDocument();
    expect(within(line).queryByText("✅")).not.toBeInTheDocument();

    await act(async () => { finishRequest(result([])); });
    expect(within(line).getByText("non disponible")).toBeInTheDocument();
  });

  it("ne coche le site que s'il figure dans les sources effectivement lues", async () => {
    render(<DiagnosticLoading {...props} />);
    const line = screen.getByText("Ton site web").parentElement!;
    await act(async () => { finishRequest(result(["website"])); });
    expect(within(line).getByText("✅")).toBeInTheDocument();
  });
});
