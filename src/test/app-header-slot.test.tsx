// Slide en grand (26/11/2026) : pendant la retouche d'un carrousel sur ordinateur, les
// étapes de /creer et « Créer un autre contenu » montent dans la barre fine du menu de
// l'app. Sans emplacement (téléphone, tablette), ils restent dans la page.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import CreerStepper from "@/components/creer/CreerStepper";
import NewContentButton from "@/components/creer/NewContentButton";
import { appHeaderSlotRef } from "@/lib/app-header-slot";
import { useMarkCarouselEditorShown } from "@/lib/carousel-editor-shown";

const Editor = () => {
  useMarkCarouselEditorShown();
  return null;
};

const screenWidth = (desktop: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: desktop && query.includes("1024"), media: query,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
  }));

const Header = () => (
  <header>
    <div data-testid="slot-steps" ref={appHeaderSlotRef.steps} />
    <div data-testid="slot-actions" ref={appHeaderSlotRef.actions} />
  </header>
);

afterEach(() => {
  act(() => { appHeaderSlotRef.steps(null); appHeaderSlotRef.actions(null); });
  vi.unstubAllGlobals();
});

describe("barre fine du menu pendant la retouche d'un carrousel", () => {
  it("ordinateur : les étapes et « Créer un autre contenu » montent dans le menu", () => {
    screenWidth(true);
    render(<><Header /><main><Editor /><CreerStepper current="result" onStepClick={() => {}} /><NewContentButton onClick={() => {}} /></main></>);
    expect(screen.getByTestId("slot-steps").contains(screen.getByTestId("creer-stepper"))).toBe(true);
    expect(screen.getByTestId("slot-actions").contains(screen.getByTestId("new-content-top"))).toBe(true);
    expect(screen.getByRole("button", { name: /Étape 1 sur 4/ })).not.toBeDisabled();
  });

  it("téléphone et tablette : ils restent dans la page", () => {
    screenWidth(false);
    render(<><Header /><main><Editor /><CreerStepper current="result" onStepClick={() => {}} /><NewContentButton onClick={() => {}} /></main></>);
    const main = screen.getByRole("main");
    expect(main.contains(screen.getByTestId("creer-stepper"))).toBe(true);
    expect(main.contains(screen.getByTestId("new-content-top"))).toBe(true);
  });

  it("ordinateur, autre format (pas d'éditeur de carrousel) : les étapes restent dans la page", () => {
    screenWidth(true);
    render(<><Header /><main><CreerStepper current="result" onStepClick={() => {}} /></main></>);
    expect(screen.getByRole("main").contains(screen.getByTestId("creer-stepper"))).toBe(true);
  });
});
