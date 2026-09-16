import { describe, expect, it } from "vitest";
import { editHistoryShortcut } from "@/lib/edit-history-shortcut";
const key = { key: "z", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
describe("editor keyboard shortcuts", () => {
  it("recognizes both platforms and redo variants", () => {
    expect(editHistoryShortcut({ ...key, metaKey: true })).toBe("undo");
    expect(editHistoryShortcut({ ...key, ctrlKey: true })).toBe("undo");
    expect(editHistoryShortcut({ ...key, key: "Z", shiftKey: true, metaKey: true })).toBe("redo");
    expect(editHistoryShortcut({ ...key, key: "y", ctrlKey: true })).toBe("redo");
  });
  it("leaves ordinary typing, IME and unrelated shortcuts alone", () => {
    for (const patch of [{}, { metaKey: true, altKey: true }, { metaKey: true, isComposing: true }, { metaKey: true, defaultPrevented: true }, { metaKey: true, key: "y" }, { ctrlKey: true, key: "s" }]) {
      expect(editHistoryShortcut({ ...key, ...patch })).toBeNull();
    }
  });
});
