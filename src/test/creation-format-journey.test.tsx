import { useEffect, useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { consumeFreshStart } from "@/lib/creation-navigation";
import CreerStepFormat from "@/components/creer/CreerStepFormat";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => ({ column: "workspace_id", value: "test" }) }));
vi.mock("@/components/creer/PhotoUploadZone", () => ({ PhotoUploadZone: () => <div>Choisir mes photos</div> }));
vi.mock("@/components/ui/input-with-voice", () => ({ InputWithVoice: (props: any) => <input {...props} /> }));

const base = { idea: "Expliquer la fabrication", onNext: vi.fn(), onBack: vi.fn() };
function EntryJourney() {
  const [params, setParams] = useSearchParams();
  const [formatStep, setFormatStep] = useState(false);
  useEffect(() => { if (params.has("new")) setParams(consumeFreshStart(params), { replace: true }); }, [params, setParams]);
  return formatStep ? <CreerStepFormat {...base} forcedChannel={params.get("canal") as "instagram"} /> : <button onClick={() => setFormatStep(true)}>Continuer avec mon idée</button>;
}

describe("format selection journey", () => {
  it("retains Instagram after the fresh-start URL is cleaned and the idea entered", () => {
    render(<MemoryRouter initialEntries={["/creer?canal=instagram&new=1"]}><EntryJourney /></MemoryRouter>);
    fireEvent.click(screen.getByText("Continuer avec mon idée"));
    expect(screen.queryByText("Sur quel canal publier ?")).not.toBeInTheDocument();
    expect(screen.getByText("Quel format Instagram ?")).toBeInTheDocument();
  });
  it("lets a newsletter shortcut continue without choosing the channel again", () => {
    render(<CreerStepFormat {...base} forcedChannel="newsletter" />);
    expect(screen.getByRole("button", { name: /Suivant/ })).toBeEnabled();
    expect(screen.queryByText("Sur quel canal publier ?")).not.toBeInTheDocument();
  });
  it("keeps a resumed LinkedIn carousel and all five renderings available", () => {
    render(<CreerStepFormat {...base} forcedChannel="linkedin" initialChannel="linkedin" initialFormat="carousel" initialCarouselSubMode="mix" />);
    expect(screen.getByText("Choisis le rendu de ton carrousel")).toBeInTheDocument();
    for (const label of ["Texte design", "Tes photos en fond", "Photos + slides design", "Photos brutes", "Mes slides"]) {
      expect(screen.getByRole("button", { name: new RegExp(label.replace("+", "\\+")) })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /Suivant/ })).toBeDisabled(); // mix still requires its fork
    fireEvent.click(screen.getByRole("button", { name: /Mes slides/ }));
    expect(screen.queryByText("Longueur :")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Suivant/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Photos brutes/ }));
    expect(screen.queryByText("Longueur :")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Texte design/ }));
    expect(screen.getByText("Longueur :")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Personnaliser ma façon/ })).toBeInTheDocument();
  });
});
