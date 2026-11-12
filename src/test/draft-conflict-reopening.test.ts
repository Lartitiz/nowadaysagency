import { describe, it, expect } from "vitest";
import { computeDraftConflict } from "@/features/creer/draft-conflict";

// « Reprendre le reel » avec un autre contenu ouvert dans Créer : le dialogue
// doit savoir qu'on rouvre un contenu enregistré, et le nommer (12/11/2026).
const base = {
  existingFlowState: { step: "result", ideaText: "Mon carrousel en cours", selectedFormat: "carousel", result: { raw: { slides: [] } } } as any,
  photoCount: 0, aurianaDemoActive: false, isFreshStart: false,
  paramSujet: "", paramIdeaId: null, paramAuto: false, paramFormat: null, paramCanal: "instagram",
};

describe("computeDraftConflict : contenu enregistré rouvert", () => {
  it("le signale et reprend son titre", () => {
    const conflict = computeDraftConflict({ ...base, locState: { fromCalendar: true, theme: "Avant / après du salon", resumeIdea: { format: "reel", raw: { script: [] } } } });
    expect(conflict?.reopening).toBe(true);
    expect(conflict?.newSubject).toBe("Avant / après du salon");
  });
  it("une nouvelle demande reste une nouvelle demande", () => {
    const conflict = computeDraftConflict({ ...base, locState: { sujet: "Une autre idée" } });
    expect(conflict?.reopening).toBe(false);
    expect(conflict?.newSubject).toBe("Une autre idée");
  });
});
