import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// Stories (12/11/2026) : sauvegarde continue dans Mes idées et reprise depuis
// le calendrier. Avant, fermer l'onglet sans « Garder dans mes idées » perdait
// la séquence, et une séquence au calendrier ne se rouvrait qu'en lecture.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { storySequenceOf, useStoriesCloud } from "@/hooks/use-stories-cloud";
import { isCalendarStories, resumeCalendarStories } from "@/lib/calendar-stories-resume";
import { buildCalendarContent } from "@/features/creer/build-calendar-content";
import { resumeIdea } from "@/lib/resume-idea";

const base = { ready: true, step: "result", selectedFormat: "story", busy: false };

describe("useStoriesCloud", () => {
  it("gives the sequence a document id once, then enables the autosave", () => {
    let current: any = { raw: { stories: [{ text: "A" }] } };
    const setResult = vi.fn((update: any) => { current = update(current); });
    const first = renderHook((p: any) => useStoriesCloud(p), { initialProps: { ...base, raw: current.raw, setResult } });
    expect(first.result.current).toBe(false);
    expect(current.raw._carousel_document_id).toEqual(expect.any(String));
    expect(current.raw.story_editor_version).toBe(1);
    first.rerender({ ...base, raw: current.raw, setResult });
    expect(first.result.current).toBe(true);
    expect(setResult).toHaveBeenCalledTimes(1);
  });

  it("stays off while generating, outside stories, without account or without stories", () => {
    const setResult = vi.fn();
    const raw = { stories: [{ text: "A" }], _carousel_document_id: "d" };
    for (const props of [
      { ...base, busy: true, raw },
      { ...base, selectedFormat: "carousel", raw },
      { ...base, ready: false, raw },
      { ...base, step: "edit", raw },
      { ...base, raw: { stories: [] } },
    ]) {
      const { result } = renderHook((p: any) => useStoriesCloud(p), { initialProps: { ...props, setResult } });
      expect(result.current).toBe(false);
    }
    expect(setResult).not.toHaveBeenCalled();
  });

  it("reads the same lists as the stories screen", () => {
    expect(storySequenceOf({ sequences: [{}] })).toHaveLength(1);
    expect(storySequenceOf({ slides: [{}] })).toHaveLength(1);
    expect(storySequenceOf({})).toBeNull();
  });
});

describe("stories in the calendar", () => {
  it("keeps the autosave markers out of the calendar copy", () => {
    const raw = {
      stories: [{ number: 1, text: "Bonjour" }],
      _carousel_document_id: "d",
      _carousel_cloud: { revision: "r", history: [{ savedAt: "x", raw: {} }] },
      _carousel_base_updated_at: "t",
    };
    const { storyDetail } = buildCalendarContent("story", raw) as any;
    expect(storyDetail.type).toBe("stories");
    expect(storyDetail.stories[0].text).toBe("Bonjour");
    expect(storyDetail).not.toHaveProperty("_carousel_cloud");
    expect(storyDetail).not.toHaveProperty("_carousel_document_id");
    expect(storyDetail).not.toHaveProperty("_carousel_base_updated_at");
  });

  it("reopens a saved sequence for editing, without its calendar-only fields", () => {
    const detail = { type: "stories", stories: [{ text: "A" }], personal_tip: "Montre le geste", visual_urls: ["u"] };
    expect(isCalendarStories(detail)).toBe(true);
    const resumed = resumeCalendarStories(detail)!;
    expect(resumed.format).toBe("story");
    expect(resumed.raw).toEqual({ stories: [{ text: "A" }], personal_tip: "Montre le geste" });
    expect(detail.type).toBe("stories");
  });

  it("does not offer it for other contents", () => {
    expect(isCalendarStories({ type: "reel", sections: [{}] })).toBe(false);
    expect(isCalendarStories({ type: "stories", stories: [] })).toBe(false);
    expect(isCalendarStories({ type: "stories", stories: [{}], _crosspost: true })).toBe(false);
    expect(resumeCalendarStories(null)).toBeNull();
  });

  it("a stories idea remembers its version, so another tab's edit is never overwritten", () => {
    const resumed = resumeIdea({ format: "story_serie", content_data: { stories: [{ text: "A" }] }, updated_at: "2026-11-12T10:00:00Z" } as any);
    expect(resumed?.format).toBe("story");
    expect(resumed?.raw._carousel_base_updated_at).toBe("2026-11-12T10:00:00Z");
  });
});
