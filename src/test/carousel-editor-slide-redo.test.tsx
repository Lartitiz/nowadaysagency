// « Refaire cette slide » (chantier AA, 18/10/2026) dans le vrai éditeur :
// refaire la slide 3 d'un carrousel de 14, les 13 autres restent identiques
// (HTML octet pour octet, texte compris), « Garder la nouvelle » est une étape
// d'Annuler, « Garder la mienne » ne change rien, une slide verrouillée ne se
// refait pas, une erreur ne touche à rien. La slide refaite garde ses zones
// PowerPoint (data-pptx-editable) et sa photo d'origine.
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { buildSlideRedoBody, collectSlidePhotos, slideFromRedo, type SlideRedoApi } from "@/components/creer/CarouselEditorParts/slide-redo";
import { getEditorElements, readCarouselDocument } from "@/lib/carousel-editor";
import { blockFromElement } from "@/lib/export-carousel-hybrid/text-blocks";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const slideHtml = (n: number, title: string) => `<div style="position:relative;width:1080px;height:1350px;background:#fff4f8"><h1 data-slide-text="title" data-pptx-editable="title" style="color:#91014b">${title}</h1><p data-slide-text="body" data-pptx-editable="body">Texte de la slide ${n}</p></div>`;
const raw = {
  carousel_type: "text",
  slides: Array.from({ length: 14 }, (_, i) => ({ slide_number: i + 1, role: i === 0 ? "hook" : "body", title: `Titre ${i + 1}`, body: `Texte de la slide ${i + 1}` })),
  caption: { body: "Ma légende" },
};
const visuals = raw.slides.map((s) => ({ slide_number: s.slide_number, html: slideHtml(s.slide_number, s.title) }));
const NEW_HTML = '<div style="position:relative;width:1080px;height:1350px;background:#fff4f8"><h1 data-slide-text="title" data-pptx-editable="title">Trois passages</h1><div data-pptx-shape="card"><p data-pptx-editable="schema_step_1">Tournage</p><p data-pptx-editable="schema_step_2">Tournassage</p><p data-pptx-editable="schema_step_3">Émaillage</p></div></div>';

function fakeApi(over: Partial<SlideRedoApi> = {}): SlideRedoApi & { calls: Record<string, any>[] } {
  const calls: Record<string, any>[] = [];
  return {
    calls,
    remainingLabel: "Il te reste 22 crédits ce mois-ci.",
    loadPhoto: async (src) => ({ base64: src, mimeType: "image/jpeg" }),
    request: vi.fn(async (body) => {
      calls.push(body);
      return { data: { slide: { ...body.slides[2], title: "Trois passages", body: "Tournage, tournassage, émaillage." }, slide_html: { slide_number: 3, html: NEW_HTML }, change: "texte", notices: [] }, error: null };
    }),
    ...over,
  };
}

function Harness({ api, rawIn = raw }: { api: SlideRedoApi; rawIn?: any }) {
  const [r, setR] = useState<any>(rawIn), [v, setV] = useState(visuals);
  return (<><output data-testid="saved">{JSON.stringify({ r, v })}</output>
    <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} slideRedo={api} /></>);
}
const saved = () => JSON.parse(screen.getByTestId("saved").textContent!);

