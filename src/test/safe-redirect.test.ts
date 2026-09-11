import { describe, it, expect } from "vitest";
import { isSafeRedirectTarget } from "@/lib/safe-redirect";

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
