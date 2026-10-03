// Grouper / dégrouper, verrouiller un élément, éléments tout faits (03/10/2026).
import { describe, expect, it } from "vitest";
import {
  addPreset,
  duplicateElement,
  getEditorElements,
  groupElements,
  listLayers,
  makeSlide,
  PRESETS,
  setLayerLocked,
  ungroupElement,
} from "@/lib/carousel-editor";

const dom = (html: string) => new DOMParser().parseFromString(html, "text/html");
const base = () => makeSlide({ title: "Titre", body: "Corps" }, "text_only");

describe("group / ungroup", () => {
  it("wraps elements in a group at the same visible place, then puts them back", () => {
    const slide = base();
    const [title, body] = ["title", "body"].map((f) => getEditorElements(slide.html).find((e) => e.field === f)!);
    const rects = { [title.id]: { left: 80, top: 160, width: 920, height: 80 }, [body.id]: { left: 80, top: 280, width: 920, height: 60 } };
    const g = groupElements(slide, [title, body].map((e) => ({ id: e.id, rect: rects[e.id] })));
    expect(g.id).toBeTruthy();
    const doc = dom(g.slide.html);
    const group = doc.querySelector<HTMLElement>(`[data-editor-id="${g.id}"]`)!;
    expect(group.getAttribute("data-editor-shape")).toBe("groupe");
    expect(group.style.left).toBe("80px");
    expect(group.style.top).toBe("160px");
    const t = group.querySelector<HTMLElement>(`[data-editor-id="${title.id}"]`)!;
    const b = group.querySelector<HTMLElement>(`[data-editor-id="${body.id}"]`)!;
    expect([t.style.left, t.style.top, b.style.top]).toEqual(["0px", "0px", "120px"]);
    expect(listLayers(g.slide.html).find((l) => l.id === g.id)!.label).toBe("Groupe");
    // Le texte source reste lié (titre, corps).
    expect(getEditorElements(g.slide.html).find((e) => e.field === "title")).toBeTruthy();
    // Dégrouper après avoir déplacé le groupe : chaque élément garde sa place visible.
    const back = ungroupElement(g.slide, g.id!, { [title.id]: { left: 180, top: 460, width: 920, height: 80 }, [body.id]: { left: 180, top: 580, width: 920, height: 60 } });
    expect(back.ids.sort()).toEqual([title.id, body.id].sort());
    const d2 = dom(back.slide.html);
    expect(d2.querySelector('[data-editor-shape="groupe"]')).toBeNull();
    expect(d2.querySelector<HTMLElement>(`[data-editor-id="${body.id}"]`)!.style.top).toBe("580px");
  });
  it("needs at least two elements", () => {
    const slide = base();
    const title = getEditorElements(slide.html).find((e) => e.field === "title")!;
    expect(groupElements(slide, [{ id: title.id, rect: { left: 0, top: 0, width: 10, height: 10 } }]).id).toBeNull();
  });
});

describe("lock one element", () => {
  it("marks it locked in the layers, and a duplicate is not locked", () => {
    const slide = base();
    const title = getEditorElements(slide.html).find((e) => e.field === "title")!;
    const locked = setLayerLocked(slide, title.id, true);
    expect(listLayers(locked.html).find((l) => l.id === title.id)!.locked).toBe(true);
    const copy = duplicateElement(locked, title.id);
    expect(dom(copy.slide.html).querySelector(`[data-editor-id="${copy.id}"]`)!.hasAttribute("data-editor-locked")).toBe(false);
    expect(listLayers(setLayerLocked(locked, title.id, false).html).find((l) => l.id === title.id)!.locked).toBe(false);
  });
});

describe("ready-made elements", () => {
  it("adds every preset in the brand colour, as an editable layer", () => {
    for (const { kind } of PRESETS) {
      const out = addPreset(base(), kind, "#91014b");
      expect(out.id, kind).toBeTruthy();
      const el = dom(out.slide.html).querySelector<HTMLElement>(`[data-editor-id="${out.id}"]`)!;
      expect(el.getAttribute("style"), kind).toMatch(/#91014b|rgb\(145, 1, 75\)/i);
      expect(out.slide.html).not.toContain("data-editor-new");
    }
  });
});
