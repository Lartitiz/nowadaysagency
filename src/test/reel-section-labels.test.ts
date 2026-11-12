import { describe, it, expect } from "vitest";
import { reelCalendarCaption, reelScriptDraft, reelSectionTitle } from "../../supabase/functions/_shared/reel-caption";

// QA du 12/11/2026 : la fiche idée et le post du calendrier montraient
// « HOOK », « BODY », « CTA » (les codes internes des passages du reel).
const sections = [
  { section: "hook", timing: "0-3 sec", texte_parle: "Accroche dite." },
  { section: "body", timing: "3-20 sec", texte_parle: "Le cœur." },
  { section: "cta", timing: "20-25 sec", texte_parle: "Abonne-toi." },
];

describe("Passages d'un reel en français", () => {
  it("nomme les passages sans code anglais", () => {
    expect(sections.map(reelSectionTitle)).toEqual(["Accroche", "Développement", "Appel à l'action"]);
    expect(reelSectionTitle({ label: "Mon passage" })).toBe("Mon passage");
    expect(reelSectionTitle({ section: "astuce_bonus" })).toBe("Astuce bonus");
  });

  it("le script copié dans le calendrier n'affiche plus HOOK / BODY / CTA", () => {
    const draft = reelScriptDraft(sections);
    expect(draft).not.toMatch(/HOOK|BODY|\bCTA\b/);
    expect(draft).toContain("[0-3 sec] ACCROCHE\nAccroche dite.");
    expect(draft).toContain("APPEL À L'ACTION");
  });

  it("un post déjà enregistré avec l'ancien script (HOOK…) part toujours avec la légende", () => {
    const legacy = sections.map((s) => `[${s.timing}] ${s.section.toUpperCase()}\n${s.texte_parle}`).join("\n\n");
    const detail = { type: "reel", sections, caption: { text: "Ma légende" } };
    expect(reelCalendarCaption(legacy, detail)).toBe("Ma légende");
    expect(reelCalendarCaption(reelScriptDraft(sections), detail)).toBe("Ma légende");
    expect(reelCalendarCaption("Texte retouché à la main", detail)).toBe("Texte retouché à la main");
  });
});
