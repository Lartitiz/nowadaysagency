import { describe, it, expect, vi } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: vi.fn() }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ activeWorkspace: null, workspaces: [] }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u" }, session: null }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CreerStepResult from "@/components/creer/CreerStepResult";
import CarouselStructureLoader from "@/components/creer/CarouselStructureLoader";
import { resetWaitClock } from "@/lib/generation-wait-clock";

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

/** Boutons et liens visibles de la barre, menus « Plus d'options » et « Refaire une version » à part. */
const barActions = () =>
  within(screen.getByTestId("result-actions"))
    .getAllByRole("button")
    .concat(within(screen.getByTestId("result-actions")).queryAllByRole("link"))
    .filter((b) => !["more-actions", "redo-version"].includes(b.getAttribute("data-testid") || ""));

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

  it("bouton calendrier secondaire : libellé court qui tient sur la ligne (passe du 16/10/2026)", () => {
    renderResult("newsletter", { subject: "Objet", body: "Corps" });
    const btn = screen.getByTestId("publish-or-schedule");
    expect(btn).toHaveTextContent("Mettre au calendrier");
    expect(btn).not.toHaveTextContent("Mettre dans mon calendrier");
  });

  it("carrousel enregistré tout seul : on le dit, pas de bouton d'enregistrement", () => {
    renderResult("carousel", { slides: [{ title: "a" }] }, { autoSavedToIdeas: true });
    expect(screen.getByTestId("auto-saved-to-ideas")).toHaveTextContent(/Enregistré dans .*Mes idées/);
    expect(screen.queryByTestId("save-as-idea")).toBeNull();
  });

  it("carrousel : « Refaire une version » est un bouton visible de la barre, coût écrit dans son menu (passe du 12/11)", () => {
    const onRegenerate = vi.fn();
    renderResult("carousel", { slides: [{ title: "a" }] }, { onRegenerate });
    const trigger = within(screen.getByTestId("result-actions")).getByTestId("redo-version");
    expect(trigger).toHaveAccessibleName("Refaire une version");
    // Sur téléphone, un mot à côté de l'icône (« Refaire ») : l'icône seule passait inaperçue.
    expect(trigger.querySelector("span.lg\\:hidden")).toHaveTextContent("Refaire");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByText(/Chaque nouvelle version compte pour 1 carrousel du mois/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Même sujet, même angle/ }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("carrousel : plus de doublon « Refaire une version » dans « Plus d'options »", () => {
    renderResult("carousel", { slides: [{ title: "a" }] });
    openMore();
    expect(screen.queryByRole("menuitem", { name: /Refaire une version/ })).toBeNull();
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

  // QA du 12/11/2026 : « Déjà 22 s » après une vraie minute, le chrono
  // repartait de zéro entre le plan des slides et la rédaction.
  it("carrousel photo : le temps écoulé compte depuis le clic, plan compris", () => {
    vi.useFakeTimers();
    try {
      resetWaitClock();
      const plan = render(<CarouselStructureLoader hasPhotos />);
      act(() => { vi.advanceTimersByTime(40_000); });
      expect(screen.getByTestId("structure-elapsed")).toHaveTextContent("Déjà 40 s.");
      plan.unmount();
      act(() => { vi.advanceTimersByTime(500); });
      renderResult("carousel", null, { generating: true, step2of2: true });
      act(() => { vi.advanceTimersByTime(20_000); });
      expect(screen.getByTestId("generation-time-hint")).toHaveTextContent(/Déjà 1 min 0[01]/);
    } finally {
      vi.useRealTimers();
      resetWaitClock();
    }
  });

  it("post : environ 1 minute", () => {
    renderResult("post", null, { generating: true });
    expect(screen.getByTestId("generation-time-hint")).toHaveTextContent(/Compte environ 1 minute/);
  });
});
