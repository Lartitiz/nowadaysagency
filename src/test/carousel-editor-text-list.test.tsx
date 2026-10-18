// Chantier X (18/10/2026) : « Modifier le texte » d'un carrousel (choix C2), ordre des
// slides en mode simple et « Slide supprimée · Annuler ».
import React, { useState } from "react";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { requestCarouselTextList } from "@/lib/carousel-editor-shown";

const toasts = vi.hoisted(() => [] as { message: string; opts?: any }[]);
vi.mock("sonner", () => {
  const toast: any = (message: string, opts?: any) => toasts.push({ message, opts });
  toast.success = (message: string, opts?: any) => toasts.push({ message, opts });
  toast.error = toast.warning = toast.info = toast.message = toast.success;
  return { toast };
});
vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(() => {
  cleanup();
  toasts.length = 0;
  window.localStorage.clear();
});

const raw = {
  slides: [
    { slide_number: 1, role: "hook", title: "Mon atelier", body: "Texte" },
    { slide_number: 2, title: "Suite", body: "Fin" },
    { slide_number: 3, title: "Dernière", body: "Merci" },
  ],
  caption: { body: "Ma légende" },
};
const visuals = [
  { slide_number: 1, html: '<div style="position:relative;width:1080px;height:1350px"><h1 data-slide-text="title" style="color:#91014b;font-size:88px">Mon atelier</h1><p data-slide-text="body">Texte</p></div>' },
  { slide_number: 2, html: '<div><h1 data-slide-text="title" style="color:#123456">Suite</h1><p data-slide-text="body">Fin</p></div>' },
  { slide_number: 3, html: '<div><h1 data-slide-text="title">Dernière</h1><p data-slide-text="body">Merci</p></div>' },
];
function Harness({ r0 = raw }: { r0?: any }) {
  const [r, setR] = useState<any>(r0), [v, setV] = useState(visuals);
  return (<><output data-testid="saved">{JSON.stringify({ r, v })}</output>
    <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} /></>);
}
const saved = () => JSON.parse(screen.getByTestId("saved").textContent!);
const openList = () => act(() => requestCarouselTextList());

describe("« Modifier le texte » d'un carrousel", () => {
  it("montre le texte de toutes les slides et la légende", () => {
    render(<Harness />);
    openList();
    const list = screen.getByTestId("carousel-text-list");
    for (const n of [1, 2, 3]) expect(within(list).getByRole("region", { name: `Slide ${n}` })).toBeTruthy();
    expect((screen.getByLabelText("Slide 2 : titre") as HTMLTextAreaElement).value).toBe("Suite");
    expect((screen.getByLabelText("Slide 3 : texte") as HTMLTextAreaElement).value).toBe("Merci");
    expect((within(list).getByLabelText("Légende de la publication") as HTMLTextAreaElement).value).toBe("Ma légende");
  });

  it("reporte chaque correction dans le visuel sans toucher au design, en une étape d'Annuler", () => {
    render(<Harness />);
    openList();
    fireEvent.change(screen.getByLabelText("Slide 2 : titre"), { target: { value: "La suite corrigée" } });
    fireEvent.change(screen.getByLabelText("Slide 1 : texte"), { target: { value: "Texte revu" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le texte" }));
    const out = saved();
    expect(out.r.slides[1].title).toBe("La suite corrigée");
    expect(out.r.slides[0].body).toBe("Texte revu");
    expect(out.v[1].html).toContain("La suite corrigée");
    expect(out.v[1].html).toMatch(/color: ?(#123456|rgb\(18, 52, 86\))/);
    expect(out.v[0].html).toMatch(/font-size: ?88px/);
    expect(screen.queryByTestId("carousel-text-list")).toBeNull();
    expect(toasts.some((t) => t.message === "Texte mis à jour dans tes slides")).toBe(true);
    fireEvent.click(screen.getByLabelText("Annuler la modification"));
    expect(saved().r.slides[1].title).toBe("Suite");
    expect(saved().r.slides[0].body).toBe("Texte");
  });

  it("« Annuler » du message remet le texte d'avant", () => {
    render(<Harness />);
    openList();
    fireEvent.change(screen.getByLabelText("Slide 2 : titre"), { target: { value: "Autre titre" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le texte" }));
    expect(saved().r.slides[1].title).toBe("Autre titre");
    const t = toasts.find((x) => x.message === "Texte mis à jour dans tes slides");
    expect(t?.opts?.action?.label).toBe("Annuler");
    act(() => t!.opts.action.onClick());
    expect(saved().r.slides[1].title).toBe("Suite");
    expect(saved().v[1].html).toContain("Suite");
  });

  it("« Fermer sans changer » ne touche à rien", () => {
    render(<Harness />);
    const before = screen.getByTestId("saved").textContent;
    openList();
    fireEvent.change(screen.getByLabelText("Slide 2 : titre"), { target: { value: "Brouillon" } });
    fireEvent.click(screen.getByRole("button", { name: "Fermer sans changer" }));
    expect(screen.getByTestId("saved").textContent).toBe(before);
  });

  it("une slide verrouillée reste en lecture seule", () => {
    const locked = { ...raw, slides: raw.slides.map((s, i) => (i === 1 ? { ...s, editor_locked: true } : s)) };
    render(<Harness r0={locked} />);
    openList();
    expect((screen.getByLabelText("Slide 2 : titre") as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.getByText(/Verrouillée : déverrouille-la/)).toBeTruthy();
  });
});

describe("ordre des slides en mode simple", () => {
  it("monter, descendre et dupliquer sont sous la vignette choisie, avec l'aide écrite", () => {
    render(<Harness />);
    expect(screen.getByText("Glisse une vignette pour changer l’ordre.")).toBeTruthy();
    let tools = screen.getByTestId("slide-order-tools");
    expect(tools.previousElementSibling?.getAttribute("data-thumb")).toBe("0");
    expect((within(tools).getByLabelText("Monter la slide") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(tools).getByLabelText("Descendre la slide"));
    expect(saved().r.slides.map((s: any) => s.title)).toEqual(["Suite", "Mon atelier", "Dernière"]);
    tools = screen.getByTestId("slide-order-tools");
    expect(tools.previousElementSibling?.getAttribute("data-thumb")).toBe("1");
    fireEvent.click(within(tools).getByLabelText("Dupliquer la slide"));
    expect(saved().r.slides.map((s: any) => s.title)).toEqual(["Suite", "Mon atelier", "Mon atelier", "Dernière"]);
  });

  it("« Supprimer la slide » prévient et « Annuler » la remet à sa place", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Sélectionner la slide 2" }));
    fireEvent.click(screen.getByRole("button", { name: /Supprimer la slide/ }));
    expect(saved().r.slides.map((s: any) => s.title)).toEqual(["Mon atelier", "Dernière"]);
    const t = toasts.find((x) => x.message === "Slide supprimée");
    expect(t?.opts?.action?.label).toBe("Annuler");
    act(() => t!.opts.action.onClick());
    expect(saved().r.slides.map((s: any) => s.title)).toEqual(["Mon atelier", "Suite", "Dernière"]);
    expect(saved().v[1].html).toContain("Suite");
  });
});
