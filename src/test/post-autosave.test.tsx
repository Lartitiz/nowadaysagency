import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// Post écrit (13/11/2026) : enregistré tout seul dans Mes idées, comme le
// carrousel, les stories et le reel (choix de Laetitia).
import { usePostCloud } from "@/hooks/use-post-cloud";
import { resumeIdea } from "@/lib/resume-idea";
import { contentAlreadyKept } from "@/features/creer/keep-content";

const base = { ready: true, step: "result", selectedFormat: "post", busy: false, calendarOnly: false, hasPhotos: false };

function run(props: any, raw: any) {
  let current: any = { raw };
  const setResult = vi.fn((update: any) => { current = update(current); });
  const hook = renderHook((p: any) => usePostCloud(p), { initialProps: { ...base, ...props, raw: current.raw, setResult } });
  hook.rerender({ ...base, ...props, raw: current.raw, setResult });
  return { enabled: hook.result.current, current, setResult };
}

describe("usePostCloud", () => {
  it("donne au post Instagram un identifiant puis active la sauvegarde", () => {
    const { enabled, current } = run({}, { content: "Mon post" });
    expect(enabled).toBe(true);
    expect(current.raw._carousel_document_id).toEqual(expect.any(String));
    expect(current.raw.post_editor_version).toBe(1);
  });
  it("vaut aussi pour le post LinkedIn", () => {
    expect(run({ selectedFormat: "linkedin" }, { full_text: "Mon post LinkedIn" }).enabled).toBe(true);
  });
  it("attend la fin de la génération, laisse les photos et le calendrier à leur chemin", () => {
    expect(run({ busy: true }, { content: "x" }).enabled).toBe(false);
    expect(run({ hasPhotos: true }, { content: "x" }).enabled).toBe(false);
    expect(run({ calendarOnly: true }, { content: "x" }).enabled).toBe(false);
    expect(run({ selectedFormat: "newsletter" }, { content: "x" }).enabled).toBe(false);
    expect(run({}, { content: "  " }).enabled).toBe(false);
  });
});

describe("post rangé tout seul : reprise et garde de sortie", () => {
  it("se reprend de Mes idées avec sa version, pour ne rien écraser", () => {
    const resumed = resumeIdea({ format: "post", updated_at: "2026-11-13T10:00:00Z", content_data: { content: "Mon post", post_editor_version: 1, _carousel_document_id: "d1" } } as any);
    expect(resumed?.format).toBe("post");
    expect(resumed?.raw._carousel_base_updated_at).toBe("2026-11-13T10:00:00Z");
  });
  it("un ancien post gardé à la main ne change pas de reprise", () => {
    const resumed = resumeIdea({ format: "post", updated_at: "2026-11-13T10:00:00Z", content_data: { content: "Ancien" } } as any);
    expect(resumed?.raw._carousel_base_updated_at).toBeUndefined();
  });
  it("ne redemande pas « Garder ce contenu ? » une fois enregistré", () => {
    expect(contentAlreadyKept({ raw: { content: "x", _carousel_cloud: {} }, editingIdeaId: "i1", currentSignature: "s" })).toBe(true);
  });
});
