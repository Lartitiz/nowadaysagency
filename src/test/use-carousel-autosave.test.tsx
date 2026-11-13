import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  rows: new Map<string, any>(),
  ops: [] as any[],
  fail: false,
  tick: 0,
  writeGate: undefined as Promise<void> | undefined,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let operation = "read",
        payload: any,
        id: string,
        timestamp: string | undefined;
      const filters: any[] = [];
      const execute = async () => {
        db.ops.push({ operation, payload, filters });
        if (db.fail) return { data: null, error: new Error("offline") };
        if (operation === "read")
          return { data: db.rows.get(id) || null, error: null };
        if (db.writeGate) await db.writeGate;
        if (operation === "update" && db.rows.get(id)?.updated_at !== timestamp)
          return { data: null, error: null };
        if (operation === "insert") {
          id = payload.id;
          if (db.rows.has(id))
            return { data: null, error: new Error("duplicate") };
        }
        const row = {
          ...(db.rows.get(id) || {}),
          ...payload,
          id,
          updated_at: new Date(1_800_000_000_000 + ++db.tick).toISOString(),
        };
        db.rows.set(id, row);
        return { data: row, error: null };
      };
      const q: any = {
        select: () => q,
        abortSignal: () => q,
        eq: (key: string, value: any) => {
          filters.push([key, value]);
          if (key === "id") id = value;
          if (key === "updated_at") timestamp = value;
          return q;
        },
        is: (key: string, value: any) => {
          filters.push([key, value]);
          return q;
        },
        or: (value: string) => {
          filters.push(["or", value]);
          return q;
        },
        insert: (row: any) => {
          operation = "insert";
          payload = row;
          return q;
        },
        update: (row: any) => {
          operation = "update";
          payload = row;
          return q;
        },
        single: execute,
        maybeSingle: execute,
      };
      return q;
    },
  },
}));
import { useCarouselAutosave } from "@/hooks/use-carousel-autosave";
const raw = (text = "A") => ({
  _carousel_document_id: "document-1",
  carousel_editor_version: 1,
  slides: [],
  caption: { body: text },
  visual_html: [{ html: "<p>test</p>" }],
});
function options() {
  return {
    enabled: true,
    userId: "user-1",
    workspaceId: "workspace-1",
    isOwnSpace: true,
    ideaId: null as string | null,
    raw: raw(),
    title: "Test",
    channel: "instagram",
    onId: vi.fn(),
    onSaved: vi.fn(),
    onRestore: vi.fn(),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("AbortSignal", { timeout: () => new AbortController().signal });
  db.rows.clear();
  db.ops = [];
  db.fail = false;
  db.tick = 0;
  db.writeGate = undefined;
});
afterEach(async () => {
  cleanup();
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(1250);
  });
