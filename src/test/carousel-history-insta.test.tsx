// Historique des versions et aperçu Instagram (03/10/2026).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { pruneCarouselHistory, type CarouselVersion } from "@/lib/carousel-autosave";
import CarouselSaveStatus from "@/components/creer/CarouselSaveStatus";
import CarouselInstagramPreview from "@/components/creer/CarouselInstagramPreview";

afterEach(cleanup);
const v = (iso: string): CarouselVersion => ({ savedAt: iso, raw: { caption: { body: iso } } });

describe("version history", () => {
  it("keeps the 3 latest versions and the last one of each earlier day, 8 at most", () => {
    const history = [
      v("2026-10-03T15:00:00Z"), v("2026-10-03T14:50:00Z"), v("2026-10-03T14:40:00Z"), v("2026-10-03T14:30:00Z"),
      v("2026-10-02T18:00:00Z"), v("2026-10-02T09:00:00Z"),
      v("2026-10-01T20:00:00Z"),
      ...Array.from({ length: 8 }, (_, i) => v(`2026-09-${String(20 - i).padStart(2, "0")}T12:00:00Z`)),
    ];
    const kept = pruneCarouselHistory(history).map((x) => x.savedAt);
    expect(kept.slice(0, 3)).toEqual(["2026-10-03T15:00:00Z", "2026-10-03T14:50:00Z", "2026-10-03T14:40:00Z"]);
    expect(kept).toContain("2026-10-02T18:00:00Z");
    expect(kept).not.toContain("2026-10-02T09:00:00Z");
    expect(kept).toContain("2026-10-01T20:00:00Z");
    expect(kept).toHaveLength(8);
  });
  it("lists versions with a readable date and restores one in one click", () => {
    const restore = vi.fn();
    const today = new Date();
    const yesterday = new Date(Date.now() - 26 * 3600_000);
    render(
      <MemoryRouter>
        <CarouselSaveStatus save={{ enabled: true, status: "saved", history: [v(today.toISOString()), v(yesterday.toISOString())], flush: vi.fn(), restore, saveCopy: vi.fn() } as never} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/^Aujourd’hui/)).toBeTruthy();
    expect(screen.getByText(/^Hier/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Restaurer" })[1]);
    expect(restore).toHaveBeenCalledWith(expect.objectContaining({ savedAt: yesterday.toISOString() }));
  });
});

describe("Instagram preview", () => {
  const slides = [1, 2, 3].map((n) => ({ html: `<div><h1>Slide ${n}</h1></div>` }));
  it("shows the post in the feed, swipes, and cuts the caption with « plus »", () => {
    render(<CarouselInstagramPreview open onOpenChange={() => {}} slides={slides} caption={"x".repeat(200)} />);
    expect(screen.getByText("1/3")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Slide suivante"));
    expect(screen.getByText("2/3")).toBeTruthy();
    fireEvent.click(screen.getByText("plus"));
    expect(screen.queryByText("plus")).toBeNull();
  });
  it("shows the profile grid crop, current 3:4 or old square", () => {
    render(<CarouselInstagramPreview open onOpenChange={() => {}} slides={slides} caption="" />);
    fireEvent.click(screen.getByText("Dans la grille du profil"));
    expect(screen.getByText(/La grille montre la 1re slide recadrée/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Ancienne grille carrée"));
    expect((screen.getByLabelText("Ancienne grille carrée") as HTMLInputElement).checked).toBe(true);
  });
});
