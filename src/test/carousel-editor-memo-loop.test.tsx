// Boucle infinie vue en ligne le 04/10/2026 : un carrousel mixte avec des
// dispositions mémorisées figeait la page. mergeEditorRaw recréait la liste des
// slides à chaque écho de l'éditeur ; l'éditeur, qui reconnaît son écho à la
// RÉFÉRENCE de cette liste, relisait et réémettait sans fin.
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { mergeEditorRaw } from "@/lib/mix-layout-memo";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(cleanup);

const memo = { layout: "passe_partout", side: null, position: null, source: "mise_en_forme", photo_index: 1, slide_type: "photo_integrated", version: "v" };
const raw = {
  carousel_editor_version: 1,
  slides: [
    { slide_number: 1, title: "Couverture", editor_id: "a" },
    { slide_number: 2, body: "Corps", editor_id: "b", mix_layout_memo: memo },
  ],
  caption: { body: "L" },
  mix_layout_formatting: { status: "skipped" },
};
const visuals = [
  { slide_number: 1, html: '<div><h1 data-slide-text="title">Couverture</h1></div>' },
  { slide_number: 2, html: '<div><p data-slide-text="body">Corps</p></div>' },
];

describe("éditeur + mémoire des dispositions du mixte", () => {
  it("l'écho de l'éditeur fusionné par mergeEditorRaw ne relance pas l'éditeur (pas de boucle)", async () => {
    let changes = 0;
    function Parent() {
      const [r, setR] = useState<any>(raw), [v, setV] = useState(visuals);
      return <CarouselEditor result={r} visualSlides={v} onChange={(next, vis) => {
        changes += 1;
        if (changes > 50) throw new Error("boucle infinie");
        setR((prev: any) => mergeEditorRaw(prev, next));
        setV(vis);
      }} />;
    }
    await act(async () => { render(<Parent />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(changes).toBeLessThanOrEqual(2);
  });

  it("mergeEditorRaw garde la même liste de slides quand toutes ont déjà leur mémoire", () => {
    const fromEditor = { slides: [{ slide_number: 2, editor_id: "b", mix_layout_memo: memo }] };
    const merged = mergeEditorRaw({ slides: [{ slide_number: 2, editor_id: "b", mix_layout_memo: memo }] }, fromEditor);
    expect(merged.slides).toBe(fromEditor.slides);
  });
});
