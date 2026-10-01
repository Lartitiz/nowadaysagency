import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
const mock = vi.hoisted(() => ({ request: vi.fn(), read: vi.fn(), upload: vi.fn() }));
vi.mock("@/features/visual-studio/api", async original => ({ ...await original<object>(), studioRequest: mock.request }));
vi.mock("@/features/carousel-studio/store", () => ({ carouselStudioStore: () => ({ read: mock.read }) }));
vi.mock("@/lib/photo-storage", () => ({ uploadPhotoOriginal: mock.upload }));
import { CarouselStudioDialog } from "@/features/carousel-studio/CarouselStudioDialog";
beforeAll(() => { vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("TextEncoder", TextEncoder); });
afterEach(cleanup);
const raw = { _carousel_document_id: "document", slides: [{ editor_id: "slide", slide_number: 1, photo_index: 1, overlay_text: "Voici le texte final" }], visual_html: [] };
const photos = ["Produit réel", "Personne réelle"].map((name, i) => ({ id: `local-${i}`, userPhotoId: `photo-${i}`, name, preview: "/reference.png", base64: "" }));
const flush = vi.fn(async () => true), close = vi.fn();
function Location() { const l = useLocation(); return <span data-testid="path">{l.pathname + l.search}</span>; }
function mount(isCurrent = () => true) {
  return render(<MemoryRouter initialEntries={["/creer"]}><Location /><CarouselStudioDialog userId="user" workspaceId="A" ideaId="idea" raw={raw} slideId="slide" photos={photos} flush={flush} isCurrent={isCurrent} onClose={close} /></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); flush.mockResolvedValue(true);
  mock.read.mockResolvedValue({ content_data: raw });
  let refs: any[] = [];
  mock.request.mockImplementation(async body => {
    if (body.action === "reference") refs.push({ id: `ref-${body.photo_id}`, photo_id: body.photo_id });
    return { session: { id: body.session_id, revision: refs.length, references: refs } };
  });
});
it("cancels without a write or a Studio request", () => {
  mount(); fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(close).toHaveBeenCalledOnce(); expect(flush).not.toHaveBeenCalled(); expect(mock.request).not.toHaveBeenCalled();
});
it("keeps the carousel open when the save is refused", async () => {
  flush.mockResolvedValue(false); mount();
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir dans le Studio" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Enregistre d’abord");
  expect(mock.request).not.toHaveBeenCalled(); expect(screen.getByTestId("path")).toHaveTextContent(/^\/creer$/);
});
it("joins the selected real files and stores the edited brief, with no generation request", async () => {
  mount(); fireEvent.click(screen.getAllByRole("checkbox")[1]);
  fireEvent.change(screen.getByLabelText("Demande au Studio"), { target: { value: "Mon produit, image 1 ; la personne, image 2. Conserver le cadrage." } });
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir dans le Studio" }));
  await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/photos/studio?session="));
  expect(mock.request.mock.calls.filter(([b]) => b.action === "reference").map(([b]) => b.photo_id)).toEqual(["photo-0", "photo-1"]);
  expect(mock.request.mock.calls.map(([b]) => b.action)).toEqual(["create", "reference", "reference", "selection"]);
  const path = new URL(screen.getByTestId("path").textContent!, "https://example.test");
  const id = path.searchParams.get("session");
  expect(localStorage.getItem(`visual-studio:draft:user:A:${id}`)).toContain("Mon produit, image 1");
  expect(JSON.parse(localStorage.getItem(`visual-studio:draft:user:A:${id}:images`)!)).toEqual(["ref-photo-0", "ref-photo-1"]);
});
it("does not attach a deselected current photo", async () => {
  mount(); fireEvent.click(screen.getAllByRole("checkbox")[0]);
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir dans le Studio" }));
  await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("carousel_return="));
  expect(mock.request.mock.calls.some(([b]) => b.action === "reference")).toBe(false);
  expect(mock.request.mock.calls.at(-1)?.[0].reference_ids).toEqual([]);
});
it("ignores a late save response after leaving the workspace", async () => {
  let current = true, finish!: (v: boolean) => void;
  flush.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  mount(() => current); fireEvent.click(screen.getByRole("button", { name: "Ouvrir dans le Studio" }));
  current = false; await act(async () => finish(true));
  expect(mock.read).not.toHaveBeenCalled(); expect(mock.request).not.toHaveBeenCalled();
});
