import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/photo-workflows", () => ({ listPhotoWorkflows: mock.list }));
import { PhotoPreparationsPanel } from "@/components/photos/PhotoPreparationsPanel";
afterEach(() => { cleanup(); mock.list.mockReset(); });
it("ignores late reads from another workspace and resumes the selected row", async () => {
  let finishA: (rows: any[]) => void = () => {};
  const b = {id:"b",name:"Préparation B",workspace_id:"B"};
  mock.list.mockImplementation((id: string) => id === "A" ? new Promise(r => {finishA=r;}) : Promise.resolve([b]));
  const resume=vi.fn();
  const view=render(<PhotoPreparationsPanel workspaceId="A" onResume={resume} />);
  view.rerender(<PhotoPreparationsPanel workspaceId="B" onResume={resume} />);
  await screen.findByRole("button",{name:/Préparation B/});
  await act(async()=>finishA([{id:"a",name:"Préparation A",workspace_id:"A"}]));
  expect(screen.queryByText("Préparation A")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:/Préparation B/}));
  expect(resume).toHaveBeenCalledWith(b);
});
it("distinguishes a failed read from an empty collection and allows retry", async () => {
  mock.list.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
  render(<PhotoPreparationsPanel workspaceId="A" onResume={vi.fn()} />);
  await screen.findByRole("alert");
  expect(screen.queryByText(/Aucune préparation/)).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Réessayer"}));
  await screen.findByText(/Aucune préparation/);
});
