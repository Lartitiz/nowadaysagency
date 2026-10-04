import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyMixLayoutMemos } from "@/lib/mix-layout-memo";

const memo = { layout: "passe_partout", side: null, position: null, source: "mise_en_forme", photo_index: 2, slide_type: "photo_integrated", version: "v" };

describe("mémoire de la disposition du mixte", () => {
  it("pose la disposition sur la slide sans toucher au texte ni à la disposition confirmée", () => {
    const slides = [{ slide_number: 1, title: "Couverture" }, { slide_number: 2, title: "T", body: "B", photo_index: 2, photo_layout: "top_photo" }];
    const out = applyMixLayoutMemos(slides, [null, memo]);
    expect(out[0]).toBe(slides[0]);
    expect(out[1]).toEqual({ ...slides[1], mix_layout_memo: memo });
  });
  it("retire une mémoire devenue caduque, ignore une source inconnue, rien ne change si identique", () => {
    const slides = [{ slide_number: 1, mix_layout_memo: memo }, { slide_number: 2 }];
    expect(applyMixLayoutMemos(slides, [null, { ...memo, source: "autre" }])).toEqual([{ slide_number: 1 }, { slide_number: 2 }]);
    const same = [{ slide_number: 1, mix_layout_memo: memo }];
    expect(applyMixLayoutMemos(same, [memo])).toBe(same);
    expect(applyMixLayoutMemos(same, [memo, memo])).toBe(same);
  });
  it("la page de création garde la mémoire sur les slides du carrousel (donc sauvegardée)", () => {
    const src = readFileSync("src/pages/CreerUnifie.tsx", "utf8");
    expect(src).toMatch(/onMixLayoutMemos: \(memos, receipt\) => setResult\(/);
    expect(src).toMatch(/mix_layout_formatting: receipt/);
    expect(src).toMatch(/applyMixLayoutMemos\(slides, memos\)/);
  });
});
