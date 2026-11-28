// Loom de Laetitia (28/11/2026) : en plein recadrage d'une photo sur la slide 7,
// zoom au pavé tactile (des dizaines de retouches par seconde), l'éditeur a
// sauté à « Slide 1 sur 8 ». La page lui renvoyait son avant-dernier envoi
// après qu'il avait fait le suivant : il le prenait pour un carrousel venu
// d'ailleurs, relisait tout et revenait à la slide 1 (editor-echo.ts).
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { createEchoLog, ECHO_WINDOW_MS } from "@/lib/editor-echo";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(() => { cleanup(); window.localStorage.clear(); });

const raw = { slides: [1, 2, 3].map((n) => ({ slide_number: n, title: `Titre ${n}` })), caption: { body: "L" } };
const visuals = [1, 2, 3].map((n) => ({ slide_number: n, html: `<div style="position:relative;width:1080px;height:1350px"><h1 data-slide-text="title">Titre ${n}</h1></div>` }));

describe("l'éditeur reconnaît ses envois récents", () => {
  it("un envoi plus ancien qui revient en retard ne ramène pas à la slide 1", async () => {
    const sent: [any, any][] = [];
    const onChange = (r: any, v: any) => { sent.push([r, v]); };
    const view = render(<CarouselEditor result={raw} visualSlides={visuals} onChange={onChange} />);
    const [r1, v1] = sent[0];
    view.rerender(<CarouselEditor result={{ raw: r1 }} visualSlides={v1} onChange={onChange} />);
    const thumbs = screen.getByLabelText("Slides du carrousel").querySelectorAll("button");
    fireEvent.click(thumbs[1]);
    expect(screen.getByTestId("slide-count").textContent).toContain("Slide 2");
    // Deux retouches très rapprochées (déplacer la slide, puis la remonter) :
    // deux envois, avant que la page n'ait rendu le premier.
    const count = () => screen.getByTestId("slide-count").textContent;
    fireEvent.click(screen.getByLabelText("Descendre la slide"));
    const n = sent.length;
    fireEvent.click(screen.getByLabelText("Monter la slide"));
    expect(sent.length).toBe(n + 1);
    const before = count();
    expect(before).toMatch(/^Slide 2/);
    // La page rend en retard le PREMIER des deux envois : écho, pas un autre carrousel.
    const [rStale, vStale] = sent[n - 1];
    await act(async () => { view.rerender(<CarouselEditor result={{ raw: rStale }} visualSlides={vStale} onChange={onChange} />); });
    expect(count()).toBe(before);
  });

  it("journal des envois : le dernier compte toujours, les précédents un court laps, une relecture les oublie", () => {
    const log = createEchoLog();
    const a = [1], b = [2], c = [3];
    expect(log.empty).toBe(true);
    log.remember(a, 0); log.remember(b, 10);
    expect(log.empty).toBe(false);
    expect(log.isEcho(b, 10)).toBe(true);
    expect(log.isEcho(a, 500)).toBe(true);
    expect(log.isEcho(a, ECHO_WINDOW_MS + 100)).toBe(false); // vrai retour en arrière plus tard : relu
    expect(log.isEcho(b, 60_000)).toBe(true);
    expect(log.isEcho(c, 10)).toBe(false);
    log.reset(c, 20);
    expect(log.isEcho(a, 30)).toBe(false);
    expect(log.isEcho(c, 30)).toBe(true);
  });
});
