import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildCalendarContent } from "@/features/creer/build-calendar-content";
import { calendarPublishCaption } from "../../supabase/functions/_shared/calendar-caption";
import { reelScriptDraft } from "../../supabase/functions/_shared/reel-caption";

// Le script d'un reel copié dans le calendrier (front) doit être reconnu À
// L'IDENTIQUE par la règle de légende (publication programmée / directe),
// sinon il part en légende. Une seule implémentation : _shared/reel-caption.ts.

const sections = [
  { section: "hook", timing: "0-3 sec", texte_parle: "Mon accroche.", texte_overlay: "PARFAIT. DONC RATÉ.", format_visuel: "B-roll mains" },
  { section: "body", label: "Corps", timing: "3-15 sec", texte_parle: "Le corps du script.", texte_overlay: null, format_visuel: null },
  { section: "cta", timing: "15-20 sec", texte_parle: "Dis-le moi.", texte_overlay: "TON AVIS" },
];
const caption = { text: "La vraie légende.", cta: "Et toi ?" };

const shapes: Array<[string, Record<string, unknown>]> = [
  ["sections + script (forme actuelle)", { sections, script: sections }],
  ["script seul", { script: sections }],
  ["sections seul", { sections }],
  ["script imbriqué { sections }", { script: { sections } }],
  ["sections resté en chaîne (gabarit du prompt) + script", { sections: "DUPLIQUE ICI le contenu du tableau script", script: sections }],
];

describe("reel : brouillon calendrier et règle de légende partagent le même formateur", () => {
  it.each(shapes)("%s : le script copié n'est jamais publié en légende", (_name, shape) => {
    const raw = { ...shape, caption, hashtags: ["#atelier"] };
    const { contentDraft, storyDetail } = buildCalendarContent("reel", raw);
    expect(contentDraft).toBe(reelScriptDraft(sections));
    for (const s of sections) expect(contentDraft).toContain(s.texte_parle);
    const published = calendarPublishCaption(contentDraft, storyDetail);
    expect(published).toBe("La vraie légende.\n\nEt toi ?\n\n#atelier");
    expect(published).not.toContain("Mon accroche.");
  });

  it("une légende retouchée à la main dans le calendrier reste prioritaire", () => {
    const { storyDetail } = buildCalendarContent("reel", { sections, caption });
    expect(calendarPublishCaption("Ma légende à moi", storyDetail)).toBe("Ma légende à moi");
  });

  it("ancien reel au script en simple chaîne : le script n'est pas non plus publié en légende", () => {
    const raw = { script: "Ancien script\nDeuxième phrase", caption: { text: "Légende distincte" } };
    const { contentDraft, storyDetail } = buildCalendarContent("reel", raw);
    expect(contentDraft).toBe(raw.script);
    expect(calendarPublishCaption(contentDraft, storyDetail)).toBe("Légende distincte");
  });

  it("le front n'a plus sa propre copie du formateur", () => {
    const src = readFileSync("src/features/creer/build-calendar-content.ts", "utf8");
    expect(src).toContain("reelScriptDraft(");
    expect(src).not.toMatch(/📹/);
  });
});