describe("carousel autosave lifecycle", () => {
  it("still refuses a real external revision when handing off a generation", async () => {
    const o = options();
    const { result, rerender } = renderHook((p) => useCarouselAutosave(p), { initialProps: o });
    await settle();
    const id = o.onId.mock.calls[0][0];
    const row = db.rows.get(id);
    db.rows.set(id, { ...row, updated_at: "external", content_data: { ...row.content_data, _carousel_cloud: { revision: "external", history: [] } } });
    rerender({ ...o, ideaId: id, raw: { ...raw("new narrative"), _carousel_document_id: "generation-2" } });
    await settle();
    expect(result.current.status).toBe("conflict");
    expect(db.rows.get(id).content_data._carousel_cloud.revision).toBe("external");
  });
  it("retries an interrupted predecessor before saving the new generation", async () => {
    const o = options();
    const { result, rerender } = renderHook((p) => useCarouselAutosave(p), { initialProps: o });
    await settle();
    const id = o.onId.mock.calls[0][0];
    db.fail = true;
    rerender({ ...o, ideaId: id, raw: raw("pending") });
    await settle();
    rerender({ ...o, ideaId: id, raw: { ...raw("new narrative"), _carousel_document_id: "generation-2" } });
    await settle();
    expect(result.current.status).toBe("error");
    db.fail = false;
    await act(async () => { await result.current.flush(); });
    expect(result.current.status).toBe("saved");
    expect(db.rows.size).toBe(1);
    expect(db.rows.get(id).content_data.caption.body).toBe("new narrative");
  });
  it("waits for the previous generation's pending write before saving its replacement", async () => {
    const o = options();
    const { result, rerender } = renderHook((p) => useCarouselAutosave(p), { initialProps: o });
    await settle();
    const id = o.onId.mock.calls[0][0];
    let release!: () => void;
    db.writeGate = new Promise<void>((resolve) => { release = resolve; });
    rerender({ ...o, ideaId: id, raw: raw("old pending edit") });
    await settle();
    rerender({ ...o, ideaId: id, raw: { ...raw("new narrative"), _carousel_document_id: "generation-2" } });
    await settle();
    await act(async () => { release(); });
    await settle();
    expect(result.current.status).toBe("saved");
    expect(db.rows.size).toBe(1);
    expect(db.rows.get(id).content_data.caption.body).toBe("new narrative");
    expect(db.rows.get(id).content_data._carousel_document_id).toBe("generation-2");
    expect(db.rows.get(id).content_data._carousel_cloud.history.some((v: any) => v.raw.caption.body === "A")).toBe(true);
  });
  it("does not keep copying when the user opens another existing idea", async () => {
    const o = options();
    const { result, rerender } = renderHook((p) => useCarouselAutosave(p), {
      initialProps: o,
    });
    await settle();
    act(() => result.current.saveCopy());
    await settle();
    const next = { ...raw("Next"), _carousel_document_id: "document-2" };
    db.rows.set("idea-2", {
      id: "idea-2",
      updated_at: "old",
      content_data: next,
    });
    rerender({ ...o, ideaId: "idea-2", raw: next });
    await settle();
    expect(result.current.status).toBe("saved");
    expect(db.rows.size).toBe(3);
    expect(o.onId).toHaveBeenLastCalledWith("idea-2");
  });
  it("debounces edits and acknowledges only the saved version", async () => {
    const o = options();
    const { result, rerender } = renderHook((p) => useCarouselAutosave(p), {
      initialProps: o,
    });
    expect(result.current.status).toBe("saving");
    expect(db.rows.size).toBe(0);
    rerender({ ...o, raw: raw("B") });
    await settle();
    expect(result.current.status).toBe("saved");
    expect(db.rows.size).toBe(1);
    expect([...db.rows.values()][0].content_data.caption.body).toBe("B");
    expect(o.onId).toHaveBeenCalledTimes(1);
  });
  it("does not create a second controller when the reserved ID is echoed or effects replay", async () => {
    const o = options();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );
    const { rerender } = renderHook((p) => useCarouselAutosave(p), {
      initialProps: o,
      wrapper,
    });
    rerender({ ...o, ideaId: o.onId.mock.calls[0][0] });
    await settle();
    expect(db.rows.size).toBe(1);
    expect(db.ops.filter((o) => o.operation === "insert")).toHaveLength(1);
  });
  it("flushes a pending edit when navigating away", async () => {
    const o = options();
    const { unmount } = renderHook(() => useCarouselAutosave(o));
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(db.rows.size).toBe(1);
  });
  it("recovers after network failure on the online event", async () => {
    db.fail = true;
    const o = options();
    const { result } = renderHook(() => useCarouselAutosave(o));
    await settle();
    expect(result.current.status).toBe("error");
    db.fail = false;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.status).toBe("saved");
    expect(db.rows.size).toBe(1);
  });
  it("does not save the old document into a newly selected workspace", async () => {
    const o = options();
    const { result, rerender } = renderHook((p) => useCarouselAutosave(p), {
      initialProps: o,
    });
    await settle();
    const writes = db.ops.length;
    rerender({
      ...o,
      workspaceId: "client-2",
      isOwnSpace: false,
      raw: raw("B"),
    });
    await settle();
    expect(result.current.status).toBe("blocked");
    expect(db.ops.length).toBe(writes);
  });
  it("does not include legacy personal rows when saving in a client's workspace", async () => {
    const o = { ...options(), isOwnSpace: false };
    renderHook(() => useCarouselAutosave(o));
    await settle();
    expect(db.ops[0].filters).toContainEqual(["workspace_id", "workspace-1"]);
    expect(db.ops[0].filters.some((f: any) => f[0] === "or")).toBe(false);
  });
  it("exposes a conflict without overwriting it, and forks only on explicit copy", async () => {
    db.rows.set("existing", {
      id: "existing",
      updated_at: "today",
      content_data: { _carousel_cloud: { revision: "other" } },
    });
    const o = { ...options(), ideaId: "existing" };
    const { result } = renderHook(() => useCarouselAutosave(o));
    await settle();
    expect(result.current.status).toBe("conflict");
    act(() => result.current.saveCopy());
    await settle();
    expect(result.current.status).toBe("saved");
    expect(db.rows.size).toBe(2);
    expect(db.rows.get("existing").content_data._carousel_cloud.revision).toBe(
      "other",
    );
  });
});

