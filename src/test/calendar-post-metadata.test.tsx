// Fenêtre d'un post du calendrier : le choix du format (essai réel du 27/11/2026).
// Recliquer sur le format déjà choisi le décochait sans rien dire ; un post sans
// format partait alors en carrousel quand on cliquait « Rédiger avec l'IA ».
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock("@/hooks/use-active-series", () => ({ useActiveSeries: () => ({ data: [] }), getNextEpisodeNumber: async () => 1 }));

import { CalendarPostMetadata } from "@/components/calendar/CalendarPostMetadata";

function monte(format: string | null) {
  const setFormat = vi.fn();
  const setObjectif = vi.fn();
  render(
    <CalendarPostMetadata
      status="idea" setStatus={() => {}} postCanal="instagram" setPostCanal={() => {}}
      format={format} setFormat={setFormat} objectif="vente" setObjectif={setObjectif}
      angle={null} setAngle={() => {}} showAdvanced setShowAdvanced={() => {}}
      editingPostId="p1" selectedDate="2026-11-27"
    />,
  );
  return { setFormat, setObjectif };
}

describe("choix du format d'un post du calendrier", () => {
  it("recliquer sur le format déjà choisi le garde (il ne se décoche plus)", () => {
    const { setFormat } = monte("post_photo");
    fireEvent.click(screen.getByRole("button", { name: /Post$/ }));
    expect(setFormat).not.toHaveBeenCalledWith(null);
  });

  it("cliquer sur un autre format le choisit", () => {
    const { setFormat } = monte("post_photo");
    fireEvent.click(screen.getByRole("button", { name: /Reel$/ }));
    expect(setFormat).toHaveBeenCalledWith("reel");
  });

  it("l'objectif, lui, reste facultatif : recliquer le retire", () => {
    const { setObjectif } = monte("post_photo");
    fireEvent.click(screen.getByRole("button", { name: /Vente$/ }));
    expect(setObjectif).toHaveBeenCalledWith(null);
  });
});
