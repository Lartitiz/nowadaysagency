import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Compteur de crédits dans le header — 4 paliers visuels (Confort / Attention /
// Urgence / Épuisé) qui pilotent la couleur, le pulse, les messages et le CTA
// d'upgrade. Voir CLAUDE.md « Parcours de conversion freemium → Premium ».

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }: any) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
}));
vi.mock("@/lib/posthog", () => ({ posthog: { capture: mocks.capture } }));

import AiCreditsCounter from "@/components/AiCreditsCounter";

function usageDe(limit: number, used: number) {
  return { total: { limit, used } };
}

/** Même calcul que le composant, pour ne pas dépendre de la date du jour du CI. */
function libelleProchainMois(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  return `1er ${d.toLocaleDateString("fr-FR", { month: "long" })}`;
}

async function ouvrirPopover() {
  fireEvent.click(screen.getByRole("button"));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("palier Confort (>50%)", () => {
  it("badge vert, pas de pulse, pas de message d'alerte", async () => {
    render(<AiCreditsCounter plan="free" usage={usageDe(30, 5)} />);

    const badge = screen.getByRole("button");
    expect(badge).toHaveAttribute("aria-label", "25 crédits IA restants");
    expect(badge.className).toContain("bg-success-bg");
    expect(badge.style.animation).toBe("");

    await ouvrirPopover();
    expect(screen.queryByText(/Tes crédits diminuent/)).toBeNull();
    expect(screen.queryByText(/Chaque génération compte/)).toBeNull();
  });

  it("ne déclenche aucun event PostHog", () => {
    render(<AiCreditsCounter plan="free" usage={usageDe(30, 5)} />);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});

describe("palier Attention (20-50%)", () => {
  it("badge orange, pulse, message « crédits diminuent »", async () => {
    render(<AiCreditsCounter plan="free" usage={usageDe(30, 20)} />);

    const badge = screen.getByRole("button");
    expect(badge).toHaveAttribute("aria-label", "10 crédits IA restants");
    expect(badge.className).toContain("bg-warning-bg");
    expect(badge.style.animation).toContain("pulse");

    await ouvrirPopover();
    expect(screen.getByText(/Tes crédits diminuent/)).toBeTruthy();
    expect(screen.queryByText(/Chaque génération compte/)).toBeNull();
  });

  it("déclenche quota_warning_shown avec tier attention", () => {
    render(<AiCreditsCounter plan="free" usage={usageDe(30, 20)} />);
    expect(mocks.capture).toHaveBeenCalledWith(
      "quota_warning_shown",
      expect.objectContaining({ tier: "attention", remaining: 10 }),
    );
  });
});

describe("palier Urgence (<20%)", () => {
  it("badge rouge, pulse, message « plus que X crédits »", async () => {
    render(<AiCreditsCounter plan="free" usage={usageDe(30, 28)} />);

    const badge = screen.getByRole("button");
    expect(badge).toHaveAttribute("aria-label", "2 crédits IA restants");
    expect(badge.className).toContain("bg-error-bg");
    expect(badge.style.animation).toContain("pulse");

    await ouvrirPopover();
    expect(screen.getByText(/Plus que 2 crédits\. Chaque génération compte/)).toBeTruthy();
  });

  it("déclenche quota_warning_shown avec tier urgence", () => {
    render(<AiCreditsCounter plan="free" usage={usageDe(30, 28)} />);
    expect(mocks.capture).toHaveBeenCalledWith(
      "quota_warning_shown",
      expect.objectContaining({ tier: "urgence", remaining: 2 }),
    );
  });

  it("affiche le CTA bouton « Passer à L'Assistant Com' » en plan gratuit", async () => {
    render(<AiCreditsCounter plan="free" usage={usageDe(30, 28)} />);
    await ouvrirPopover();

    const cta = screen.getByText("Passer à L'Assistant Com' →");
    expect(cta.className).toContain("bg-primary");
  });
});

describe("palier Épuisé (0 crédit)", () => {
  it("badge rouge statique, libellé 0 crédit, pas de pulse", () => {
    render(<AiCreditsCounter plan="free" usage={usageDe(30, 30)} />);

    const badge = screen.getByRole("button");
    expect(badge).toHaveAttribute("aria-label", "0 crédits IA restants");
    expect(badge.className).toContain("bg-error-bg");
    expect(badge.style.animation).toBe("");
  });

  it("n'émet pas quota_warning_shown (réservé aux paliers attention/urgence)", () => {
    render(<AiCreditsCounter plan="free" usage={usageDe(30, 30)} />);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("affiche la date de renouvellement et le CTA dédié", async () => {
    render(<AiCreditsCounter plan="free" usage={usageDe(30, 30)} />);
    await ouvrirPopover();

    expect(
      screen.getByText(`Tes crédits reviennent le ${libelleProchainMois()}.`),
    ).toBeTruthy();
    const cta = screen.getByText("Passer à L'Assistant Com' — création illimitée");
    expect(cta.className).toContain("bg-primary");
  });
});

describe("calcul du restant avec crédits bonus", () => {
  it("additionne crédits mensuels restants et crédits bonus", () => {
    render(<AiCreditsCounter plan="free" usage={usageDe(30, 20)} bonusCredits={5} />);
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "15 crédits IA restants",
    );
  });

  it("les crédits bonus évitent l'épuisement quand le mensuel est à zéro", async () => {
    render(<AiCreditsCounter plan="free" usage={usageDe(30, 30)} bonusCredits={5} />);

    const badge = screen.getByRole("button");
    expect(badge).toHaveAttribute("aria-label", "5 crédits IA restants");

    await ouvrirPopover();
    expect(
      screen.getByText(/tes crédits bonus prennent le relais automatiquement/),
    ).toBeTruthy();
  });

  it("reste épuisé si mensuel ET bonus sont à zéro", () => {
    render(<AiCreditsCounter plan="free" usage={usageDe(30, 30)} bonusCredits={0} />);
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "0 crédits IA restants",
    );
  });
});

describe("plan illimité", () => {
  it("n'affiche pas de badge de crédits ni d'event PostHog", () => {
    render(<AiCreditsCounter plan="binome" usage={usageDe(9999, 0)} />);
    expect(screen.getByText("Illimité")).toBeTruthy();
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
