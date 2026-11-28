// Loom du 28/11/2026 : « Avant / après ? » n'est plus sous chaque photo,
// il est rangé dans le menu « … » ; la pastille n'apparaît qu'une fois posée.
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhotoPairChip, PhotoPairHint, PhotoPairMenu } from "@/components/creer/PhotoPairChip";

type P = { context?: string };

function Galerie({ start }: { start: P[] }) {
  const [photos, setPhotos] = useState<P[]>(start);
  return (
    <div>
      <PhotoPairHint photos={photos} />
      {photos.map((_, i) => (
        <div key={i}>
          <PhotoPairChip photos={photos} index={i} onChange={setPhotos} />
          <PhotoPairMenu photos={photos} index={i} onChange={setPhotos} />
        </div>
      ))}
    </div>
  );
}

describe("avant / après rangé dans « … »", () => {
  it("aucune pastille ni phrase d'aide tant que rien n'est marqué", () => {
    render(<Galerie start={[{}, {}, {}]} />);
    expect(screen.queryByTestId("photo-pair-chip")).toBeNull();
    expect(screen.queryByTestId("photo-pair-hint")).toBeNull();
    expect(screen.queryByText("Avant / après ?")).toBeNull();
    expect(screen.getAllByTestId("photo-more-menu")).toHaveLength(3);
  });

  it("marquer un avant puis un après par le menu fait apparaître les pastilles", async () => {
    const user = userEvent.setup();
    render(<Galerie start={[{}, {}]} />);
    await user.click(screen.getAllByTestId("photo-more-menu")[0]);
    await user.click(await screen.findByText("C'est un « avant »"));
    expect(screen.getByText("Avant · 1")).toBeInTheDocument();
    expect(screen.getByTestId("photo-pair-hint").textContent).toMatch(/autant d'avants que d'après/);
    await user.click(screen.getAllByTestId("photo-more-menu")[1]);
    await user.click(await screen.findByText("C'est un « après »"));
    expect(screen.getByText("Après · 1")).toBeInTheDocument();
    expect(screen.getByTestId("photo-pair-hint").textContent).toMatch(/deux slides qui se suivent/);
  });

  it("« Ni avant ni après » retire la pastille", async () => {
    const user = userEvent.setup();
    render(<Galerie start={[{}, {}]} />);
    await user.click(screen.getAllByTestId("photo-more-menu")[0]);
    await user.click(await screen.findByText("C'est un « avant »"));
    await user.click(screen.getAllByTestId("photo-more-menu")[0]);
    await user.click(await screen.findByText("Ni avant ni après"));
    expect(screen.queryByTestId("photo-pair-chip")).toBeNull();
  });

  it("une seule photo : pas de menu", () => {
    render(<Galerie start={[{}]} />);
    expect(screen.queryByTestId("photo-more-menu")).toBeNull();
  });
});
