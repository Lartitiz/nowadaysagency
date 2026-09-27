import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { CalendarWorkspaceGate } from "@/components/calendar/CalendarWorkspaceGate";

const state = vi.hoisted(() => ({ ready: false, mounts: 0 }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceReady: () => state.ready }));

function Enfant() {
  useEffect(() => { state.mounts++; }, []);
  return <p>calendrier monté</p>;
}

beforeEach(() => { state.ready = false; state.mounts = 0; });

it("ne monte pas le calendrier tant que l'espace n'est pas résolu", () => {
  render(<CalendarWorkspaceGate><Enfant /></CalendarWorkspaceGate>);
  expect(screen.queryByText("calendrier monté")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Chargement du calendrier")).toBeInTheDocument();
  expect(state.mounts).toBe(0);
});

it("monte le calendrier UNE seule fois, une fois l'espace résolu", () => {
  const { rerender } = render(<CalendarWorkspaceGate><Enfant /></CalendarWorkspaceGate>);
  state.ready = true;
  rerender(<CalendarWorkspaceGate><Enfant /></CalendarWorkspaceGate>);
  expect(screen.getByText("calendrier monté")).toBeInTheDocument();
  rerender(<CalendarWorkspaceGate><Enfant /></CalendarWorkspaceGate>);
  expect(state.mounts).toBe(1);
});
