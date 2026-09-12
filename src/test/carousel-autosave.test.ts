import { describe, expect, it, vi } from "vitest";
import {
  CarouselAutosaver,
  CarouselConflict,
  cleanCarouselSnapshot,
  type DraftRow,
  type DraftStore,
} from "@/lib/carousel-autosave";

function fixture(initial: DraftRow | null = null) {
  let row = initial;
  let tick = 0;
  const commit = (id: string, raw: any) =>
    (row = {
      id,
      updated_at: new Date(1_800_000_000_000 + ++tick).toISOString(),
      content_data: structuredClone(raw),
    });
  const store: DraftStore = {
    read: vi.fn(async () => row && structuredClone(row)),
    insert: vi.fn(async (id, raw) => {
      if (row) throw new Error("duplicate");
      return commit(id, raw);
    }),
    update: vi.fn(async (id, timestamp, raw) =>
      row?.updated_at === timestamp ? commit(id, raw) : null,
    ),
  };
  const saved = vi.fn();
  const baseline = initial?.content_data || {};
  const saver = new CarouselAutosaver(
    "idea-1",
    !!initial,
    baseline,
    store,
    saved,
  );
  const snapshot = (text: string) => ({
    carousel_editor_version: 1,
    _carousel_document_id: "doc-1",
    caption: { body: text },
    slides: [{ title: text }],
    visual_html: [{ slide_number: 1, html: `<p>${text}</p>` }],
  });
  return {
    store,
    saver,
    saved,
    snapshot,
    getRow: () => row!,
    external: (raw: any) => commit("idea-1", raw),
  };
}
describe("automatic carousel account saving", () => {
  it.each([false, true])(
    "recovers an uncertain %s write even when the immediate verification also fails",
    async (update) => {
      const f = fixture();
      if (update) {
        f.saver.queue(f.snapshot("Before"));
        await f.saver.flush();
      }
      const originalWrite = update ? f.store.update : f.store.insert;
      const originalRead = f.store.read;
      let responseLost = false;
      if (update)
        f.store.update = vi.fn(async (id, time, raw) => {
          await (originalWrite as DraftStore["update"])(id, time, raw);
          responseLost = true;
          throw new Error("lost");
        });
      else
        f.store.insert = vi.fn(async (id, raw) => {
          await (originalWrite as DraftStore["insert"])(id, raw);
          responseLost = true;
          throw new Error("lost");
        });
      f.store.read = vi.fn(async (id) => {
        if (responseLost) {
          responseLost = false;
          throw new Error("still offline");
        }
        return originalRead(id);
      });
      f.saver.queue(f.snapshot("After"));
      await expect(f.saver.flush()).rejects.toThrow("lost");
      await f.saver.flush();
      expect(f.saver.dirty).toBe(false);
      expect(f.getRow().content_data.caption.body).toBe("After");
    },
  );
  it("inserts once, updates that same idea and saves canonical HTML, text and caption", async () => {
    const f = fixture();
    f.saver.queue(f.snapshot("A"));
    await f.saver.flush();
    f.saver.queue(f.snapshot("B"));
    await f.saver.flush();
    expect(f.store.insert).toHaveBeenCalledTimes(1);
    expect(f.store.update).toHaveBeenCalledTimes(1);
    expect(f.getRow().content_data.visual_html[0].html).toBe("<p>B</p>");
    expect(f.getRow().content_data.caption.body).toBe("B");
    expect(f.saver.dirty).toBe(false);
  });
  it("does not resave a metadata echo or unchanged document", async () => {
    const f = fixture();
    f.saver.queue(f.snapshot("A"));
    await f.saver.flush();
    f.saver.queue({ ...f.snapshot("A"), _carousel_cloud: f.saver.meta });
    await f.saver.flush();
    expect(f.store.update).not.toHaveBeenCalled();
  });
  it("queues the newest edit behind an in-flight request, without parallel writes", async () => {
    const f = fixture();
    const original = f.store.insert;
    let release!: () => void;
    f.store.insert = vi.fn(async (id, raw) => {
      await new Promise<void>((r) => (release = r));
      return original(id, raw);
    });
    f.saver.queue(f.snapshot("A"));
    const first = f.saver.flush();
    await Promise.resolve();
    f.saver.queue(f.snapshot("B"));
    f.saver.queue(f.snapshot("C"));
    expect(f.saver.flush()).toBe(first);
    release();
    await first;
    expect(f.getRow().content_data.caption.body).toBe("C");
    expect(f.store.update).toHaveBeenCalledTimes(1);
  });
  it("retains edits after failure and retries the same reserved ID", async () => {
    const f = fixture();
    const original = f.store.insert;
    f.store.insert = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(original);
    f.saver.queue(f.snapshot("A"));
    await expect(f.saver.flush()).rejects.toThrow("offline");
    expect(f.saver.dirty).toBe(true);
    expect(f.saved).not.toHaveBeenCalled();
    await f.saver.flush();
    expect(f.getRow().id).toBe("idea-1");
  });
  it("recognises a committed write whose response was lost", async () => {
    const f = fixture();
    const original = f.store.insert;
    f.store.insert = vi.fn(async (id, raw) => {
      await original(id, raw);
      throw new Error("response lost");
    });
    f.saver.queue(f.snapshot("A"));
    await f.saver.flush();
    expect(f.saver.dirty).toBe(false);
    expect(f.store.insert).toHaveBeenCalledTimes(1);
  });
  it("rejects a newer server revision on reopening, even on repeated retries", async () => {
    const f = fixture();
    f.external({ _carousel_cloud: { revision: "newer", history: [] } });
    f.saver.queue(f.snapshot("A"));
    await expect(f.saver.flush()).rejects.toBeInstanceOf(CarouselConflict);
    await expect(f.saver.flush()).rejects.toBeInstanceOf(CarouselConflict);
    expect(f.store.update).not.toHaveBeenCalled();
  });
  it("rejects a concurrent write after the initial load via timestamp compare-and-set", async () => {
    const f = fixture();
    f.saver.queue(f.snapshot("A"));
    await f.saver.flush();
    f.external({
      ...f.snapshot("Other device"),
      _carousel_cloud: { revision: "other" },
    });
    f.saver.queue(f.snapshot("B"));
    await expect(f.saver.flush()).rejects.toBeInstanceOf(CarouselConflict);
    expect(f.getRow().content_data.caption.body).toBe("Other device");
    expect(f.saver.dirty).toBe(true);
  });
  it("does not recreate an inaccessible or deleted existing idea", async () => {
    const f = fixture();
    const c = new CarouselAutosaver("deleted", true, {}, f.store, vi.fn());
    c.queue(f.snapshot("A"));
    await expect(c.flush()).rejects.toThrow("accessible");
    expect(f.store.insert).not.toHaveBeenCalled();
  });
  it("guards legacy drafts with their original database timestamp", async () => {
    const f = fixture({ id: "idea-1", updated_at: "new", content_data: {} });
    const c = new CarouselAutosaver(
      "idea-1",
      true,
      { _carousel_base_updated_at: "old" },
      f.store,
      vi.fn(),
    );
    c.queue(f.snapshot("A"));
    await expect(c.flush()).rejects.toBeInstanceOf(CarouselConflict);
  });
  it("keeps bounded nonrecursive history and checkpoints the version before restoration", async () => {
    const f = fixture();
    for (const text of ["A", "B", "C", "D", "E"]) {
      f.saver.checkpoint();
      f.saver.queue(f.snapshot(text));
      await f.saver.flush();
    }
    expect(f.saver.meta?.history).toHaveLength(3);
    expect(f.saver.meta?.history.map((v) => v.raw.caption.body)).toEqual([
      "D",
      "C",
      "B",
    ]);
    expect(f.saver.meta?.history[0].raw._carousel_cloud).toBeUndefined();
    const past = f.saver.meta!.history[2].raw;
    f.saver.checkpoint();
    f.saver.queue(past);
    await f.saver.flush();
    expect(f.saver.meta?.history[0].raw.caption.body).toBe("E");
    expect(f.getRow().content_data.caption.body).toBe("B");
  });
  it("drops oversized historical copies without truncating the current document", async () => {
    const f = fixture();
    f.saver.queue(f.snapshot("x".repeat(3_000_000)));
    await f.saver.flush();
    f.saver.queue(f.snapshot("B"));
    await f.saver.flush();
    expect(f.saver.meta?.history).toHaveLength(0);
    expect(f.getRow().content_data.caption.body).toBe("B");
  });
  it("finishes navigation saves without calling into an unmounted editor", async () => {
    const f = fixture();
    f.saver.queue(f.snapshot("A"));
    f.saver.detach();
    await f.saver.flush();
    expect(f.getRow().content_data.caption.body).toBe("A");
    expect(f.saved).not.toHaveBeenCalled();
  });
  it("strips only cloud bookkeeping, retaining all editing data", () => {
    expect(
      cleanCarouselSnapshot({
        _carousel_cloud: {},
        _carousel_base_updated_at: "x",
        _carousel_document_id: "d",
        visual_html: [1],
      }),
    ).toEqual({ _carousel_document_id: "d", visual_html: [1] });
  });
});
