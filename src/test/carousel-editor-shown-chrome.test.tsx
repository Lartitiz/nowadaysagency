// Chantier W élargi (18/10/2026) : tant que l'éditeur de carrousel est affiché, les
// étapes de /creer se replient en une ligne fine et la barre « Publier » tient sur une
// ligne. Les autres formats et les autres étapes ne changent pas.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CreerStepper from "@/components/creer/CreerStepper";
import ResultActions from "@/components/creer/ResultActions";
import { useMarkCarouselEditorShown } from "@/lib/carousel-editor-shown";

const Editor = () => {
  useMarkCarouselEditorShown();
  return null;
};

const actions = (format: string, editor: boolean) =>
  render(
    <MemoryRouter>
      {editor && <Editor />}
      <ResultActions
        format={format}
        result={{ content: "x" }}
        hasVisuals
        visualCount={3}
        createVisualsPending={false}
        onPublishOrSchedule={() => {}}
        canAutoPublish
        onCopyText={() => {}}
        storyActions={null}
        onExportVisualPng={() => {}}
        includeLogo={false}
        onIncludeLogoChange={() => {}}
        autoSavedToIdeas
        onReset={() => {}}
        onRegenerate={() => {}}
      />
    </MemoryRouter>,
  );

describe("éditeur de carrousel affiché : étapes et barre du bas repliées", () => {
  it("replie les étapes en une ligne, toujours cliquables", () => {
    const { rerender } = render(<CreerStepper current="result" onStepClick={() => {}} />);
    expect(screen.getByTestId("creer-stepper").dataset.folded).toBeUndefined();
    rerender(<><Editor /><CreerStepper current="result" onStepClick={() => {}} /></>);
    expect(screen.getByTestId("creer-stepper").dataset.folded).toBe("true");
    expect(screen.getByRole("button", { name: /Étape 1 sur 4/ })).not.toBeDisabled();
  });

  it("ne replie pas les étapes avant le contenu", () => {
    render(<><Editor /><CreerStepper current="brief" onStepClick={() => {}} /></>);
    expect(screen.getByTestId("creer-stepper").dataset.folded).toBeUndefined();
  });

  it("met la barre du carrousel sur une ligne, sans perdre d'action", () => {
    actions("carousel", true);
    const bar = screen.getByTestId("result-actions");
    expect(bar.dataset.oneLine).toBe("true");
    expect(screen.getByTestId("publish-or-schedule")).toBeTruthy();
    expect(screen.getByTestId("download-visuals")).toBeTruthy();
    expect(screen.getByTestId("auto-saved-to-ideas")).toBeTruthy();
  });

  it("laisse la barre des autres formats sur deux lignes", () => {
    actions("post", true);
    expect(screen.getByTestId("result-actions").dataset.oneLine).toBeUndefined();
  });
});
