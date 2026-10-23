import { describe, it, expect, vi } from "vitest";

const { trackError, toastError } = vi.hoisted(() => ({ trackError: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/error-tracker", () => ({ trackError }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

import { signalerEchecEnregistrementInstagram, tracerEchecEnregistrementInstagram } from "./instagram-save-error";

describe("signalerEchecEnregistrementInstagram", () => {
  it("garde une trace de l'échec (Sentry + bilan) et explique que les chiffres n'ont pas été enregistrés", () => {
    const err = new Error("Invalid stats patch");
    signalerEchecEnregistrementInstagram(err, "2026-10-01");
    expect(trackError).toHaveBeenCalledWith(err, { step: "instagram-stats-save", month: "2026-10-01" });
    expect(toastError).toHaveBeenCalledWith(
      "Erreur d'enregistrement des stats récupérées",
      expect.objectContaining({ description: expect.stringContaining("pas enregistrés") }),
    );
  });

  it("l'historique garde aussi la trace, sans toast par mois", () => {
    trackError.mockClear(); toastError.mockClear();
    const err = new Error("Invalid stats patch");
    tracerEchecEnregistrementInstagram(err, "2026-05-01");
    expect(trackError).toHaveBeenCalledWith(err, { step: "instagram-stats-save", month: "2026-05-01" });
    expect(toastError).not.toHaveBeenCalled();
  });
});
