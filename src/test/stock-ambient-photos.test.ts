import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stock-photos", () => ({ stockPhotoToPhotoItem: vi.fn() }));
import { applyStockAmbientPhotos, ownPhotos } from "@/lib/stock-ambient-photos";
import { progressionMaterial } from "../../supabase/functions/_shared/carousel-editorial-snapshot";

const stock = (id: string) => ({ id, url: `https://images.pexels.com/photos/${id}/p.jpeg`, thumbnail: "t", photographer: "Ana", source_url: "s" });
const raw = () => {
  const doc: any = {
    carousel_type: "photo",
    slides: [
      { slide_type: "photo_full", photo_index: 1, overlay_text: "Couverture", photo_match: { status: "matched" } },
      { slide_type: "photo_full", photo_index: 2, overlay_text: "Deux", photo_match: { status: "ambient_fallback" }, stock_ambient: stock("11") },
      { slide_type: "photo_full", photo_index: 1, overlay_text: "Trois", photo_match: { status: "ambient_fallback" }, stock_ambient: stock("12") },
    ],
    photo_review: { assignments: [{ slide: 2, photo: 2, status: "ambient_fallback" }] },
  };
  doc.photo_review.reviewed_material = progressionMaterial(doc);
  return doc;
};
const item = (id: string) => ({ id, base64: `data:image/jpeg;base64,${id}`, preview: "", name: id, mimeType: "image/jpeg", context: "" });

describe("photos d'ambiance libres de droit", () => {
  it("ajoute les photos après celles de l'utilisatrice et les pose sur leurs slides", async () => {
    const { raw: out, added } = await applyStockAmbientPhotos(raw(), 3, async (p) => item(p.id) as any);
    expect(added.map((p) => p.id)).toEqual(["11", "12"]);
    expect(added.every((p) => p.stockAmbient)).toBe(true);
    expect(out.slides.map((s: any) => s.photo_index)).toEqual([1, 4, 5]);
    expect(out.slides[1].cast_source).toBe("stock_ambient");
    expect(out.slides[1].photo_match.status).toBe("stock_ambient");
    expect(out.slides.some((s: any) => "stock_ambient" in s)).toBe(false);
    expect(out.photo_review.assignments[0]).toMatchObject({ photo: 4, status: "stock_ambient" });
    // Reçu ré-empreint : pas d'alerte « les photos ont changé » pour un changement automatique.
    expect(out.photo_review.reviewed_material).toBe(progressionMaterial(out));
  });

  it("un téléchargement raté garde la photo d'origine de la slide", async () => {
    const { raw: out, added } = await applyStockAmbientPhotos(raw(), 3, async (p) => {
      if (p.id === "11") throw new Error("cors");
      return item(p.id) as any;
    });
    expect(added.map((p) => p.id)).toEqual(["12"]);
    expect(out.slides.map((s: any) => s.photo_index)).toEqual([1, 2, 4]);
    expect(out.slides[1].photo_match.status).toBe("ambient_fallback");
    expect(out.slides.some((s: any) => "stock_ambient" in s)).toBe(false);
  });

  it("jamais plus de 10 photos ; sans place, les propositions sont ignorées", async () => {
    const convert = vi.fn(async (p: any) => item(p.id) as any);
    const nine = await applyStockAmbientPhotos(raw(), 9, convert);
    expect(nine.added).toHaveLength(1);
    const ten = await applyStockAmbientPhotos(raw(), 10, convert);
    expect(ten.added).toHaveLength(0);
    expect(ten.raw.slides.map((s: any) => s.photo_index)).toEqual([1, 2, 1]);
    expect(ten.raw.slides.some((s: any) => "stock_ambient" in s)).toBe(false);
  });

  it("une URL hors Pexels n'est jamais téléchargée", async () => {
    const doc = raw();
    doc.slides[1].stock_ambient.url = "https://exemple.test/x.jpg";
    const convert = vi.fn(async (p: any) => item(p.id) as any);
    const { added } = await applyStockAmbientPhotos(doc, 3, convert);
    expect(convert).toHaveBeenCalledTimes(1);
    expect(added.map((p) => p.id)).toEqual(["12"]);
  });

  it("les photos posées par l'app ne repartent pas comme celles de l'utilisatrice", () => {
    expect(ownPhotos([{ id: "a" }, { id: "b", stockAmbient: true }, { id: "c" }] as any[]).map((p) => p.id)).toEqual(["a", "c"]);
  });
});
