import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: vi.fn() }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ activeWorkspace: null, workspaces: [] }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u" }, session: null }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CreerStepResult from "@/components/creer/CreerStepResult";

// Chantier C (15/10/2026, choix de Laetitia) : l'écran du résultat de /creer
// garde AU PLUS 3 actions visibles dans la barre collée en bas + un menu court
// « Plus d'options », un seul « Créer un autre contenu », le coût écrit sans
// survol. Ce test est le garde-fou : un bouton ajouté à la barre le fait rougir.

const MAX_VISIBLE = 3;

const renderResult = (format: string, result: any, extra: Record<string, unknown> = {}) =>
  render(
    <MemoryRouter>
      <CreerStepResult
        result={result}
        format={format}
        generating={false}
        onEdit={vi.fn()}
        onReset={vi.fn()}
        onRegenerate={vi.fn()}
        onCopy={vi.fn()}
        onSave={vi.fn()}
        onPublishOrSchedule={vi.fn()}
        canAutoPublish
        onChangeAngle={vi.fn()}
        sourceIdea="Mon idée"
        {...extra}
      />
    </MemoryRouter>,
  );

/** Boutons et liens visibles de la barre, menu « Plus d'options » à part. */
const barActions = () =>
  within(screen.getByTestId("result-actions"))
    .getAllByRole("button")
    .concat(within(screen.getByTestId("result-actions")).queryAllByRole("link"))
    .filter((b) => b.getAttribute("data-testid") !== "more-actions");

const openMore = () => {
  const trigger = screen.getByTestId("more-actions");
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
};

describe("écran du résultat : barre d'actions courte", () => {
  it.each([
    ["post", { content: "Mon post" }],
    ["linkedin", { content: "Mon post LinkedIn" }],
    ["newsletter", { subject: "Objet", body: "Corps" }],
    ["carousel", { slides: [{ title: "a" }], carousel_type: "text" }],
  ])("%s : 3 actions visibles au plus, plus le menu", (format, result) => {
    renderResult(format, result, format === "carousel" ? { onGenerateVisuals: vi.fn() } : {});
    expect(barActions().length).toBeLessThanOrEqual(MAX_VISIBLE);
    expect(screen.getByTestId("more-actions")).toHaveTextContent("Plus d'options");
  });

  it("un seul « Créer un autre contenu », sous la barre, et plus de doublon dans le menu", () => {
    renderResult("post", { content: "x" });
    expect(screen.getAllByRole("button", { name: /Créer un autre contenu/ })).toHaveLength(1);
    expect(screen.queryByText(/^Nouveau contenu$/)).toBeNull();
    openMore();
    expect(screen.queryByRole("menuitem", { name: /Nouveau contenu|autre contenu/ })).toBeNull();
  });

  it("les libellés disent où va le contenu", () => {
    renderResult("post", { content: "x" });
    expect(screen.getByTestId("publish-or-schedule")).toHaveTextContent("Publier ou mettre au calendrier");
    expect(screen.getByTestId("save-as-idea")).toHaveTextContent(/Garder dans mes idées/);
    expect(screen.getByTestId("copy-text")).toHaveTextContent("Copier mon texte");
  });

  it("carrousel enregistré tout seul : on le dit, pas de bouton d'enregistrement", () => {
    renderResult("carousel", { slides: [{ title: "a" }] }, { autoSavedToIdeas: true });
    expect(screen.getByTestId("auto-saved-to-ideas")).toHaveTextContent(/Enregistré dans .*Mes idées/);
    expect(screen.queryByTestId("save-as-idea")).toBeNull();
  });

  it("le coût d'une nouvelle version est écrit sans survol", () => {
    renderResult("carousel", { slides: [{ title: "a" }] });
    openMore();
    expect(screen.getByRole("menuitem", { name: /Refaire une version.*1 carrousel/ })).toBeInTheDocument();
  });

  it("post : refaire avec un autre angle coûte 1 crédit, écrit en clair", () => {
    renderResult("post", { content: "x" });
    openMore();
    expect(screen.getByRole("menuitem", { name: /Refaire une version.*1 crédit/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Même idée, autre format/ })).toBeInTheDocument();
  });
});

describe("écran du résultat : durée honnête pendant la génération", () => {
  it("carrousel : 3 à 4 minutes en tout, avec le temps écoulé", () => {
    renderResult("carousel", null, { generating: true });
    expect(screen.getByTestId("generation-time-hint")).toHaveTextContent(/Compte 3 à 4 minutes en tout\. Déjà \d+ s/);
  });

  it("post : environ 1 minute", () => {
    renderResult("post", null, { generating: true });
    expect(screen.getByTestId("generation-time-hint")).toHaveTextContent(/Compte environ 1 minute/);
  });
});
