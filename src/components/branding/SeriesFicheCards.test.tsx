import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SerieSummary } from "@/hooks/use-series";

// ─── Mocks ────────────────────────────────────────────────

const mockUpdateStatus = vi.fn();
const mockDeleteSerie = vi.fn();
const mockRefetch = vi.fn();

let mockSeriesState: {
  series: SerieSummary[];
  activeSeries: SerieSummary[];
  archivedSeries: SerieSummary[];
  loading: boolean;
} = {
  series: [],
  activeSeries: [],
  archivedSeries: [],
  loading: false,
};

vi.mock("@/hooks/use-series", () => ({
  useSeries: () => ({
    ...mockSeriesState,
    refetch: mockRefetch,
    updateStatus: mockUpdateStatus,
    deleteSerie: mockDeleteSerie,
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-123" } }),
}));

vi.mock("@/hooks/use-workspace-query", () => ({
  useWorkspaceFilter: () => ({ column: "user_id", value: "user-123" }),
}));

// Supabase mock — pillar labels query + update from inline edit
const mockMaybeSingle = vi.fn().mockResolvedValue({
  data: {
    pillar_major: "Stratégie",
    pillar_minor_1: "Coulisses",
    pillar_minor_2: "Inspiration",
    pillar_minor_3: null,
  },
});
const mockEq = vi.fn().mockReturnThis();
const mockSelect = vi.fn(() => ({ eq: mockEq, maybeSingle: mockMaybeSingle }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      eq: mockEq,
      maybeSingle: mockMaybeSingle,
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

// EditableField is heavy — stub it
vi.mock("@/components/branding/EditableField", () => ({
  default: ({ label, value }: { label: string; value: string }) => (
    <div data-testid={`editable-${label}`}>{label}: {value}</div>
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Re-set default mockEq behavior to resolve to maybeSingle data when chained
mockEq.mockImplementation(() => ({ maybeSingle: mockMaybeSingle }));

import SeriesFicheCards from "./SeriesFicheCards";

const baseSerie = (overrides: Partial<SerieSummary> = {}): SerieSummary => ({
  id: "serie-1",
  name: "Le cas client du vendredi",
  promise: "Décortiquer une situation client chaque vendredi",
  pillar_key: "pillar_major",
  cadence: "weekly",
  format_template: "Carrousel 8 slides",
  signature_description: "Toujours sur fond beige",
  channels: ["instagram", "linkedin"],
  status: "active",
  planned_episodes: null,
  notes: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  mockUpdateStatus.mockClear().mockResolvedValue(undefined);
  mockDeleteSerie.mockClear().mockResolvedValue(undefined);
  mockRefetch.mockClear().mockResolvedValue(undefined);
  mockSeriesState = {
    series: [],
    activeSeries: [],
    archivedSeries: [],
    loading: false,
  };
});

// ─── Tests ────────────────────────────────────────────────

describe("SeriesFicheCards — 4 component states", () => {
  it("State 1 — Skeleton: renders 2 pulsing placeholders while loading", () => {
    mockSeriesState = { series: [], activeSeries: [], archivedSeries: [], loading: true };
    const { container } = render(
      <SeriesFicheCards hasRecap={true} onLaunchCoaching={vi.fn()} />
    );
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons).toHaveLength(2);
  });

  it("State 2 — Empty: shows CTA when recap OK but 0 series", () => {
    const onLaunchCoaching = vi.fn();
    render(<SeriesFicheCards hasRecap={true} onLaunchCoaching={onLaunchCoaching} />);
    expect(screen.getByText(/Tu n'as pas encore défini de série/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Lancer le coaching séries/i }));
    expect(onLaunchCoaching).toHaveBeenCalledTimes(1);
  });

  it("State 3 — Pedagogical: hasRecap=false shows 'piliers pas encore définis' panel", () => {
    const onLaunchCoaching = vi.fn();
    render(<SeriesFicheCards hasRecap={false} onLaunchCoaching={onLaunchCoaching} />);
    expect(
      screen.getByText(/Tu n'as pas encore défini tes piliers éditoriaux/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Lancer le coaching séries/i }));
    expect(onLaunchCoaching).toHaveBeenCalledTimes(1);
  });

  it("State 4 — List: renders series cards with name, promise, badges, and humanized chips", async () => {
    const serie = baseSerie();
    mockSeriesState = {
      series: [serie],
      activeSeries: [serie],
      archivedSeries: [],
      loading: false,
    };
    render(<SeriesFicheCards hasRecap={true} onLaunchCoaching={vi.fn()} />);

    expect(screen.getByText(serie.name)).toBeInTheDocument();
    expect(screen.getByText(serie.promise)).toBeInTheDocument();

    // Pillar badge mapped to real label (pillar_major → "Stratégie")
    await waitFor(() => {
      expect(screen.getByText(/Stratégie/)).toBeInTheDocument();
    });

    // Cadence chip humanized: weekly → "Hebdo"
    expect(screen.getByText(/Hebdo/)).toBeInTheDocument();

    // Channels mapped
    expect(screen.getByText("Instagram")).toBeInTheDocument();
    expect(screen.getByText("LinkedIn")).toBeInTheDocument();

    // Format template
    expect(screen.getByText(/Carrousel 8 slides/)).toBeInTheDocument();

    // Affiner button visible when at least 1 active serie
    expect(screen.getByRole("button", { name: /Affiner mes séries/i })).toBeInTheDocument();
  });
});

describe("SeriesFicheCards — card actions", () => {
  it("opens dropdown menu and triggers status change to paused", async () => {
    const user = userEvent.setup();
    const serie = baseSerie();
    mockSeriesState = {
      series: [serie],
      activeSeries: [serie],
      archivedSeries: [],
      loading: false,
    };
    render(<SeriesFicheCards hasRecap={true} onLaunchCoaching={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Options/i }));
    const pauseItem = await screen.findByRole("menuitem", { name: /Mettre en pause/i });
    await user.click(pauseItem);

    expect(mockUpdateStatus).toHaveBeenCalledWith(serie.id, "paused");
  });

  it("triggers archive action from menu", async () => {
    const user = userEvent.setup();
    const serie = baseSerie();
    mockSeriesState = {
      series: [serie],
      activeSeries: [serie],
      archivedSeries: [],
      loading: false,
    };
    render(<SeriesFicheCards hasRecap={true} onLaunchCoaching={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Options/i }));
    await user.click(await screen.findByRole("menuitem", { name: /^Archiver$/ }));
    expect(mockUpdateStatus).toHaveBeenCalledWith(serie.id, "archived");
  });

  it("opens AlertDialog on delete and calls deleteSerie on confirm", async () => {
    const user = userEvent.setup();
    const serie = baseSerie();
    mockSeriesState = {
      series: [serie],
      activeSeries: [serie],
      archivedSeries: [],
      loading: false,
    };
    render(<SeriesFicheCards hasRecap={true} onLaunchCoaching={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Options/i }));
    await user.click(await screen.findByRole("menuitem", { name: /^Supprimer$/ }));

    // AlertDialog appears
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/Supprimer cette série \?/i);

    // Confirm button is inside the dialog (avoid colliding with menuitem if still open)
    const confirmBtn = await screen.findByRole("button", { name: /^Supprimer$/ });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockDeleteSerie).toHaveBeenCalledWith(serie.id);
    });
  });

  it("toggles edit mode when clicking 'Éditer' in dropdown", async () => {
    const user = userEvent.setup();
    const serie = baseSerie();
    mockSeriesState = {
      series: [serie],
      activeSeries: [serie],
      archivedSeries: [],
      loading: false,
    };
    render(<SeriesFicheCards hasRecap={true} onLaunchCoaching={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Options/i }));
    await user.click(await screen.findByRole("menuitem", { name: /^Éditer$/ }));

    expect(await screen.findByTestId("editable-Nom de la série")).toBeInTheDocument();
    expect(screen.getByTestId("editable-Promesse")).toBeInTheDocument();
  });
});

describe("SeriesFicheCards — visual states", () => {
  it("applies reduced opacity for paused series", () => {
    const serie = baseSerie({ status: "paused" });
    mockSeriesState = {
      series: [serie],
      activeSeries: [],
      archivedSeries: [],
      loading: false,
    };
    const { container } = render(
      <SeriesFicheCards hasRecap={true} onLaunchCoaching={vi.fn()} />
    );
    expect(screen.getByText(/En pause/i)).toBeInTheDocument();
    const card = container.querySelector(".opacity-60");
    expect(card).not.toBeNull();
  });

  it("renders archived accordion with reduced opacity card", async () => {
    const serie = baseSerie({ id: "arch-1", name: "Vieille série", status: "archived" });
    mockSeriesState = {
      series: [serie],
      activeSeries: [],
      archivedSeries: [serie],
      loading: false,
    };
    const { container } = render(
      <SeriesFicheCards hasRecap={true} onLaunchCoaching={vi.fn()} />
    );

    const trigger = screen.getByText(/Séries archivées \(1\)/i);
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Vieille série")).toBeInTheDocument();
    });
    expect(container.querySelector(".opacity-50")).not.toBeNull();
  });

  it("falls back to 'Transversale' when pillar_key is null", async () => {
    const serie = baseSerie({ pillar_key: null });
    mockSeriesState = {
      series: [serie],
      activeSeries: [serie],
      archivedSeries: [],
      loading: false,
    };
    render(<SeriesFicheCards hasRecap={true} onLaunchCoaching={vi.fn()} />);
    expect(await screen.findByText(/Transversale/)).toBeInTheDocument();
  });
});
