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

it("offers and forwards an explicit ten-slide carousel", () => {
  const onNext=vi.fn(),onSelectionChange=vi.fn();
  render(<CreerStepFormat {...base} forcedChannel="instagram" initialFormat="carousel" initialCarouselSubMode="text" onNext={onNext} onSelectionChange={onSelectionChange}/>);
  fireEvent.click(screen.getByRole('button',{name:'Détaillé · 10 slides'}));
  expect(onSelectionChange).toHaveBeenLastCalledWith(expect.objectContaining({slideLength:'long'}));
  fireEvent.click(screen.getByRole('button',{name:/Suivant/}));
  expect(onNext.mock.calls.at(-1)?.at(-1)).toBe('long');
});

describe("écran Format allégé (chantier B, 15/10/2026)", () => {
  it("carrousel sans photos : Texte design déjà choisi, Suivant actif, longueur et angle rangés dans « Plus d'options »", () => {
    const onNext = vi.fn();
    render(<CreerStepFormat {...base} forcedChannel="instagram" initialFormat="carousel" onNext={onNext} />);
    expect(screen.getByTestId("carousel-mode-text")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("creer-format-more-options")).not.toHaveAttribute("open");
    expect(screen.getByTestId("creer-format-more-options")).toHaveTextContent("Longueur auto · angle choisi par l'IA");
    fireEvent.click(screen.getByTestId("creer-format-next"));
    expect(onNext.mock.calls[0][2]).toBe("text");
  });

  it("carrousel choisi avec des photos : « Tes photos en fond » conseillé et déjà choisi", () => {
    const photos = [{ id: "p1", base64: "data:image/png;base64,AAA" }, { id: "p2", base64: "data:image/png;base64,BBB" }] as any;
    render(<CreerStepFormat {...base} forcedChannel="instagram" initialPhotos={photos} />);
    fireEvent.click(screen.getByTestId("creer-format-carousel"));
    expect(screen.getByTestId("carousel-mode-photo")).toHaveAttribute("aria-pressed", "true");
    for (const id of ["text", "photo", "mix", "pure_photo", "user_slides"]) expect(screen.getByTestId(`carousel-mode-${id}`)).toBeInTheDocument();
  });

  it("page « quel format ? » : le format conseillé est en avant et Suivant le choisit", () => {
    render(<CreerStepFormat {...base} idea="3 erreurs à éviter" forcedChannel="instagram" />);
    expect(screen.getByTestId("creer-format-recommendation")).toHaveTextContent("Conseillé pour ton idée : ton sujet");
    const next = screen.getByTestId("creer-format-next");
    expect(next).toHaveTextContent("Suivant : Carrousel");
    fireEvent.click(next);
    expect(screen.getByText("Choisis le rendu de ton carrousel")).toBeInTheDocument();
    expect(screen.getByTestId("carousel-mode-text")).toHaveAttribute("aria-pressed", "true");
  });

  it("LinkedIn : Post ou Carrousel, puis les 5 types de carrousel", () => {
    render(<CreerStepFormat {...base} forcedChannel="linkedin" />);
    expect(screen.getByTestId("creer-format-linkedin")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("creer-format-carousel"));
    for (const id of ["text", "photo", "mix", "pure_photo", "user_slides"]) expect(screen.getByTestId(`carousel-mode-${id}`)).toBeInTheDocument();
  });
});
