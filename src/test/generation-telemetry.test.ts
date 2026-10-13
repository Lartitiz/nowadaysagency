import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Échecs de génération étiquetés par format dans Sentry (lot 5, 13/10/2026).
const captureMessage = vi.fn();
vi.mock("@/lib/sentry", () => ({ Sentry: { captureMessage: (...args: unknown[]) => captureMessage(...args) } }));

const { describeGeneration, creativeFlowFormat, reportGenerationFailure } = await import("@/lib/generation-telemetry");

describe("format d'une génération", () => {
  it("creative-flow : les différents noms d'un même format donnent la même étiquette", () => {
    for (const c of ["linkedin_post", "post_linkedin", "linkedin"]) expect(creativeFlowFormat(c)).toBe("linkedin");
    for (const c of ["instagram_post", "post_instagram", "post"]) expect(creativeFlowFormat(c)).toBe("post");
    expect(creativeFlowFormat("post_newsletter")).toBe("newsletter");
    expect(creativeFlowFormat("post_pinterest")).toBe("pinterest");
    expect(creativeFlowFormat("stories")).toBe("stories");
    expect(creativeFlowFormat("reel")).toBe("reel");
    expect(creativeFlowFormat("recycle")).toBe("recycle");
    expect(creativeFlowFormat(undefined)).toBe("inconnu");
  });

  it("étape et mode photo", () => {
    expect(describeGeneration("creative-flow", { step: "generate", contentType: "post_linkedin" })).toEqual({ format: "linkedin", step: "generate" });
    expect(describeGeneration("creative-flow", { step: "questions", contentType: "instagram_post", photo_mode: true })).toEqual({ format: "post+photo", step: "questions" });
    expect(describeGeneration("carousel-ai", { type: "express_full", carousel_type: "mix" })).toEqual({ format: "carousel:mix", step: "express_full" });
    expect(describeGeneration("carousel-ai", { type: "slides" })).toEqual({ format: "carousel:text", step: "slides" });
    expect(describeGeneration("generate-content", { type: "bio-generator" })).toEqual({ format: "bio-generator", step: "generate" });
    expect(describeGeneration("linkedin-ai", { action: "crosspost" })).toEqual({ format: "linkedin", step: "crosspost" });
    expect(describeGeneration("pinterest-visual", { pin_type: "checklist" })).toEqual({ format: "pinterest", step: "checklist" });
  });

  it("n'utilise jamais un texte libre comme étiquette", () => {
    const d = describeGeneration("creative-flow", { step: "Mon sujet très personnel", contentType: "Ma cliente Julie m'a dit…" });
    expect(d).toEqual({ format: "inconnu", step: "inconnu" });
  });
});

describe("signalement à Sentry", () => {
  beforeEach(() => { captureMessage.mockClear(); vi.stubEnv("PROD", true); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("envoie fonction, format, étape et type d'erreur, sans le contenu de la requête", () => {
    reportGenerationFailure("creative-flow", {
      step: "generate", contentType: "post_linkedin",
      context: "Le sujet privé de l'utilisatrice", answers: [{ question: "?", answer: "réponse privée" }],
    }, "SERVER_ERROR");
    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [message, opts] = captureMessage.mock.calls[0];
    expect(message).toBe("Génération échouée : creative-flow / linkedin");
    expect(opts.tags).toEqual({ generation_function: "creative-flow", generation_format: "linkedin", generation_step: "generate", generation_error: "SERVER_ERROR" });
    expect(opts.fingerprint).toEqual(["generation-failure", "creative-flow", "linkedin", "SERVER_ERROR"]);
    expect(JSON.stringify(captureMessage.mock.calls)).not.toMatch(/privé|réponse/);
  });

  it("ignore le quota atteint, la session expirée et l'accès refusé", () => {
    for (const code of ["RATE_LIMIT", "AUTH", "FORBIDDEN", "SESSION_UNAVAILABLE"]) {
      reportGenerationFailure("carousel-ai", { type: "slides" }, code);
    }
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("ignore les fonctions qui ne génèrent pas de contenu", () => {
    reportGenerationFailure("create-checkout", {}, "SERVER_ERROR");
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("ne fait rien hors production", () => {
    vi.stubEnv("PROD", false);
    reportGenerationFailure("creative-flow", { step: "generate", contentType: "reel" }, "TIMEOUT");
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("ne lève jamais, même si Sentry plante", () => {
    captureMessage.mockImplementationOnce(() => { throw new Error("sentry indisponible"); });
    expect(() => reportGenerationFailure("creative-flow", { step: "generate", contentType: "reel" }, "TIMEOUT")).not.toThrow();
  });
});
