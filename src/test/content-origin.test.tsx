import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ContentPreview } from "@/components/ContentPreview";
import { isAiGeneratedContent } from "@/lib/content-origin";

vi.mock("@/hooks/use-story-export", () => ({ useStoryExport: () => ({ hasFrames: false }) }));
vi.mock("@/components/exports/StoryExportButtons", () => ({ StoryExportButtons: () => null }));
afterEach(cleanup);

describe("provenance du contenu enregistré", () => {
  it("does not call a manually written calendar post AI-generated", () => {
    const manual = { content: "J'ai écrit ce post moi-même." };
    expect(isAiGeneratedContent(manual, null)).toBe(false);
    render(<ContentPreview contentData={manual} aiGenerated={false} />);
    expect(screen.queryByText(/Contenu généré avec l'aide de l'IA/)).toBeNull();
  });

  it("retains a known AI origin after moving an idea through the calendar", () => {
    const calendarCopy = { content: "Exemple fictif", story_sequence_detail: { _ai_generated: true } };
    expect(isAiGeneratedContent(calendarCopy)).toBe(true);
    render(<ContentPreview contentData={calendarCopy} />);
    expect(screen.getByText(/Contenu généré avec l'aide de l'IA/)).toBeTruthy();
  });

  it("recognizes historical generated ideas by their source module", () => {
    expect(isAiGeneratedContent("Texte", "creer")).toBe(true);
    expect(isAiGeneratedContent("Texte", "recycling")).toBe(true);
  });
});
