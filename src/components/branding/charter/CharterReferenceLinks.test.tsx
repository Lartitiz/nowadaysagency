import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CharterReferenceLinks from "./CharterReferenceLinks";

describe("références de direction artistique", () => {
  it("conserve un ancien lien et ajoute une vidéo avec son rôle sans réécrire l'existant", () => {
    const onChange = vi.fn();
    const existing = ["https://example.com/"];
    const { rerender } = render(<CharterReferenceLinks links={existing} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Adresse de référence"), { target: { value: "https://video.example/watch" } });
    fireEvent.change(screen.getByLabelText("Type de référence"), { target: { value: "video" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(onChange).toHaveBeenCalledWith([
      { url: "https://example.com/", kind: "site", role: "follow", note: "" },
      { url: "https://video.example/watch", kind: "video", role: "follow", note: "" },
    ]);
    rerender(<CharterReferenceLinks links={onChange.mock.lastCall![0]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Rôle du lien 2"), { target: { value: "avoid" } });
    expect(onChange.mock.lastCall![0][1].role).toBe("avoid");
  });

  it("rejette une URL invalide sans écrire", () => {
    const onChange = vi.fn();
    render(<CharterReferenceLinks links={[]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Adresse de référence"), { target: { value: "adresse invalide" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(screen.getByRole("alert")).toHaveTextContent("adresse");
    expect(onChange).not.toHaveBeenCalled();
  });
});