async function askRedo(instruction: string) {
  fireEvent.click(screen.getByRole("button", { name: "Sélectionner la slide 3" }));
  fireEvent.click(screen.getByTestId("slide-redo-button"));
  const dialog = await screen.findByTestId("slide-redo-dialog");
  expect(within(dialog).getByText("Refaire la slide 3")).toBeTruthy();
  expect(within(dialog).getByText("Les autres slides restent telles quelles.")).toBeTruthy();
  expect(within(dialog).getByText("Il te reste 22 crédits ce mois-ci.")).toBeTruthy();
  fireEvent.change(within(dialog).getByLabelText("Dis à Claude ce que tu veux changer sur cette slide"), { target: { value: instruction } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Refaire cette slide · 1 crédit" }));
}

describe("Refaire cette slide dans l'éditeur", () => {
  it("refait la slide 3 : les 13 autres inchangées, une étape d'Annuler revient à l'avant", async () => {
    const api = fakeApi();
    render(<Harness api={api} />);
    const before = saved();
    await askRedo("fais-en une frise en 3 étapes");
    const dialog = await screen.findByText("Voici la nouvelle version");
    expect(dialog).toBeTruthy();
    expect(screen.getByText("Consigne : « fais-en une frise en 3 étapes »")).toBeTruthy();
    expect(screen.getByText("Ta version")).toBeTruthy();
    expect(screen.getByText("Nouvelle version")).toBeTruthy();
    // Demande envoyée : la slide 3, la consigne, tout le carrousel pour le fil.
    expect(api.calls[0]).toMatchObject({ type: "slide_redo", redo_slide_number: 3, instruction: "fais-en une frise en 3 étapes", carousel_type: "text" });
    expect(api.calls[0].slides).toHaveLength(14);
    expect(api.calls[0].visual_request.slides).toHaveLength(14);
    // Rien ne bouge avant le choix.
    expect(saved()).toEqual(before);

    fireEvent.click(screen.getByRole("button", { name: "Garder la nouvelle" }));
    const after = saved();
    expect(after.v[2].html).toContain("Trois passages");
    expect(after.r.slides[2].title).toBe("Trois passages");
    for (let i = 0; i < 14; i++) {
      if (i === 2) continue;
      expect(after.v[i].html).toBe(before.v[i].html);
      expect(after.r.slides[i].title).toBe(before.r.slides[i].title);
      expect(after.r.slides[i].body).toBe(before.r.slides[i].body);
    }
    // Zones PowerPoint de la slide refaite : texte et étapes du schéma restent modifiables à l'export.
    const host = document.createElement("div");
    host.innerHTML = after.v[2].html;
    document.body.append(host);
    const page = host.querySelector<HTMLElement>("div")!;
    const zones = [...page.querySelectorAll<HTMLElement>("[data-pptx-editable]")];
    expect(zones.map((z) => z.textContent)).toEqual(["Trois passages", "Tournage", "Tournassage", "Émaillage"]);
    for (const zone of zones) {
      zone.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 80, right: 400, bottom: 80, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
      expect(blockFromElement(zone, document, "body")?.text).toBe(zone.textContent);
    }
    host.remove();

    fireEvent.click(screen.getByRole("button", { name: "Annuler la modification" }));
    expect(saved().v.map((s: any) => s.html)).toEqual(before.v.map((s: any) => s.html));
    expect(saved().r.slides[2].title).toBe("Titre 3");
  });

  it("« Garder la mienne » ne change rien", async () => {
    render(<Harness api={fakeApi()} />);
    const before = saved();
    await askRedo("plus court");
    await screen.findByText("Voici la nouvelle version");
    fireEvent.click(screen.getByRole("button", { name: "Garder la mienne" }));
    expect(saved()).toEqual(before);
  });

  it("fenêtre fermée pendant l'attente : la proposition rouvre la fenêtre", async () => {
    let release: () => void = () => {};
    const api = fakeApi();
    const answer = api.request;
    api.request = (body) => new Promise((resolve) => { release = () => resolve(answer(body)); });
    render(<Harness api={api} />);
    await askRedo("plus court");
    expect(await screen.findByText("Claude refait ta slide…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByTestId("slide-redo-dialog")).toBeNull());
    release();
    expect(await screen.findByText("Voici la nouvelle version")).toBeTruthy();
  });

  it("une erreur s'affiche et ne touche à rien", async () => {
    render(<Harness api={fakeApi({ request: async () => ({ data: null, error: "Claude n'a pas réussi à refaire cette slide sans inventer de chiffre ou d'histoire. Rien n'a été débité : reformule ta consigne." }) })} />);
    const before = saved();
    await askRedo("ajoute une statistique frappante");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Rien n'a été débité/);
    expect(saved()).toEqual(before);
  });

  it("slide verrouillée : bouton grisé, avec la phrase pour la déverrouiller", () => {
    const locked = { ...raw, slides: raw.slides.map((s) => (s.slide_number === 3 ? { ...s, editor_locked: true } : s)) };
    render(<Harness api={fakeApi()} rawIn={locked} />);
    fireEvent.click(screen.getByRole("button", { name: "Sélectionner la slide 3" }));
    const button = screen.getByTestId("slide-redo-button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toMatch(/déverrouille la slide pour la refaire/);
    expect(button.parentElement?.getAttribute("title")).toBe("Déverrouille la slide pour la refaire");
  });

  it("sans l'appli (pas de slideRedo) : pas de bouton", () => {
    function Bare() {
      const [r, setR] = useState<any>(raw), [v, setV] = useState(visuals);
      return <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} />;
    }
    render(<Bare />);
    expect(screen.queryByTestId("slide-redo-button")).toBeNull();
  });
});

describe("demande et slide refaite (photo)", () => {
  const PHOTO = "https://exemple.supabase.co/storage/v1/object/public/calendar-visuals/u/carousel-media/abc.jpg";
  const photoHtml = (text: string) => `<div style="position:relative;width:1080px;height:1350px"><img data-pptx-photo="1" src="${PHOTO}" style="position:absolute;left:0;top:0;width:1080px;height:1350px;object-fit:cover"><p data-slide-text="overlay" data-pptx-editable="overlay">${text}</p></div>`;
  const mixRaw = { carousel_type: "mix", slides: [
    { slide_number: 1, slide_type: "photo_full", overlay_text: "Accroche", photo_index: 1 },
    { slide_number: 2, slide_type: "text_only", title: "Texte", body: "Corps" },
  ] };
  const doc = readCarouselDocument(mixRaw, [{ slide_number: 1, html: photoHtml("Accroche") }, { slide_number: 2, html: slideHtml(2, "Texte") }]);

  it("les photos sont lues dans les slides ; la slide texte du mixte garde son allure de mixte", () => {
    const { sources, indexBySlide } = collectSlidePhotos(doc);
    expect(sources).toEqual([PHOTO]);
    expect(indexBySlide).toEqual([1, undefined]);
    const body = buildSlideRedoBody({ raw: mixRaw, document: doc, index: 1, instruction: " plus court ", photos: [{ base64: "data:image/jpeg;base64,AAA", mimeType: "image/jpeg" }], indexBySlide });
    expect(body).toMatchObject({ type: "slide_redo", redo_slide_number: 2, instruction: "plus court", carousel_type: "mix" });
    const visual = (body.visual_request as any);
    expect(visual.carousel_type).toBe("mix");
    expect(visual.photos).toHaveLength(1);
    expect(visual.slides[0]).toMatchObject({ slide_type: "photo_full", photo_index: 1, overlay_text: "Accroche" });
    expect(visual.slides[1]).toMatchObject({ slide_type: "text_only", title: "Texte" });
  });

  it("la photo envoyée réduite est remise telle qu'elle était dans la slide", () => {
    const sent = { base64: "data:image/jpeg;base64,PETITE", mimeType: "image/jpeg" };
    const next = slideFromRedo(doc.slides[0], {
      slide: { slide_number: 1, slide_type: "photo_full", overlay_text: "Accroche en haut", photo_index: 1, editor_locked: false },
      slide_html: { slide_number: 1, html: photoHtml("Accroche en haut").replace(PHOTO, sent.base64) },
    }, { sent, original: PHOTO });
    expect(next.id).toBe(doc.slides[0].id);
    expect(next.html).toContain(PHOTO);
    expect(next.html).not.toContain("PETITE");
    expect(next.data.overlay_text).toBe("Accroche en haut");
    expect(getEditorElements(next.html).some((e) => e.kind === "photo")).toBe(true);
  });
});
