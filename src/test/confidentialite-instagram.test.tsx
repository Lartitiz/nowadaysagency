import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ConfidentialitePage from "@/pages/ConfidentialitePage";

vi.mock("@/hooks/use-page-seo", () => ({ usePageSEO: () => {} }));

// L'adresse /confidentialite#suppression-donnees est déclarée dans les réglages de
// l'app Meta (Contrôle app Instagram) : l'ancre et la section Instagram doivent rester.
describe("Politique de confidentialité : Instagram", () => {
  it("garde l'ancre de suppression des données et la section Instagram", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { container } = render(
      <MemoryRouter initialEntries={["/confidentialite#suppression-donnees"]}>
        <ConfidentialitePage />
      </MemoryRouter>,
    );
    expect(container.querySelector("#suppression-donnees")).not.toBeNull();
    expect(container.querySelector("#instagram")).not.toBeNull();
    expect(screen.getByText("10. Connexion à Instagram")).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
