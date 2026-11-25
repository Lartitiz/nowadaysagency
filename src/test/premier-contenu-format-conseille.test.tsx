/**
 * Premier contenu d'une nouvelle inscrite : le format « Conseillé » reste Carrousel
 * (décision du 25/11/2026). Avant, « Changer de canal » puis Instagram affichait
 * « Post — Conseillé » alors que l'arrivée sur /creer réglait un carrousel.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CreerStepFormat from "@/components/creer/CreerStepFormat";
import { recommendContentFormat } from "@/lib/format-recommendation";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => ({ column: "workspace_id", value: "test" }) }));
vi.mock("@/components/creer/PhotoUploadZone", () => ({ PhotoUploadZone: () => <div>Choisir mes photos</div> }));
vi.mock("@/components/ui/input-with-voice", () => ({ InputWithVoice: (props: any) => <input {...props} /> }));

// Idée neutre : hors premier contenu, elle donne « Post » (aucun mot-clé de carrousel).
const IDEE = "Mon atelier de céramique";
const base = { idea: IDEE, onNext: vi.fn(), onBack: vi.fn() };
const conseil = () => screen.getByTestId("creer-format-recommendation").textContent ?? "";

describe("règle : format conseillé au premier contenu", () => {
  it("Instagram et LinkedIn : Carrousel, quelle que soit l'idée", () => {
    expect(recommendContentFormat("instagram", 0, IDEE, 0, true)).toMatchObject({ format: "carousel", mode: "text" });
    expect(recommendContentFormat("linkedin", 0, IDEE, 0, true)).toMatchObject({ format: "carousel", mode: "text" });
    expect(recommendContentFormat("instagram", 1, IDEE, 0, true).format).toBe("carousel");
    expect(recommendContentFormat("instagram", 0, "Je veux un reel", 0, true).format).toBe("carousel");
  });
  it("avec ses photos : carrousel photo", () => {
    expect(recommendContentFormat("instagram", 3, IDEE, 0, true)).toMatchObject({ format: "carousel", mode: "photo" });
    expect(recommendContentFormat("linkedin", 0, IDEE, 3, true)).toMatchObject({ format: "carousel", mode: "photo" });
  });
  it("canal sans carrousel : son propre conseil", () => {
    expect(recommendContentFormat("newsletter", 0, IDEE, 0, true).format).toBe("newsletter");
    expect(recommendContentFormat("pinterest", 0, IDEE, 0, true).format).toBe("pinterest");
  });
  it("contenu suivant : conseil inchangé", () => {
    expect(recommendContentFormat("instagram", 0, IDEE).format).toBe("post");
    expect(recommendContentFormat("linkedin", 0, IDEE).format).toBe("linkedin");
    expect(recommendContentFormat("instagram", 0, IDEE, 0, false).format).toBe("post");
  });
});

describe("écran « Quel format … ? » au premier contenu", () => {
  const premier = { ...base, directStart: true, forcedChannel: "instagram" as const, initialFormat: "carousel", initialCarouselSubMode: "text" as const };

  it("« Changer de canal » puis Instagram : Carrousel reste conseillé", () => {
    render(<CreerStepFormat {...premier} />);
    fireEvent.click(screen.getByRole("button", { name: /Changer de canal/ }));
    fireEvent.click(screen.getByTestId("creer-channel-instagram"));
    expect(screen.getByText("Quel format Instagram ?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suivant : Carrousel" })).toBeEnabled();
    expect(screen.getByTestId("creer-format-carousel")).toHaveTextContent("Conseillé");
    expect(screen.getByTestId("creer-format-post")).not.toHaveTextContent("Conseillé");
    expect(conseil()).toMatch(/carrousel/i);
    expect(conseil()).not.toMatch(/format simple pour commencer/);
  });

  it("« Changer de canal » puis LinkedIn : Carrousel conseillé", () => {
    render(<CreerStepFormat {...premier} />);
    fireEvent.click(screen.getByRole("button", { name: /Changer de canal/ }));
    fireEvent.click(screen.getByTestId("creer-channel-linkedin"));
    expect(screen.getByRole("button", { name: "Suivant : Carrousel" })).toBeEnabled();
    expect(screen.getByTestId("creer-format-linkedin")).not.toHaveTextContent("Conseillé");
  });

  it("« Changer de format » : Carrousel reste conseillé", () => {
    render(<CreerStepFormat {...premier} />);
    fireEvent.click(screen.getByRole("button", { name: /Changer de format/ }));
    expect(screen.getByRole("button", { name: "Suivant : Carrousel" })).toBeEnabled();
    expect(screen.getByTestId("creer-format-carousel")).toHaveTextContent("Conseillé");
  });

  it("« Changer de canal » puis newsletter : la newsletter garde son conseil", () => {
    render(<CreerStepFormat {...premier} />);
    fireEvent.click(screen.getByRole("button", { name: /Changer de canal/ }));
    fireEvent.click(screen.getByTestId("creer-channel-newsletter"));
    expect(screen.queryByRole("button", { name: "Suivant : Carrousel" })).not.toBeInTheDocument();
  });

  it("contenu suivant (pas le premier) : « Post » reste conseillé après « Changer de canal »", () => {
    render(<CreerStepFormat {...base} forcedChannel="instagram" initialFormat="carousel" initialCarouselSubMode="text" />);
    fireEvent.click(screen.getByRole("button", { name: /Changer de canal/ }));
    fireEvent.click(screen.getByTestId("creer-channel-instagram"));
    expect(screen.getByRole("button", { name: "Suivant : Post" })).toBeEnabled();
    expect(conseil()).toMatch(/format simple pour commencer/);
  });
});
