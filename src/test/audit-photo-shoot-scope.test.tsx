import React, { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PhotoShootEmptyState } from "@/components/photos/PhotoShootEmptyState";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const state = vi.hoisted(() => ({
  workspace: "space-A",
  invoke: vi.fn(),
  save: vi.fn(),
  saves: [] as Array<{ workspace: string; labels: string[]; source: string }>,
}));

vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => state.workspace }));
vi.mock("@/hooks/use-photo-wishlist", () => ({
  usePhotoWishlistMutations: () => ({
    addMany: async (labels: string[], source: string, targetWorkspace?: string) => {
      const workspace = targetWorkspace ?? state.workspace;
      state.saves.push({ workspace, labels, source });
      await state.save(workspace);
    },
  }),
}));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: state.invoke }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const response = (label: string) => ({
  data: { ideas: [{ label, icon: "lieu" }] },
  error: null,
});

beforeEach(() => {
  state.workspace = "space-A";
  state.saves = [];
  state.invoke.mockReset();
  state.save.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

it("control: a settled response displays and saves the current workspace list", async () => {
  state.invoke.mockResolvedValue(response("Photographier mon atelier A"));
  render(<PhotoShootEmptyState onAddPhotos={() => {}} />);

  await screen.findByText("Photographier mon atelier A");
  fireEvent.click(screen.getByRole("button", { name: "Garder cette liste" }));

  await waitFor(() => expect(state.saves).toEqual([{
    workspace: "space-A",
    labels: ["Photographier mon atelier A"],
    source: "seance",
  }]));
});

it("G1: switching A to B never exposes or saves A suggestions in B", async () => {
  state.invoke.mockImplementation((_name, options) => Promise.resolve(
    response(options.body.workspace_id === "space-A" ? "Idée A" : "Idée B"),
  ));
  const view = render(<PhotoShootEmptyState onAddPhotos={() => {}} />);
  await screen.findByText("Idée A");

  state.workspace = "space-B";
  view.rerender(<PhotoShootEmptyState onAddPhotos={() => {}} />);

  expect(screen.queryByText("Idée A")).toBeNull();
  await screen.findByText("Idée B");
  fireEvent.click(screen.getByRole("button", { name: "Garder cette liste" }));
  await waitFor(() => expect(state.saves).toContainEqual({
    workspace: "space-B",
    labels: ["Idée B"],
    source: "seance",
  }));
  expect(state.saves.some((save) => save.workspace === "space-B" && save.labels.includes("Idée A"))).toBe(false);
});

it("G1: switching before the first response starts B and ignores A while B is active", async () => {
  const pendingA = deferred<ReturnType<typeof response>>();
  const pendingB = deferred<ReturnType<typeof response>>();
  state.invoke.mockImplementation((_name, options) => (
    options.body.workspace_id === "space-A" ? pendingA.promise : pendingB.promise
  ));
  const view = render(<PhotoShootEmptyState onAddPhotos={() => {}} />);

  state.workspace = "space-B";
  view.rerender(<PhotoShootEmptyState onAddPhotos={() => {}} />);
  expect(state.invoke.mock.calls.some((call) => call[1].body.workspace_id === "space-B")).toBe(true);

  await act(async () => pendingA.resolve(response("Réponse tardive A")));
  expect(screen.queryByText("Réponse tardive A")).toBeNull();
  await act(async () => pendingB.resolve(response("Réponse B")));
  expect(await screen.findByText("Réponse B")).toBeVisible();
});

it("G1: A → B → A keeps both workspace results when B resolves first", async () => {
  const pendingA = deferred<ReturnType<typeof response>>();
  const pendingB = deferred<ReturnType<typeof response>>();
  state.invoke.mockImplementation((_name, options) => (
    options.body.workspace_id === "space-A" ? pendingA.promise : pendingB.promise
  ));
  const view = render(<PhotoShootEmptyState onAddPhotos={() => {}} />);

  state.workspace = "space-B";
  view.rerender(<PhotoShootEmptyState onAddPhotos={() => {}} />);
  await act(async () => pendingB.resolve(response("Idée B d'abord")));
  expect(await screen.findByText("Idée B d'abord")).toBeVisible();

  state.workspace = "space-A";
  view.rerender(<PhotoShootEmptyState onAddPhotos={() => {}} />);
  expect(screen.queryByText("Idée B d'abord")).toBeNull();
  await act(async () => pendingA.resolve(response("Idée A ensuite")));
  expect(await screen.findByText("Idée A ensuite")).toBeVisible();

  state.workspace = "space-B";
  view.rerender(<PhotoShootEmptyState onAddPhotos={() => {}} />);
  expect(await screen.findByText("Idée B d'abord")).toBeVisible();
});

it("G1: a save started in A completes only A after switching to B", async () => {
  const pendingSaveA = deferred<void>();
  state.invoke.mockImplementation((_name, options) => Promise.resolve(
    response(options.body.workspace_id === "space-A" ? "Idée A à garder" : "Idée B à garder"),
  ));
  state.save.mockImplementation((workspace: string) => (
    workspace === "space-A" ? pendingSaveA.promise : Promise.resolve()
  ));
  const view = render(<PhotoShootEmptyState onAddPhotos={() => {}} />);
  await screen.findByText("Idée A à garder");
  fireEvent.click(screen.getByRole("button", { name: "Garder cette liste" }));

  state.workspace = "space-B";
  view.rerender(<PhotoShootEmptyState onAddPhotos={() => {}} />);
  await screen.findByText("Idée B à garder");
  expect(screen.getByRole("button", { name: "Garder cette liste" })).toBeEnabled();

  await act(async () => pendingSaveA.resolve());
  expect(screen.getByRole("button", { name: "Garder cette liste" })).toBeEnabled();
  state.workspace = "space-A";
  view.rerender(<PhotoShootEmptyState onAddPhotos={() => {}} />);
  expect(screen.getByRole("button", { name: "Liste enregistrée" })).toBeDisabled();
  expect(state.saves[0].workspace).toBe("space-A");
});

it("G1: StrictMode initialization eventually displays the response", async () => {
  state.invoke.mockResolvedValue(response("Liste prête"));
  render(<StrictMode><PhotoShootEmptyState onAddPhotos={() => {}} /></StrictMode>);
  expect(await screen.findByText("Liste prête")).toBeVisible();
});
