import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ request: vi.fn(), list: vi.fn(), read: vi.fn() }));
vi.mock("@/components/photos/PhotoLibraryPickerDialog", () => ({ PhotoLibraryPickerDialog: ({ open, onConfirm }: {
  open: boolean; onConfirm: (photos: Array<{ id: string; name: string }>) => void;
}) => open ? <button onClick={() => onConfirm([{ id: "photo-1", name: "Produit" }, { id: "photo-2", name: "Décor" }])}>Choisir deux photos</button> : null }));
vi.mock("@/features/studio-video/api", () => ({
  videoRequest: mock.request,
  listStudioVideos: mock.list,
  readStudioVideo: mock.read,
}));
import { StudioVideoPanel } from "@/features/studio-video/StudioVideoPanel";

const quote = {
  id: "job", workspace_id: "space", source_kind: "photo", source_id: "photo",
  source_name: "Atelier", prompt: "La lumière traverse l'atelier", duration: 5,
  resolution: "480p", status: "quoted", estimated_usd: 0.72,
  estimated_credits: 72, quote_expires_at: new Date(Date.now() + 60_000).toISOString(),
  created_at: "", error_code: null, video_url: null,
};
const clients: QueryClient[] = [];
function mount(withSource = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><StudioVideoPanel workspaceId="space" writable
    initialSource={withSource ? { kind: "photo", id: "photo", name: "Atelier" } : null} /></QueryClientProvider>);
}
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  mock.request.mockReset(); mock.list.mockReset(); mock.read.mockReset();
});

it("affiche le devis puis n'envoie le POST payant qu'au clic explicite", async () => {
  mock.list.mockResolvedValue({ jobs: [] });
  mock.request.mockImplementation(async (body: { action: string }) =>
    body.action === "quote" ? { job: quote } : { job: { ...quote, status: "failed" } });
  mock.read.mockResolvedValue({ job: { ...quote, status: "failed" } });
  mount();
  fireEvent.change(screen.getByRole("textbox", { name: "Ce qui doit bouger" }),
    { target: { value: quote.prompt } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Vérifier le prix" }));
  expect(await screen.findByText(/Devis Higgsfield/)).toBeInTheDocument();
  expect(mock.request.mock.calls.map(([body]) => body.action)).toEqual(["quote"]);
  fireEvent.click(screen.getByRole("button", { name: /Générer ce clip/ }));
  await waitFor(() => expect(mock.request.mock.calls.map(([body]) => body.action)).toEqual(["quote", "submit"]));
});

it("écarte un devis arrivé après que la demande a changé", async () => {
  mock.list.mockResolvedValue({ jobs: [] });
  let finish: (value: unknown) => void = () => {};
  mock.request.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  mount();
  const prompt = screen.getByRole("textbox", { name: "Ce qui doit bouger" });
  fireEvent.change(prompt, { target: { value: quote.prompt } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Vérifier le prix" }));
  fireEvent.change(prompt, { target: { value: "Une autre idée" } });
  finish({ job: quote });
  await waitFor(() => expect(mock.list).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("button", { name: /Générer ce clip/ })).not.toBeInTheDocument();
});

it("garde la bibliothèque lisible quand les générations sont désactivées", async () => {
  mock.list.mockResolvedValue({ enabled: false, jobs: [] });
  mount();
  expect(await screen.findByText(/création vidéo sera disponible après l’activation/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Mes clips" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Vérifier le prix" })).not.toBeInTheDocument();
  expect(mock.request).not.toHaveBeenCalled();
});

it("obtient un devis depuis une idée seule sans attestation d'image", async () => {
  mock.list.mockResolvedValue({ jobs: [] });
  mock.request.mockResolvedValue({ job: { ...quote, source_kind: "text", source_id: null } });
  mount(false);
  fireEvent.change(screen.getByRole("textbox", { name: "Quelle vidéo veux-tu créer ?" }),
    { target: { value: "Une main ouvre une boîte dans un atelier lumineux" } });
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Vérifier le prix" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalled());
  expect(mock.request.mock.calls[0][0]).toMatchObject({ source_kind: "text", person_free_attested: false, aspect_ratio: "9:16" });
  expect(mock.request.mock.calls[0][0].source_id).toBeUndefined();
});

it("transmet les rôles et l'ordre de deux références avec le devis", async () => {
  mock.list.mockResolvedValue({ jobs: [] });
  mock.request.mockResolvedValue({ job: { ...quote, source_kind: "references", source_id: null } });
  mount(false);
  fireEvent.click(screen.getByRole("radio", { name: "Plusieurs images" }));
  fireEvent.click(screen.getByRole("button", { name: "Ajouter des images" }));
  fireEvent.click(screen.getByRole("button", { name: "Choisir deux photos" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Rôle de Décor" }), { target: { value: "background" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Quelle vidéo veux-tu créer ?" }),
    { target: { value: "Le produit se révèle doucement dans ce décor" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Vérifier le prix" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalled());
  expect(mock.request.mock.calls[0][0]).toMatchObject({ source_kind: "references", references: [
    { kind: "photo", id: "photo-1", role: "subject" }, { kind: "photo", id: "photo-2", role: "background" },
  ] });
});
