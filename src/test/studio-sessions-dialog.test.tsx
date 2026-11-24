// Fenêtre « Mes sessions Studio » : une erreur de chargement ne montre jamais
// un code technique à la cliente (même défaut que le bandeau, PR #2037).
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { StudioSessionsDialog } from "@/features/visual-studio/StudioSessionsDialog";

type Sessions = ComponentProps<typeof StudioSessionsDialog>["sessions"];
const TECHNIQUE = /Failed to fetch|Edge Function|non-2xx|TypeError|undefined|internal_boom/i;

function mount(error: Error, refetch = vi.fn()) {
  const sessions = { isLoading: false, error, data: undefined, refetch } as unknown as Sessions;
  render(
    <StudioSessionsDialog open onOpenChange={() => {}} workspaceName="Espace A" sessions={sessions}
      roleWritable sessionAction={null} onArchive={() => {}} onOpenSession={() => {}} onNewSession={() => {}} />,
  );
  return refetch;
}
afterEach(cleanup);

it.each(["internal_boom", "TypeError: Failed to fetch", "Edge Function returned a non-2xx status code"])(
  "remplace le code technique « %s » par une phrase claire",
  (message) => {
    mount(new Error(message));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).not.toMatch(TECHNIQUE);
    expect(alert.textContent).toMatch(/réessaie/i);
    expect(document.body.textContent).not.toMatch(TECHNIQUE);
  },
);

it("prend la phrase prévue quand l'erreur est vide, et garde le bouton Réessayer", async () => {
  const refetch = mount(new Error(""));
  expect(screen.getByRole("alert")).toHaveTextContent("Tes sessions ne se chargent pas. Réessaie dans un instant.");
  await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  expect(refetch).toHaveBeenCalled();
});

it("garde tel quel un message déjà clair écrit pour la cliente", () => {
  mount(new Error("Les sessions sont momentanément indisponibles."));
  expect(screen.getByRole("alert")).toHaveTextContent("Les sessions sont momentanément indisponibles.");
});
