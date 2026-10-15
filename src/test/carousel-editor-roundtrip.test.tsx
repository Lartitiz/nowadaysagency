// Lot E2 (14/10/2026) : on fige le comportement de l'éditeur avant son découpage.
// Aller-retour complet, branché comme dans CreerUnifie.tsx :
//   readCarouselDocument → retouches (texte, style, photo, verrou)
//   → documentOutput → mergeEditorRaw (onCarouselDocumentChange) → relecture.
// La relecture doit rendre le MÊME carrousel, et l'écho de l'éditeur ne doit
// jamais le relancer (boucle infinie corrigée par le commit ec445582).
import React, { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import {
  captionFromText,
  documentOutput,
  getEditorElements,
  patchElement,
  readCarouselDocument,
  replacePhoto,
  setLayerLocked,
  type CarouselDocument,
} from "@/lib/carousel-editor";
import { mergeEditorRaw } from "@/lib/mix-layout-memo";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/components/creer/PhotoSwapDialog", () => ({
  default: ({ onSelect }: any) => (
    <button onClick={() => onSelect({ name: "Nouvelle", base64: "data:image/jpeg;base64,NEW", preview: "data:image/jpeg;base64,NEW", mimeType: "image/jpeg" })}>
      Choisir la nouvelle photo
    </button>
  ),
}));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
beforeEach(() => {
  window.localStorage.setItem("carousel-panel:Calques", "1");
  window.localStorage.setItem("carousel-editor:mode", "complet"); // panneau complet (« Plus d'outils »), chantier D
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const RECEIPT_1 = { id: "carrousel-1", updated_at: "2026-10-14T10:00:00Z" };
const RECEIPT_2 = { id: "carrousel-1", updated_at: "2026-10-14T10:05:00Z" };
const raw = {
  slides: [
    { slide_number: 1, title: "Mon atelier", body: "Tout commence ici.", photo_index: 1 },
    { slide_number: 2, title: "La suite", body: "Une autre idée" },
  ],
  caption: { hook: "Accroche", body: "Une légende", hashtags: ["atelier"] },
  _carousel_cloud: RECEIPT_1,
  _carousel_base_updated_at: RECEIPT_1.updated_at,
};
const visuals = [
  {
    slide_number: 1,
    html:
      '<div style="position:relative;width:1080px;height:1350px;background-color:#fff4f8">' +
      '<div data-pptx-photo="1" style="position:absolute;left:0;top:0;width:1080px;height:600px;background-image:url(&quot;https://example.com/old.jpg&quot;);background-size:cover"></div>' +
      '<h1 data-slide-text="title" data-pptx-editable="title" style="position:absolute;left:80px;top:700px;color:#91014b">Mon atelier</h1>' +
      '<p data-slide-text="body" data-pptx-editable="body" style="position:absolute;left:80px;top:900px">Tout commence ici.</p></div>',
  },
  {
    slide_number: 2,
    html: '<div style="position:relative;width:1080px;height:1350px"><h1 data-slide-text="title" data-pptx-editable="title">La suite</h1><p data-slide-text="body" data-pptx-editable="body">Une autre idée</p></div>',
  },
];

/** Même branchement que CreerUnifie.tsx (onCarouselDocumentChange). */
function Parent({ start, log, api }: { start: { result: any; visuals: any[] }; log: { raw: any; visuals: any[] }[]; api?: { setResult?: (f: (r: any) => any) => void } }) {
  const [result, setResult] = useState<any>(start.result);
  const [visualSlides, setVisualSlides] = useState(start.visuals);
  if (api) api.setResult = setResult;
  return (
    <>
      <output data-testid="saved">{JSON.stringify({ raw: result.raw, visuals: visualSlides })}</output>
      <CarouselEditor
        result={result}
        visualSlides={visualSlides}
        photos={[]}
        onAddPhoto={() => 2}
        onChange={(next, vis) => {
          log.push({ raw: next, visuals: vis });
          if (log.length > 50) throw new Error("boucle infinie");
          setResult((prev: any) => (prev ? { ...prev, raw: mergeEditorRaw(prev.raw, next) } : prev));
          setVisualSlides(vis);
        }}
      />
    </>
  );
}
const saved = () => JSON.parse(screen.getByTestId("saved").textContent!);
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
// À la relecture, les données d'une slide portent aussi editor_id / editor_locked
// (recopiés de la sortie, réécrits à chaque sortie : sans effet). On les écarte.
const comparable = (doc: CarouselDocument) =>
  doc.slides.map((s) => {
    const { editor_id, editor_locked, ...data } = s.data;
    return { id: s.id, locked: !!s.locked, html: s.html, data };
  });

describe("aller-retour complet par les fonctions de l'éditeur", () => {
  const edited = () => {
    const doc = readCarouselDocument(raw, visuals);
    const [first, second] = doc.slides;
    const els = getEditorElements(first.html);
    const title = els.find((e) => e.field === "title")!;
    const body = els.find((e) => e.field === "body")!;
    const photo = els.find((e) => e.kind === "photo")!;
    let s = patchElement(first, title.id, { text: "Notre atelier" });
    s = patchElement(s, title.id, { styles: { color: "#fb3d80", "text-align": "center", left: "120px" } });
    s = replacePhoto(s, photo.id, "data:image/jpeg;base64,NEW", 2);
    s = setLayerLocked(s, body.id, true);
    return { ...doc, slides: [s, { ...second, locked: true }], caption: captionFromText("Accroche\n\nLégende retouchée\n\n#atelier #ceramique") };
  };
  it("la relecture après fusion rend exactement le même carrousel", () => {
    const doc = edited();
    const out = documentOutput(doc, raw);
    const merged = mergeEditorRaw(raw, out.raw);
    const reread = readCarouselDocument(merged, out.visualSlides);
    expect(comparable(reread)).toEqual(comparable(doc));
    expect(reread.caption).toEqual(doc.caption);
    // Le texte retouché, la photo, le verrou de calque et de slide sont là.
    expect(reread.slides[0].data.title).toBe("Notre atelier");
    expect(reread.slides[0].data.photo_index).toBe(2);
    expect(reread.slides[0].html).toContain("data-editor-locked");
    expect(reread.slides[1].locked).toBe(true);
  });
  it("le reçu de sauvegarde reste celui du carrousel courant, pas la copie de l'éditeur", () => {
    const out = documentOutput(edited(), raw);
    const merged = mergeEditorRaw({ ...raw, _carousel_cloud: RECEIPT_2, _carousel_base_updated_at: RECEIPT_2.updated_at }, out.raw);
    expect(merged._carousel_cloud).toEqual(RECEIPT_2);
    expect(merged._carousel_base_updated_at).toBe(RECEIPT_2.updated_at);
  });
  it("réenregistrer sans retouche donne une sortie identique (point fixe)", () => {
    const out = documentOutput(edited(), raw);
    const merged = mergeEditorRaw(raw, out.raw);
    const again = documentOutput(readCarouselDocument(merged, out.visualSlides), merged);
    expect(again.visualSlides).toEqual(out.visualSlides);
    expect(again.raw.slides).toEqual(out.raw.slides);
    expect(again.raw.caption).toEqual(out.raw.caption);
    expect(again.raw._carousel_document_id).toBe(out.raw._carousel_document_id);
  });
  it("un carrousel déjà passé par l'éditeur n'est pas « réparé » à la relecture", () => {
    // Le HTML de l'éditeur fait foi : un texte des données différent ne l'écrase pas.
    const out = documentOutput(edited(), raw);
    const tampered = { ...out.raw, slides: out.raw.slides.map((s: any, i: number) => (i === 0 ? { ...s, title: "Ancien titre" } : s)) };
    const reread = readCarouselDocument(tampered, out.visualSlides);
    expect(reread.slides[0].html).toContain("Notre atelier");
    expect(reread.slides[0].html).not.toContain("Ancien titre");
  });
});

describe("aller-retour complet dans l'éditeur, branché comme /creer", () => {
  it("chaque retouche émet une seule fois, sans écho ni boucle, puis la réouverture rend le même carrousel", async () => {
    const log: { raw: any; visuals: any[] }[] = [];
    const api: { setResult?: (f: (r: any) => any) => void } = {};
    const view = render(<Parent start={{ result: { raw, format: "carousel" }, visuals }} log={log} api={api} />);
    await settle();
    // À l'ouverture : une seule émission (le carrousel lu et normalisé).
    expect(log.length).toBe(1);

    fireEvent.click(screen.getByLabelText(/Choisir le calque Mon atelier/));
    fireEvent.change(screen.getByLabelText("Texte sélectionné"), { target: { value: "Notre atelier" } });
    await settle();
    expect(log.length).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "Centré" }));
    await settle();
    expect(log.length).toBe(3);

    fireEvent.click(screen.getByRole("tab", { name: "Slide" }));
    fireEvent.click(screen.getByText("Ajouter / changer la photo"));
    fireEvent.click(screen.getByText("Choisir la nouvelle photo"));
    await settle();
    expect(log.length).toBe(4);

    // Une sauvegarde automatique se termine : nouveau reçu, mêmes slides.
    act(() => api.setResult!((prev) => ({ ...prev, raw: { ...prev.raw, _carousel_cloud: RECEIPT_2, _carousel_base_updated_at: RECEIPT_2.updated_at } })));
    await settle();
    // L'éditeur ne relit pas (pas d'émission) et garde son historique.
    expect(log.length).toBe(4);
    expect((screen.getByLabelText("Annuler la modification") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByText("Verrouiller").closest("button")!);
    await settle();
    expect(log.length).toBe(5);
    // La copie de l'éditeur porte l'ancien reçu ; le carrousel courant garde le nouveau.
    expect(saved().raw._carousel_cloud).toEqual(RECEIPT_2);

    const final = saved();
    const first = new DOMParser().parseFromString(final.visuals[0].html, "text/html");
    expect(first.querySelector<HTMLElement>('[data-slide-text="title"]')!.textContent).toBe("Notre atelier");
    expect(first.querySelector<HTMLElement>('[data-slide-text="title"]')!.style.textAlign).toBe("center");
    expect(first.querySelector<HTMLElement>("[data-pptx-photo]")!.style.backgroundImage).toContain("NEW");
    expect(final.raw.slides[0]).toMatchObject({ title: "Notre atelier", photo_index: 2, editor_locked: true });
    expect(final.raw.carousel_editor_version).toBe(1);

    // Réouverture (autre session) : l'éditeur relit et rend exactement la même chose.
    view.unmount();
    const reopen: { raw: any; visuals: any[] }[] = [];
    render(<Parent start={{ result: { raw: final.raw, format: "carousel" }, visuals: final.visuals }} log={reopen} />);
    await settle();
    expect(reopen.length).toBe(1);
    expect(reopen[0].visuals).toEqual(final.visuals);
    expect(reopen[0].raw.slides).toEqual(final.raw.slides);
    expect(reopen[0].raw.caption).toEqual(final.raw.caption);
    expect(reopen[0].raw._carousel_document_id).toBe(final.raw._carousel_document_id);
    expect(screen.getByText("Déverrouiller")).toBeTruthy();
  });

  it("un nouveau carrousel venu d'ailleurs (régénération) est relu une fois et vide l'historique", async () => {
    const log: { raw: any; visuals: any[] }[] = [];
    function Regenerating() {
      const [result, setResult] = useState<any>({ raw });
      const [vis, setVis] = useState(visuals);
      return (
        <>
          <button onClick={() => { setResult({ raw: { ...raw, slides: [{ slide_number: 1, title: "Tout neuf" }] } }); setVis([{ slide_number: 1, html: '<div><h1 data-slide-text="title">Tout neuf</h1></div>' }]); }}>
            Régénérer
          </button>
          <CarouselEditor result={result} visualSlides={vis} onChange={(next, v) => {
            log.push({ raw: next, visuals: v });
            if (log.length > 50) throw new Error("boucle infinie");
            setResult((prev: any) => ({ ...prev, raw: mergeEditorRaw(prev.raw, next) }));
            setVis(v);
          }} />
        </>
      );
    }
    render(<Regenerating />);
    await settle();
    fireEvent.click(screen.getByLabelText(/Choisir le calque Mon atelier/));
    fireEvent.change(screen.getByLabelText("Texte sélectionné"), { target: { value: "Retouché" } });
    await settle();
    const before = log.length;
    expect((screen.getByLabelText("Annuler la modification") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByText("Régénérer"));
    await settle();
    expect(log.length).toBe(before + 1);
    expect(log[log.length - 1].visuals).toHaveLength(1);
    expect(log[log.length - 1].visuals[0].html).toContain("Tout neuf");
    expect((screen.getByLabelText("Annuler la modification") as HTMLButtonElement).disabled).toBe(true);
  });
});
