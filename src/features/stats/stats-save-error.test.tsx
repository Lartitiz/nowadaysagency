import { describe, it, expect, vi, beforeEach } from "vitest";

const { trackError, toastError } = vi.hoisted(() => ({ trackError: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/error-tracker", () => ({ trackError }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

import { signalerEchecEnregistrementStats, tracerEchecEnregistrementStats } from "./stats-save-error";

describe("échec d'enregistrement des stats", () => {
  beforeEach(() => { trackError.mockClear(); toastError.mockClear(); });

  it("Instagram : garde une trace (Sentry + bilan) et explique que les chiffres n'ont pas été enregistrés", () => {
    const err = new Error("Invalid stats patch");
    signalerEchecEnregistrementStats("instagram", err, "2026-10-01");
    expect(trackError).toHaveBeenCalledWith(err, { step: "instagram-stats-save", month: "2026-10-01" });
    expect(toastError).toHaveBeenCalledWith(
      "Erreur d'enregistrement des stats récupérées",
      expect.objectContaining({ description: expect.stringContaining("Instagram ont bien été lus, mais pas enregistrés") }),
    );
  });

  it("LinkedIn : une erreur Supabase (objet simple) arrive lisible dans Sentry", () => {
    signalerEchecEnregistrementStats("linkedin", { code: "42501", message: "new row violates row-level security policy" }, "2026-10-01");
    const [err, ctx] = trackError.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("42501 new row violates row-level security policy");
    expect(ctx).toEqual({ step: "linkedin-stats-save", month: "2026-10-01" });
    expect(toastError).toHaveBeenCalledWith(
      "Erreur d'enregistrement des stats LinkedIn",
      expect.objectContaining({ description: expect.stringContaining("LinkedIn ont bien été lus") }),
    );
  });

  it("l'historique Instagram garde aussi la trace, sans toast par mois", () => {
    const err = new Error("Invalid stats patch");
    tracerEchecEnregistrementStats("instagram", err, "2026-05-01");
    expect(trackError).toHaveBeenCalledWith(err, { step: "instagram-stats-save", month: "2026-05-01" });
    expect(toastError).not.toHaveBeenCalled();
  });
});
