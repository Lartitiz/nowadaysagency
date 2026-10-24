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

  // Déclaré à Meta (Contrôle app, « Traitement des données », 23/10/2026) : la page
  // publique doit citer les mêmes sous-traitants qui voient les données Instagram.
  it("cite Lovable, Google, OpenAI, Higgsfield, Photoroom et Resend parmi les sous-traitants", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/confidentialite"]}>
        <ConfidentialitePage />
      </MemoryRouter>,
    );
    const texte = container.textContent ?? "";
    expect(texte).toMatch(/Lovable\s*\(hébergement de l'application via Lovable Cloud, et passerelle IA\)/);
    expect(texte).toMatch(/Google\s*\(modèle d'IA Gemini/);
    expect(texte).toMatch(/OpenAI\s*\(création et retouche d'images\)/);
    expect(texte).toMatch(/Higgsfield\s*\(création d'images et de vidéos\)/);
    expect(texte).toMatch(/Photoroom\s*\(détourage et fond des photos\)/);
    expect(texte).toMatch(/Resend\s*\(envoi des e-mails de l'outil\)/);
    expect(texte).toContain("(Anthropic, Google, OpenAI, Higgsfield, Resend, Stripe, Sentry)");
  });
});