// Stories (12/11/2026) : même sauvegarde continue, rangée en « story_serie ».
describe("stories autosave", () => {
  const stories = (text: string) => ({
    _carousel_document_id: "stories-1",
    story_editor_version: 1,
    stories: [{ number: 1, text }],
  });
  it("creates a « story_serie » idea and keeps earlier versions", async () => {
    const o = { ...options(), title: "", kind: "story" as const, raw: stories("Avant") };
    const { result, rerender } = renderHook((p) => useCarouselAutosave(p), { initialProps: o });
    await settle();
    const row = [...db.rows.values()][0];
    expect(row).toMatchObject({ format: "story_serie", titre: "Mes stories", angle: "Stories" });
    expect(row.content_data.stories[0].text).toBe("Avant");
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    rerender({ ...o, raw: stories("Après") });
    await settle();
    const saved = [...db.rows.values()][0];
    expect(saved.content_data.stories[0].text).toBe("Après");
    expect(result.current.history.map((v) => v.raw.stories[0].text)).toEqual(["Avant"]);
    const update = db.ops.find((op) => op.operation === "update");
    expect(update.payload.format).toBe("story_serie");
  });
});

// Reel (13/11/2026) : enregistré tout seul, rangé en « reel », une seule fiche
// même quand on régénère le script.
describe("reel autosave", () => {
  const reel = (text: string, doc = "reel-1") => ({
    _carousel_document_id: doc,
    reel_editor_version: 1,
    sections: [{ texte_parle: text }],
  });
  it("creates one « reel » idea and keeps updating it after a regeneration", async () => {
    const o = { ...options(), title: "", kind: "reel" as const, raw: reel("Premier script") };
    const { rerender } = renderHook((p) => useCarouselAutosave(p), { initialProps: o });
    await settle();
    expect(db.rows.size).toBe(1);
    const id = o.onId.mock.calls[0][0];
    expect(db.rows.get(id)).toMatchObject({ format: "reel", titre: "Mon reel", angle: "Reel" });
    // Régénérer : nouveau document, la page a gardé la fiche (ideaId).
    rerender({ ...o, ideaId: id, raw: reel("Script régénéré", "reel-2") });
    await settle();
    expect(db.rows.size).toBe(1);
    expect(db.rows.get(id).content_data.sections[0].texte_parle).toBe("Script régénéré");
    expect(db.ops.filter((op) => op.operation === "insert")).toHaveLength(1);
  });
  it("updates the idea it was reopened from, without creating another one", async () => {
    db.rows.set("idea-reel", { id: "idea-reel", updated_at: "t0", content_data: { sections: [{ texte_parle: "Ancien" }] } });
    const o = { ...options(), kind: "reel" as const, ideaId: "idea-reel", raw: { ...reel("Repris"), _carousel_base_updated_at: "t0" } };
    renderHook((p) => useCarouselAutosave(p), { initialProps: o });
    await settle();
    expect(db.rows.size).toBe(1);
    expect(db.rows.get("idea-reel").content_data.sections[0].texte_parle).toBe("Repris");
    expect(db.ops.some((op) => op.operation === "insert")).toBe(false);
  });
});
