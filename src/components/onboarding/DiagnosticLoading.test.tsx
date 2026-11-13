import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DiagnosticLoading from "./DiagnosticLoading";

let finishRequest!: (value: { data: unknown; error: null }) => void;
const invoke = vi.fn(() => new Promise<{ data: unknown; error: null }>((resolve) => { finishRequest = resolve; }));

let lastCall: unknown[] = [];
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: (...args: unknown[]) => { lastCall = args; return invoke(); } }));
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

describe("canaux envoyés au diagnostic", () => {
  it("envoie les libellés lisibles, pas les clés techniques (website → Site web)", async () => {
    render(<DiagnosticLoading {...props} answers={{ ...props.answers, canaux: ["instagram", "website"], desired_channels: ["linkedin", "newsletter"] }} />);
    await act(async () => { finishRequest(result([])); });
    const body = JSON.stringify(lastCall);
    expect(body).toContain('"channels":["Instagram","Site web"]');
    expect(body).toContain('"desired_channels":["LinkedIn","Newsletter"]');
    expect(body).not.toMatch(/"website"|"linkedin"/);
  });
});

describe("attente annoncée honnêtement", () => {
  it("annonce une durée et le temps écoulé, sans alarme à 15 ni à 30 s", async () => {
    vi.useFakeTimers();
    render(<DiagnosticLoading {...props} />);
    expect(screen.getByTestId("diagnostic-time-hint")).toHaveTextContent("Compte 1 à 2 minutes. Déjà 0 s");
    await act(async () => { vi.advanceTimersByTime(35_000); });
    expect(screen.getByTestId("diagnostic-time-hint")).toHaveTextContent("Déjà 35 s");
    expect(screen.queryByText(/plus de temps que prévu|diagnostic simplifié|plus long/)).not.toBeInTheDocument();
  });

  it("annonce environ 1 minute sans source, et ne dit « plus long » qu'après 90 s", async () => {
    vi.useFakeTimers();
    render(<DiagnosticLoading {...props} hasWebsite={false} answers={{ ...props.answers, website: "" }} />);
    expect(screen.getByTestId("diagnostic-time-hint")).toHaveTextContent("Compte environ 1 minute");
    await act(async () => { vi.advanceTimersByTime(91_000); });
    expect(screen.getByTestId("diagnostic-time-hint")).toHaveTextContent("C'est plus long que d'habitude, je continue. Déjà 1 min 31");
  });

  it("montre tout de suite ses réponses en mots, pas en clés", () => {
    render(<DiagnosticLoading {...props} answers={{ ...props.answers, activite: "Céramiste", canaux: ["instagram", "website"] }} />);
    const recap = screen.getByTestId("diagnostic-recap");
    expect(recap).toHaveTextContent("Ton activité : Céramiste");
    expect(recap).toHaveTextContent("Tes canaux : Instagram, Site web");
  });
});
