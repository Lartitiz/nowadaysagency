import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorWithRetry from "@/components/ErrorWithRetry";
import { describeError } from "@/lib/describe-error";

afterEach(() => { vi.restoreAllMocks(); });

describe("describeError", () => {
  it("délai dépassé", () => {
    expect(describeError({ isTimeout: true, message: "x" })).toMatchObject({ kind: "timeout", retryable: true });
  });
  it("délai dépassé : garde la consigne « vérifie avant de relancer »", () => {
    const e = { isTimeout: true, code: "TIMEOUT", message: "La réponse prend trop de temps. Le traitement peut encore se terminer : vérifie son résultat avant de relancer." };
    expect(describeError(e).message).toMatch(/vérifie son résultat avant de relancer/);
  });
  it("un nombre 2401 dans un message n'est pas une session expirée", () => {
    expect(describeError(new Error("Il reste 2401 caractères")).kind).not.toBe("auth");
  });
  it("quota reconnu au texte seul (objet quota perdu) : pas de Réessayer", () => {
    expect(describeError(new Error("Tu as utilisé tes 23 crédits du mois. Ils reviennent le 1er décembre."))).toMatchObject({ kind: "quota", retryable: false });
    expect(describeError("limit_reached")).toMatchObject({ kind: "quota", retryable: false });
    expect(describeError(new Error("Tu as atteint une de tes limites du mois."))).toMatchObject({ kind: "quota", retryable: false });
  });
  it("panne de vérification du quota : ce n'est pas un quota, Réessayer reste", () => {
    expect(describeError(new Error("quota_check_failed"))).toMatchObject({ kind: "generic", retryable: true });
  });
  it("trop de demandes en même temps (429) : Réessayer reste", () => {
    expect(describeError({ code: "RATE_LIMIT", isRateLimit: true, message: "Trop de demandes en même temps. Attends un instant avant de réessayer." })).toMatchObject({ kind: "generic", retryable: true });
  });
  it("session expirée ou accès refusé : pas de Réessayer", () => {
    expect(describeError({ code: "AUTH", isAuth: true, message: "Ta session a expiré. Reconnecte-toi pour continuer." })).toMatchObject({ kind: "auth", retryable: false });
    expect(describeError({ code: "FORBIDDEN", message: "Tu n’as pas les droits nécessaires pour cette action." })).toMatchObject({ kind: "auth", retryable: false });
  });
  it("hors ligne", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(describeError(new Error("Failed to fetch"))).toMatchObject({ kind: "offline", retryable: true });
  });
  it("quota : pas de Réessayer", () => {
    const e = { data: { quota: { reason: "total", plan: "free", usage: {} } }, message: "limit_reached" };
    expect(describeError(e)).toMatchObject({ kind: "quota", retryable: false });
  });
  it("technique traduit, jamais de jargon", () => {
    const d = describeError(new Error("Edge Function returned a non-2xx status code"));
    expect(d.message).toMatch(/indisponible/);
  });
  it("vide : phrase de secours", () => {
    expect(describeError(null, { fallback: "Rien reçu." })).toMatchObject({ kind: "empty", message: "Rien reçu." });
  });
  it("message déjà en français gardé tel quel", () => {
    expect(describeError(new Error("Ton profil est incomplet.")).message).toBe("Ton profil est incomplet.");
  });
});

describe("ErrorWithRetry (rendu réel)", () => {
  it("montre la phrase et un bouton Réessayer qui rappelle", () => {
    const onRetry = vi.fn();
    render(<ErrorWithRetry error={new Error("Failed to fetch")} where="test.bloc" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it("quota : aucun bouton Réessayer", () => {
    render(<ErrorWithRetry error={{ data: { quota: { reason: "total", plan: "free", usage: {} } } }} where="test.bloc" onRetry={() => {}} />);
    expect(screen.queryByRole("button", { name: /Réessayer/ })).toBeNull();
  });
  it("deuxième bouton", () => {
    const back = vi.fn();
    render(<ErrorWithRetry error="boom" where="test.bloc" onRetry={() => {}} secondary={{ label: "Revenir à mes réponses", onClick: back }} />);
    fireEvent.click(screen.getByText("Revenir à mes réponses"));
    expect(back).toHaveBeenCalled();
  });
});
