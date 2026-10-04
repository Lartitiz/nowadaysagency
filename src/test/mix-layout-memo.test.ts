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
    expect(src).toMatch(/onMixLayoutMemos: \(memos, receipt, formattingMemo\) => setResult\(/);
    expect(src).toMatch(/applyMixRenderMemory\(prev\.raw, \{ memos, receipt, formattingMemo \}\)/);
    expect(src).toMatch(/raw: mergeEditorRaw\(prev\.raw, raw\)/);
  });
});

import { applyMixRenderMemory, mergeEditorRaw } from "@/lib/mix-layout-memo";
import { CarouselAutosaver, CarouselConflict, type DraftRow, type DraftStore } from "@/lib/carousel-autosave";

function memoryStore(): DraftStore & { rows: Map<string, DraftRow> } {
  const rows = new Map<string, DraftRow>();
  let tick = 0;
  const write = (id: string, raw: any): DraftRow => { const row = { id, updated_at: `t${++tick}`, content_data: raw }; rows.set(id, row); return row; };
  return {
    rows,
    read: async (id) => rows.get(id) ?? null,
    insert: async (id, raw) => write(id, raw),
    update: async (id, timestamp, raw) => rows.get(id)?.updated_at === timestamp ? write(id, raw) : null,
  };
}

describe("régénération du mixte et sauvegarde automatique", () => {
  it("la mémoire du rendu ne change rien quand elle est identique (pas de sauvegarde fantôme)", () => {
    const raw = { slides: [{ slide_number: 1 }, { slide_number: 2, mix_layout_memo: memo }], mix_layout_formatting: { status: "skipped" }, mix_formatting_memo: { fingerprint: "f" } };
    expect(applyMixRenderMemory(raw, { memos: [null, memo], receipt: { status: "skipped" }, formattingMemo: { fingerprint: "f" } })).toBe(raw);
    const next = applyMixRenderMemory(raw, { memos: [null, memo], receipt: { status: "completed" } });
    expect(next).not.toBe(raw);
    expect(next.mix_formatting_memo).toEqual({ fingerprint: "f" });
  });

  it("la copie de l'éditeur ne remet jamais un ancien reçu de sauvegarde (cause de « version plus récente »)", async () => {
    const store = memoryStore();
    const base = { _carousel_document_id: "d", carousel_editor_version: 1, slides: [{ slide_number: 1, editor_id: "a" }], caption: {} };
    // 1er enregistrement, puis l'éditeur renvoie sa copie d'AVANT ce reçu.
    const saver = new CarouselAutosaver("idea", false, base, store, () => {});
    saver.queue(base); await saver.flush();
    const current = { ...base, _carousel_cloud: saver.meta, mix_layout_formatting: { status: "completed" } };
    const editorCopy = { ...base, visual_html: [{ slide_number: 1, html: "<p>v2</p>" }] };
    // Sans fusion : le reçu périmé est gardé, la reprise suivante croit à une autre session.
    const stale = new CarouselAutosaver("idea", true, editorCopy, store, () => {});
    stale.queue({ ...editorCopy, caption: { body: "x" } });
    await expect(stale.flush()).rejects.toBeInstanceOf(CarouselConflict);
    // Avec la fusion : même reçu que le serveur, la sauvegarde passe.
    const merged: Record<string, any> = mergeEditorRaw(current, editorCopy);
    expect(merged._carousel_cloud).toEqual(saver.meta);
    expect(merged.mix_layout_formatting).toEqual({ status: "completed" });
    const resumed = new CarouselAutosaver("idea", true, merged, store, () => {});
    resumed.queue({ ...merged, caption: { body: "x" } });
    await expect(resumed.flush()).resolves.toBeUndefined();
    expect(store.rows.get("idea")!.content_data.caption.body).toBe("x");
  });

  it("la disposition mémorisée d'une slide survit à la copie de l'éditeur", () => {
    const current = { slides: [{ slide_number: 2, editor_id: "b", mix_layout_memo: memo }] };
    const fromEditor = { slides: [{ slide_number: 2, editor_id: "b", body: "édité" }] };
    expect(mergeEditorRaw(current, fromEditor).slides[0]).toEqual({ slide_number: 2, editor_id: "b", body: "édité", mix_layout_memo: memo });
  });
});
