import { describe, expect, it } from "vitest";
import { buildCalendarExistingContent, calendarContextLines, stripCalendarContext } from "@/features/creer/calendar-entry-context";
import { flattenResultForEdit } from "@/features/creer/edit-text-from-result";

/* Point 3 des suites de la fiche 13 (16/10/2026) : les repères envoyés par la
   fenêtre d'un post du calendrier (notes, accroche, lancement) arrivent enfin
   aux générateurs, sans jamais devenir le texte du post à modifier. */

const lancement = {
  fromCalendar: true, existingContent: "Brouillon", notes: "Penser au code promo", existingAccroche: "Et si on arrêtait ?",
  launchId: "L1", contentType: "teasing",
  launchContext: { launchId: "L1", contentType: "teasing", chapter: 2, chapterLabel: "Les coulisses", audiencePhase: "froid" },
};

describe("repères du calendrier", () => {
  it("brouillon + accroche + notes + lancement", () => {
    expect(buildCalendarExistingContent(lancement)).toBe(
      "Brouillon\n\n[Repères du calendrier]\nAccroche déjà écrite : Et si on arrêtait ?\nNotes : Penser au code promo\n"
      + "Contenu d'un lancement : type de contenu « teasing », chapitre « Les coulisses », phase d'audience « froid »",
    );
  });

  it("sans brouillon : les repères seuls", () => {
    expect(buildCalendarExistingContent({ fromCalendar: true, notes: "Note" })).toBe("[Repères du calendrier]\nNotes : Note");
  });

  it("accroche déjà dans le brouillon : pas répétée", () => {
    expect(calendarContextLines({ fromCalendar: true, existingContent: "Et si on arrêtait ? Suite", existingAccroche: "Et si on arrêtait ?" })).toEqual([]);
  });

  it("chapitre sans libellé : son numéro ; lancement sans détail : mention seule", () => {
    expect(calendarContextLines({ fromCalendar: true, launchContext: { chapter: 3 } })).toEqual(["Contenu d'un lancement : chapitre « 3 »"]);
    expect(calendarContextLines({ fromCalendar: true, launchContext: {} })).toEqual(["Contenu d'un lancement"]);
  });

  it("type de contenu hors lancement : ignoré (post ordinaire)", () => {
    expect(calendarContextLines({ fromCalendar: true, contentType: "teasing", category: "vente" })).toEqual([]);
  });

  it("notes de plus de 1 500 caractères coupées", () => {
    const [ligne] = calendarContextLines({ fromCalendar: true, notes: "n".repeat(2000) });
    expect(ligne).toHaveLength("Notes : ".length + 1500);
    expect(ligne.endsWith("...")).toBe(true);
  });

  it("hors calendrier (ex. statistiques Instagram) : contenu existant inchangé", () => {
    expect(buildCalendarExistingContent({ existingContent: "Texte", notes: "ignorée" })).toBe("Texte");
    expect(buildCalendarExistingContent({})).toBeNull();
  });

  it("calendrier sans repère : brouillon tel quel (non retouché)", () => {
    expect(buildCalendarExistingContent({ fromCalendar: true, existingContent: " Brouillon " }, " Brouillon ")).toBe(" Brouillon ");
  });

  it("stripCalendarContext rend le brouillon seul", () => {
    expect(stripCalendarContext(buildCalendarExistingContent(lancement))).toBe("Brouillon");
    expect(stripCalendarContext(buildCalendarExistingContent({ fromCalendar: true, notes: "N" }))).toBe("");
    expect(stripCalendarContext("Texte")).toBe("Texte");
    expect(stripCalendarContext(null)).toBe("");
  });

  it("« Modifier » sans résultat : le brouillon, jamais les notes", () => {
    const existant = buildCalendarExistingContent(lancement);
    expect(flattenResultForEdit("post", null, existant)).toBe("Brouillon");
    expect(flattenResultForEdit("post", "null", existant)).toBe("Brouillon");
    expect(flattenResultForEdit("post", null, buildCalendarExistingContent({ fromCalendar: true, notes: "N" }))).toBe("");
  });
});
