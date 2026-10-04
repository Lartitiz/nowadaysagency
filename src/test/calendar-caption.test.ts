import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { calendarPublishCaption } from "../../supabase/functions/_shared/calendar-caption";
import { CALENDAR_CAPTION_CASES } from "../../supabase/functions/_shared/calendar-caption-cases";
import { reelCalendarCaption } from "../../supabase/functions/_shared/reel-caption";
import { buildCalendarContent } from "@/features/creer/build-calendar-content";
import { extractInstagramCaption } from "@/features/creer/publish-guards";

// Mêmes cas que le test Deno (supabase/functions/_shared/calendar-caption_test.ts).
describe("légende publiée depuis le calendrier (règle partagée edge/front)", () => {
  for (const c of CALENDAR_CAPTION_CASES) {
    it(c.name, () => {
      expect(calendarPublishCaption(c.draft, c.detail)).toBe(c.expected);
    });
  }
});

const RAW_CAROUSEL = {
  carousel_type: "tips",
  slides: [{ title: "Titre slide 1", body: "Corps slide 1" }, { title: "Titre slide 2", body: "Corps slide 2" }],
  caption: { hook: "Accroche", body: "Le corps de la légende.", cta: "Dis-moi.", hashtags: ["atelier"] },
};

describe("carrousel texte enregistré au calendrier", () => {
  it("le brouillon garde le texte des slides (affichage inchangé) mais la légende publiée ne le contient pas", () => {
    const { contentDraft, storyDetail } = buildCalendarContent("carousel", RAW_CAROUSEL);
    expect(contentDraft).toContain("───── SLIDES ─────");
    expect(contentDraft).toContain("Corps slide 1");
    const caption = calendarPublishCaption(contentDraft, storyDetail);
    expect(caption).toBe("Accroche\nLe corps de la légende.\nDis-moi.\n\n#atelier");
    expect(caption).not.toContain("Corps slide");
  });

  it("carrousel mix : le dump « SLIDE n [📝]: » ne part pas en légende", () => {
    const raw = { carousel_type: "mix", slides: [{ slide_type: "text_only", title: "T", body: "B" }, { slide_type: "photo_full", overlay_text: "O" }], caption: { hook: "Accroche", body: "Corps" } };
    const { contentDraft, storyDetail } = buildCalendarContent("carousel", raw);
    expect(calendarPublishCaption(contentDraft, storyDetail)).toBe("Accroche\n\nCorps");
  });

  it("carrousel photo : le dump « SLIDE n: » ne part pas en légende", () => {
    const raw = { carousel_type: "photo", slides: [{ overlay_text: "O" }, {}], caption: { hook: "Accroche", body: "Corps" } };
    const { contentDraft, storyDetail } = buildCalendarContent("carousel", raw);
    expect(calendarPublishCaption(contentDraft, storyDetail)).toBe("Accroche\n\nCorps");
  });

  it("crosspost repris du calendrier (edited_text à séparateur) : seule la légende part sur Instagram", () => {
    const { contentDraft } = buildCalendarContent("carousel", RAW_CAROUSEL);
    expect(extractInstagramCaption({ ...RAW_CAROUSEL, edited_text: contentDraft })).toBe("Accroche\nLe corps de la légende.\nDis-moi.\n\n#atelier");
    // Texte édité sans séparateur : inchangé.
    expect(extractInstagramCaption({ ...RAW_CAROUSEL, edited_text: "Ma légende" })).toBe("Ma légende");
  });
});

// Exécute le vrai code de CalendarPostDialog (extrait par l'AST) avec des dépendances factices.
function dialogSnippet(name: string): string {
  const source = readFileSync("src/components/calendar/CalendarPostDialog.tsx", "utf8");
  const file = ts.createSourceFile("CalendarPostDialog.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let snippet = "";
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) snippet = node.initializer!.getText(file);
    ts.forEachChild(node, visit);
  };
  visit(file);
  expect(snippet).not.toBe("");
  return ts.transpileModule("const run=" + snippet, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

describe("publication directe depuis le calendrier", () => {
  const { contentDraft, storyDetail } = buildCalendarContent("carousel", RAW_CAROUSEL);

  it("Instagram (carrousel d'images) : la légende publiée ne contient pas le texte des slides", async () => {
    const deps = {
      user: { id: "user-A" }, workspaceId: "ws-A", instagramPublishDisabledReason: null,
      igVideo: null, igValidImages: ["https://cdn.test/1.png", "https://cdn.test/2.png"],
      contentDraft, theme: "Mon carrousel", savedPreviewContent: storyDetail,
      reelCalendarCaption, calendarPublishCaption,
      publishReelToInstagram: vi.fn(), publishToInstagram: vi.fn().mockResolvedValue({ postId: "p" }),
      markPostPublished: vi.fn(), setPublishingInstagram: vi.fn(),
      toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() }, isNotConnectedError: () => false, friendlyError: String,
    };
    const run = new Function(...Object.keys(deps), dialogSnippet("handlePublishInstagram") + ";return run;")(...Object.values(deps));
    await run();
    expect(deps.publishToInstagram).toHaveBeenCalledWith(expect.objectContaining({
      caption: "Accroche\nLe corps de la légende.\nDis-moi.\n\n#atelier",
    }));
  });

  it("LinkedIn : le texte publié est la légende seule ; un post texte reste inchangé", () => {
    const code = dialogSnippet("linkedInText") + ";return run;";
    const text = (draft: string, detail: any) => new Function("contentDraft", "savedPreviewContent", "calendarPublishCaption", code)(draft, detail, calendarPublishCaption);
    expect(text(contentDraft, storyDetail)).toBe("Accroche\nLe corps de la légende.\nDis-moi.\n\n#atelier");
    expect(text("  Mon post LinkedIn  ", null)).toBe("Mon post LinkedIn");
  });
});
