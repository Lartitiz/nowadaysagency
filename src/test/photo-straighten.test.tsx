import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { cleanRecipe, cleanRotation, formatDegrees, makePhotoRecipe, photoGeometry, renderPhotoComposition, straightenedSize } from "@/lib/photo-composition";
import { parsePreparation, serialisePreparation } from "@/lib/photo-workflows";
import { PhotoCompositionControls } from "@/components/photos/PhotoCompositionControls";

/** A point of the straightened frame, turned back into the original photo, must stay inside the photo. */
function cornersInsideOriginal(w: number, h: number, deg: number) {
  const { width, height } = straightenedSize(w, h, deg);
  const a = deg * Math.PI / 180;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([sx, sy]) => {
    const x = sx * width / 2, y = sy * height / 2;
    const ox = x * Math.cos(a) + y * Math.sin(a), oy = -x * Math.sin(a) + y * Math.cos(a);
    return Math.abs(ox) <= w / 2 && Math.abs(oy) <= h / 2;
  });
}

describe("Redresser une photo", () => {
  afterEach(() => vi.restoreAllMocks());

  it("never leaves an empty corner, whatever the shape of the photo and the angle", () => {
    for (const [w, h] of [[3024, 4032], [4032, 3024], [2000, 2000], [1600, 600], [500, 4000]]) {
      for (const deg of [-10, -7.3, -2, -0.1, 0.1, 1.5, 4, 10]) {
        expect(cornersInsideOriginal(w, h, deg), `${w}×${h} à ${deg}°`).toBe(true);
        const s = straightenedSize(w, h, deg);
        expect(s.width / s.height).toBeCloseTo(w / h, 1);
      }
    }
  });

  it("keeps as much of the photo as possible (a small tilt barely crops)", () => {
    const s = straightenedSize(3024, 4032, 2);
    expect(s.width).toBeGreaterThan(3024 * 0.9);
    expect(straightenedSize(3024, 4032, 0)).toEqual({ width: 3024, height: 4032, scale: 1 });
  });

  it("bounds the angle to ±10° and ignores invalid values", () => {
    expect(cleanRotation(25)).toBe(10); expect(cleanRotation(-40)).toBe(-10);
    expect(cleanRotation(2.345)).toBe(2.3); expect(cleanRotation(NaN)).toBe(0); expect(cleanRotation("3")).toBe(0);
    expect(cleanRecipe({ ...makePhotoRecipe("post"), rotation: 0 })).not.toHaveProperty("rotation");
    expect(cleanRecipe({ ...makePhotoRecipe("post"), rotation: -3.5 }).rotation).toBe(-3.5);
  });

  it("keeps the rotation when a preparation is saved then reopened", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const output = { id, photoId: id, postId: id, sourceIndex: 0, label: "Post", caption: "", date: "", enabled: true, approved: false,
      recipe: { ...makePhotoRecipe("post"), rotation: 4.2 } };
    const saved = JSON.parse(JSON.stringify(serialisePreparation([{ id: "s", name: "Photo", photoId: id, dataUrl: "" } as never], [output as never], {})));
    expect(parsePreparation(saved).outputs[0].recipe.rotation).toBe(4.2);
  });

  it("frames the straightened photo, never pixels outside it", () => {
    const recipe = { ...makePhotoRecipe("story"), rotation: 6 };
    const s = straightenedSize(4032, 3024, 6);
    const g = photoGeometry(4032, 3024, recipe);
    expect(g.source.x).toBeGreaterThanOrEqual(0); expect(g.source.y).toBeGreaterThanOrEqual(0);
    expect(g.source.x + g.source.width).toBeLessThanOrEqual(s.width + 1e-6);
    expect(g.source.y + g.source.height).toBeLessThanOrEqual(s.height + 1e-6);
  });

  it("turns the photo in the rendered file (preview, download and saved copy share this path)", async () => {
    const calls: { canvas: HTMLCanvasElement; rotate: number[] }[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = realCreate(tag);
      if (tag !== "canvas") return el;
      const record = { canvas: el as HTMLCanvasElement, rotate: [] as number[] }; calls.push(record);
      const ctx = { fillRect: vi.fn(), drawImage: vi.fn(), translate: vi.fn(), rotate: (r: number) => record.rotate.push(r),
        set fillStyle(_v: string) {}, imageSmoothingQuality: "low" };
      (el as HTMLCanvasElement).getContext = (() => ctx) as never;
      (el as HTMLCanvasElement).toDataURL = () => "data:image/png;base64,ok";
      return el;
    }) as never);
    const image = { naturalWidth: 3024, naturalHeight: 4032 } as HTMLImageElement;
    await renderPhotoComposition(image, { ...makePhotoRecipe("post"), rotation: -3 });
    const turned = calls.find(c => c.rotate.length);
    expect(turned?.rotate[0]).toBeCloseTo(-3 * Math.PI / 180);
    const size = straightenedSize(3024, 4032, -3);
    expect([turned!.canvas.width, turned!.canvas.height]).toEqual([size.width, size.height]);
    calls.length = 0;
    await renderPhotoComposition(image, makePhotoRecipe("post"));
    expect(calls.some(c => c.rotate.length)).toBe(false);
  });

  it("offers a slider with a live value and a reset button", () => {
    const onChange = vi.fn();
    const { rerender } = render(<PhotoCompositionControls recipe={makePhotoRecipe("post")} onChange={onChange} />);
    expect(screen.getByText("Droite")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Annuler le redressement" })).toBeNull();
    fireEvent.change(screen.getByLabelText(/Redresser/), { target: { value: "-2.5" } });
    expect(onChange.mock.calls.at(-1)[0].rotation).toBe(-2.5);
    rerender(<PhotoCompositionControls recipe={{ ...makePhotoRecipe("post"), rotation: -2.5 }} onChange={onChange} />);
    expect(screen.getByText("−2,5°")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Annuler le redressement" }));
    expect(onChange.mock.calls.at(-1)[0]).not.toHaveProperty("rotation");
    expect(formatDegrees(4)).toBe("4°");
  });
});
