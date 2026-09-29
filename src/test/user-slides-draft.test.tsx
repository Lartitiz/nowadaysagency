// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import UserSlidesStep, { type UserSlidesInputDraft } from "@/components/creer/UserSlidesStep";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";

vi.mock("@/components/creer/PhotoUploadZone", () => ({
  PhotoUploadZone: ({ initialPhotos, onPhotosChange }: {
    initialPhotos: PhotoItem[];
    onPhotosChange: (photos: PhotoItem[]) => void;
  }) => <div>
    <button onClick={() => onPhotosChange(initialPhotos.slice(1))}>Retirer la première photo</button>
    <button onClick={() => onPhotosChange(initialPhotos.filter((_, index) => index !== 1))}>Retirer la deuxième photo</button>
    <button onClick={() => onPhotosChange([...initialPhotos].reverse())}>Inverser les photos</button>
  </div>,
}));

afterEach(cleanup);

const photo = (id: string): PhotoItem => ({
  id, name: id, base64: `data:image/png;base64,${id}`, preview: `data:image/png;base64,${id}`,
});

describe("Mes slides draft", () => {
  it("restores unsplit text after the step is unmounted", () => {
    let draft: UserSlidesInputDraft | null = null;
    const props = { onBack: vi.fn(), onGenerate: vi.fn(), onDraftChange: (next: UserSlidesInputDraft) => { draft = next; } };
    const view = render(<UserSlidesStep {...props} />);
    fireEvent.change(screen.getByPlaceholderText(/Colle tout ton texte ici/), { target: { value: "Couverture\n\nConclusion" } });
    expect(draft?.pasteText).toBe("Couverture\n\nConclusion");
    view.unmount();
    render(<UserSlidesStep {...props} initialDraft={draft} />);
    expect(screen.getByPlaceholderText(/Colle tout ton texte ici/)).toHaveValue("Couverture\n\nConclusion");
  });

  it("keeps a slide linked to its photo through removal and reorder", () => {
    const photos = [photo("a"), photo("b"), photo("c")];
    let latest: UserSlidesInputDraft | null = null;
    const onPhotosChange = vi.fn();
    render(<UserSlidesStep
      initialPhotos={photos}
      initialDraft={{ pasteText: "", caption: "Légende", slides: [
        { id: "one", title: "", body: "Couverture", photoIndex: 2 },
        { id: "two", title: "", body: "Conclusion", photoIndex: 3 },
      ] }}
      onDraftChange={(draft) => { latest = draft; }}
      onPhotosChange={onPhotosChange}
      onBack={vi.fn()}
      onGenerate={vi.fn()}
    />);
    fireEvent.click(screen.getByText("Retirer la première photo"));
    expect(latest?.slides.map((slide) => slide.photoIndex)).toEqual([1, 2]);
    expect(onPhotosChange).toHaveBeenLastCalledWith([photos[1], photos[2]]);
    fireEvent.click(screen.getByText("Inverser les photos"));
    expect(latest?.slides.map((slide) => slide.photoIndex)).toEqual([2, 1]);
    expect(screen.getByLabelText("Photo de la slide 1")).toHaveValue("2");
  });

  it("clears only the link to a photo that was removed", () => {
    let latest: UserSlidesInputDraft | null = null;
    render(<UserSlidesStep
      initialPhotos={[photo("a"), photo("b"), photo("c")]}
      initialDraft={{ pasteText: "", caption: "", slides: [
        { id: "one", title: "", body: "Couverture", photoIndex: 2 },
        { id: "two", title: "", body: "Conclusion", photoIndex: 3 },
      ] }}
      onDraftChange={(draft) => { latest = draft; }}
      onBack={vi.fn()}
      onGenerate={vi.fn()}
    />);
    fireEvent.click(screen.getByText("Retirer la deuxième photo"));
    expect(latest?.slides.map((slide) => slide.photoIndex)).toEqual([null, 2]);
  });
});
