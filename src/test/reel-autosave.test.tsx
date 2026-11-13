import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// Reel (13/11/2026) : enregistré tout seul dans Mes idées, comme le carrousel
// et les stories (choix de Laetitia). Avant, il fallait « Garder dans mes idées ».
const linked = vi.hoisted(() => ({ rows: [] as any[], filters: [] as any[] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => { linked.filters.push([k, v]); return q; },
        order: () => q,
        limit: async () => ({ data: linked.rows, error: null }),
      };
      return q;
    },
  },
}));
import { reelScriptOf, useReelCloud } from "@/hooks/use-reel-cloud";
import { buildCalendarContent } from "@/features/creer/build-calendar-content";
import { resumeIdea } from "@/lib/resume-idea";
import { findLinkedReelIdea } from "@/lib/calendar-reel-resume";
import { contentAlreadyKept } from "@/features/creer/keep-content";

const base = { ready: true, step: "result", selectedFormat: "reel", busy: false, calendarOnly: false };
const script = [{ texte_parle: "Bienvenue" }, { texte_parle: "La suite" }];

describe("useReelCloud", () => {
  it("gives the reel a document id once, then enables the autosave", () => {
    let current: any = { raw: { sections: script } };
    const setResult = vi.fn((update: any) => { current = update(current); });
    const first = renderHook((p: any) => useReelCloud(p), { initialProps: { ...base, raw: current.raw, setResult } });
    expect(first.result.current).toBe(false);
    expect(current.raw._carousel_document_id).toEqual(expect.any(String));
    expect(current.raw.reel_editor_version).toBe(1);
    first.rerender({ ...base, raw: current.raw, setResult });
    expect(first.result.current).toBe(true);
    expect(setResult).toHaveBeenCalledTimes(1);
  });

  it("stays off while generating, outside the reel, without account, without script, or reopened from the calendar alone", () => {
    const setResult = vi.fn();
    const raw = { sections: script, _carousel_document_id: "d" };
    for (const props of [
      { ...base, busy: true, raw },
      { ...base, selectedFormat: "story", raw },
      { ...base, ready: false, raw },
      { ...base, step: "hook_selection", raw },
      { ...base, raw: { sections: [] } },
      { ...base, calendarOnly: true, raw },
    ]) {
      const { result } = renderHook((p: any) => useReelCloud(p), { initialProps: { ...props, setResult } });
      expect(result.current).toBe(false);
    }
    expect(setResult).not.toHaveBeenCalled();
  });

  it("reads the script under every shape the reel screen accepts", () => {
    expect(reelScriptOf({ script: [{}] })).toHaveLength(1);
    expect(reelScriptOf({ script: { sections: [{}] } })).toHaveLength(1);
    expect(reelScriptOf({ sections: "texte" })).toBeNull();
  });

  it("an autosaved reel counts as kept when the format or the subject changes", () => {
    expect(contentAlreadyKept({ raw: { sections: script, _carousel_cloud: { revision: "r", history: [] } }, editingIdeaId: "i", currentSignature: "x" })).toBe(true);
  });
});

describe("reel between Mes idées and the calendar", () => {
  it("keeps the autosave markers out of the calendar copy", () => {
    const raw = { sections: script, _carousel_document_id: "d", _carousel_cloud: { revision: "r", history: [] }, _carousel_base_updated_at: "t", reel_editor_version: 1 };
    const { storyDetail } = buildCalendarContent("reel", raw) as any;
    expect(storyDetail.type).toBe("reel");
    expect(storyDetail).not.toHaveProperty("_carousel_cloud");
    expect(storyDetail).not.toHaveProperty("_carousel_document_id");
    expect(storyDetail).not.toHaveProperty("_carousel_base_updated_at");
  });

  it("a reel idea remembers its version, so another tab's edit is never overwritten", () => {
    const resumed = resumeIdea({ format: "reel", content_data: { sections: script }, updated_at: "2026-11-13T10:00:00Z" } as any);
    expect(resumed?.format).toBe("reel");
    expect(resumed?.raw._carousel_base_updated_at).toBe("2026-11-13T10:00:00Z");
  });

  it("reopening a scheduled reel from the calendar resumes its linked idea", async () => {
    linked.rows = [{ id: "idea-1", format: "reel", content_data: { sections: script }, updated_at: "t1" }];
    const found = await findLinkedReelIdea("post-1", ["https://x.supabase.co/storage/v1/object/public/calendar-media/u/reels/a.mp4"]);
    expect(linked.filters).toContainEqual(["calendar_post_id", "post-1"]);
    expect(linked.filters).toContainEqual(["format", "reel"]);
    expect(found?.ideaId).toBe("idea-1");
    expect(found?.resumeIdea.raw.sections).toEqual(script);
    linked.rows = [];
    expect(await findLinkedReelIdea("post-2")).toBeNull();
    expect(await findLinkedReelIdea(null)).toBeNull();
  });
});
