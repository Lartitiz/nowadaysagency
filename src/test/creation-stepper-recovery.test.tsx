import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import CreerStepper from "@/components/creer/CreerStepper";
it("lets the user reopen existing content after revisiting precisions", () => {
  const onStepClick = vi.fn();
  const app = render(<CreerStepper current="brief" contentAvailable onStepClick={onStepClick} />);
  const button = screen.getByRole("button", { name: /Étape 4.*Contenu/ });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(onStepClick).toHaveBeenCalledWith("result");
  app.rerender(<CreerStepper current="brief" onStepClick={onStepClick} />);
  expect(button).toBeDisabled();
});
