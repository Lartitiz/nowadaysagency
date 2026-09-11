import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import PhotoDetailComparison from "@/components/photos/PhotoDetailComparison";
it("zoome sur les deux sources sans les modifier", () => {
  render(<PhotoDetailComparison original="data:image/png;base64,original" proposal="data:image/png;base64,proposal" />);
  fireEvent.change(screen.getByLabelText("Zoom de comparaison"), { target: { value: "250" } });
  expect(screen.getByAltText("Originale : détails")).toHaveAttribute("src", "data:image/png;base64,original");
  expect(screen.getByAltText("Proposition : détails")).toHaveAttribute("src", "data:image/png;base64,proposal");
  expect(screen.getByAltText("Originale : détails")).toHaveStyle({ width: "250%" });
  expect(screen.getByAltText("Proposition : détails")).toHaveStyle({ width: "250%" });
});
