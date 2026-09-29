// Test temporaire : un contraste faible ne doit PAS bloquer la publication.
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCarouselQuality } from "@/hooks/use-carousel-quality";

// Slide avec texte gris clair sur fond blanc : contraste faible, mais aucune
// erreur bloquante (taille suffisante, pas de débordement, pas d'image).
const lowContrastSlide = {
  html: `<div style="width:1080px;height:1350px;background:#ffffff;position:relative;overflow:hidden">
    <p style="position:absolute;top:100px;left:100px;font-size:60px;color:#cccccc">Un texte peu contrasté mais lisible</p>
  </div>`,
};

describe("contraste faible et publication", () => {
  it("ne produit pas de raison de blocage", async () => {
    const { result } = renderHook(() =>
      useCarouselQuality([lowContrastSlide], true),
    );
    // Laisse le debounce (1 s) + le contrôle se terminer.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2500));
    });
    expect(result.current.status).toBe("done");
    expect(result.current.disabledReason).toBeUndefined();
    // Le conseil contraste peut exister, mais en avertissement seulement.
    const contrastIssues = result.current.issues.filter(
      (i) => i.kind === "contrast",
    );
    for (const issue of contrastIssues) {
      expect(issue.severity).not.toBe("error");
    }
  }, 15000);
});
