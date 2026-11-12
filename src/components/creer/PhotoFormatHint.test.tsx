import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PhotoFormatHint, { photoFormatHintText } from "./PhotoFormatHint";

describe("PhotoFormatHint : texte adapté au canal", () => {
  it("LinkedIn avec plusieurs photos ne parle jamais de Reel ni de formats masqués", () => {
    render(<PhotoFormatHint channel="linkedin" photoCount={4} forceShowAll={false} onForceShowAll={() => {}} />);
    expect(screen.getByText(/carrousel les montre toutes/)).toBeInTheDocument();
    expect(screen.queryByText(/Reel/)).toBeNull();
    expect(screen.queryByText("Tout afficher quand même")).toBeNull();
  });

  it("LinkedIn avec une photo : aucune ligne (rien n'est masqué)", () => {
    expect(photoFormatHintText("linkedin", 1)).toBeNull();
  });

  it("Instagram garde carrousel, Reel ou Story et le bouton pour tout afficher", () => {
    const onForce = vi.fn();
    render(<PhotoFormatHint channel="instagram" photoCount={3} forceShowAll={false} onForceShowAll={onForce} />);
    expect(screen.getByText(/carrousel, le Reel ou la Story/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Tout afficher quand même"));
    expect(onForce).toHaveBeenCalledWith(true);
  });

  it("Pinterest ne promet pas de Reel", () => {
    expect(photoFormatHintText("pinterest", 3)?.text).not.toMatch(/Reel/);
  });

  it("sans photo : rien", () => {
    expect(photoFormatHintText("instagram", 0)).toBeNull();
  });
});
