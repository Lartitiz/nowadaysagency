// Test temporaire : un contraste faible ne doit PAS bloquer la publication.
import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectSlide } from "@/lib/carousel-quality";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("contraste faible et publication", () => {
  it("le contraste faible reste un avertissement, jamais une erreur bloquante", () => {
    document.body.innerHTML = `<div style="background-color:rgb(255,255,255)"><p data-editor-id="t" style="font-size:48px;color:rgb(204,204,204)">Un texte peu contrasté</p></div>`;
    const el = document.querySelector("p")!;
    const bounds = { left: 80, top: 100, right: 800, bottom: 250, width: 720, height: 150 };
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(bounds as DOMRect);
    vi.spyOn(document, "createRange").mockReturnValue({
      selectNodeContents() {},
      getBoundingClientRect: () => bounds,
    } as any);

    const issues = inspectSlide(document, 0);
    const contrastIssues = issues.filter((i) => i.kind === "contrast");
    // Le contraste faible est bien détecté (conseil affiché)…
    expect(contrastIssues.length).toBeGreaterThan(0);
    // …mais jamais en erreur : la publication/programmation n'est pas bloquée.
    for (const issue of contrastIssues) {
      expect(issue.severity).toBe("warning");
    }
    // Et aucune erreur bloquante ne ressort de cette slide.
    expect(issues.some((i) => i.severity === "error")).toBe(false);
  });
});
