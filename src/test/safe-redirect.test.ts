import { describe, it, expect } from "vitest";
import { isInternalPath, isSafeRedirectTarget } from "@/lib/safe-redirect";

// Le champ ?redirect= post-connexion doit rester un chemin interne, jamais
// une URL absolue/protocole-relative (open redirect) ni une boucle vers /login.
describe("isSafeRedirectTarget", () => {
  it("accepte un chemin interne quelconque", () => {
    expect(isSafeRedirectTarget("/photos")).toBe(true);
    expect(isSafeRedirectTarget("/dashboard")).toBe(true);
    expect(isSafeRedirectTarget("/creer?step=2")).toBe(true);
  });

  it("accepte toujours /invite/… (comportement historique préservé)", () => {
    expect(isSafeRedirectTarget("/invite/abc123")).toBe(true);
  });

  it("refuse une URL absolue ou protocole-relative", () => {
    expect(isSafeRedirectTarget("https://evil.example.com")).toBe(false);
    expect(isSafeRedirectTarget("//evil.example.com")).toBe(false);
  });

  it("refuse un retour vers les pages de connexion (boucle)", () => {
    expect(isSafeRedirectTarget("/login")).toBe(false);
    expect(isSafeRedirectTarget("/connexion")).toBe(false);
  });

  it("refuse une valeur vide, nulle ou absente", () => {
    expect(isSafeRedirectTarget("")).toBe(false);
    expect(isSafeRedirectTarget(null)).toBe(false);
    expect(isSafeRedirectTarget(undefined)).toBe(false);
  });
});

// Redirection ouverte par antislash / caractère invisible (même famille que
// GHSA-wrjc-x8rr-h8h6 côté react-router) : le navigateur relit `/\evil.com`
// et `/\t/evil.com` comme `//evil.com`, donc un autre site.
describe("isInternalPath", () => {
  it("accepte un chemin interne avec requête ou ancre", () => {
    expect(isInternalPath("/linkedin")).toBe(true);
    expect(isInternalPath("/calendrier?view=mois#j12")).toBe(true);
    expect(isInternalPath("/login")).toBe(true);
  });

  it("refuse tout ce qui sort de l'app", () => {
    for (const v of [
      "//evil.com",
      "/\\evil.com",
      "\\\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "evil.com",
      "",
      null,
      undefined,
    ]) {
      expect(isInternalPath(v), String(v)).toBe(false);
    }
  });

  it("isSafeRedirectTarget refuse aussi l'antislash et les caractères de contrôle", () => {
    expect(isSafeRedirectTarget("/\\evil.com")).toBe(false);
    expect(isSafeRedirectTarget("/\t/evil.com")).toBe(false);
    expect(isSafeRedirectTarget("/%5Cevil.com")).toBe(true); // encodé = reste un chemin interne
  });
});
