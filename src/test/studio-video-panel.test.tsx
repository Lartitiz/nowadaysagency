import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ request: vi.fn(), list: vi.fn(), read: vi.fn() }));
vi.mock("@/features/studio-video/VideoImagePicker", () => ({ VideoImagePicker: ({ onConfirm }: {
  onConfirm: (photos: Array<{ kind: string; id: string; name: string; role: string }>) => void;
}) => <button onClick={() => onConfirm([{ kind: "photo", id: "photo-1", name: "Produit", role: "" }, { kind: "photo", id: "photo-2", name: "Décor", role: "" }])}>Choisir deux photos</button> }));
vi.mock("@/features/studio-video/api", () => ({
  videoRequest: mock.request,
  listStudioVideos: mock.list,
  readStudioVideo: mock.read,
}));
vi.mock("@/features/studio-video/library-sources", () => ({ videoReferencePreviews: async () => new Map() }));
import { StudioVideoPanel } from "@/features/studio-video/StudioVideoPanel";

const quote = {
  id: "job", workspace_id: "space", source_kind: "photo", source_id: "photo",
  source_name: "Atelier", prompt: "La lumière traverse l'atelier", duration: 5,
  resolution: "480p", status: "quoted", estimated_usd: 0.72,
  estimated_credits: 72, quote_expires_at: new Date(Date.now() + 60_000).toISOString(),
  created_at: "", error_code: null, video_url: null,
};
const clients: QueryClient[] = [];
async function mount(withSource = true, draftKey?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><StudioVideoPanel workspaceId="space" writable
    draftKey={draftKey} initialSource={withSource ? { kind: "photo", id: "photo", name: "Atelier" } : null} /></QueryClientProvider>);
  await waitFor(() => expect(mock.list).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByText("Chargement des clips…")).not.toBeInTheDocument());
  return view;
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  for (const client of clients) client.clear();
  clients.length = 0;
  mock.request.mockReset(); mock.list.mockReset(); mock.read.mockReset();
});

it("affiche le devis puis n'envoie le POST payant qu'au clic explicite", async () => {
  mock.list.mockResolvedValue({ enabled: true, jobs: [] });
  mock.request.mockImplementation(async (body: { action: string }) =>
    body.action === "quote" ? { job: quote } : { job: { ...quote, status: "failed" } });
  mock.read.mockResolvedValue({ job: { ...quote, status: "failed" } });
  await mount();
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
  mock.list.mockResolvedValue({ enabled: true, jobs: [] });
  let finish: (value: unknown) => void = () => {};
  mock.request.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await mount();
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
  await mount();
  expect(await screen.findByText(/création vidéo sera disponible après l’activation/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Mes clips" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Vérifier le prix" })).not.toBeInTheDocument();
  expect(mock.request).not.toHaveBeenCalled();
});

it("obtient un devis depuis une idée seule sans attestation d'image", async () => {
  mock.list.mockResolvedValue({ enabled: true, jobs: [] });
  mock.request.mockResolvedValue({ job: { ...quote, source_kind: "text", source_id: null } });
  await mount(false);
  fireEvent.change(screen.getByRole("textbox", { name: "Quelle vidéo veux-tu créer ?" }),
    { target: { value: "Une main ouvre une boîte dans un atelier lumineux" } });
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Vérifier le prix" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalled());
  expect(mock.request.mock.calls[0][0]).toMatchObject({ source_kind: "text", person_free_attested: false, aspect_ratio: "9:16" });
  expect(mock.request.mock.calls[0][0].source_id).toBeUndefined();
});

it("transmet les rôles et l'ordre de deux références avec le devis", async () => {
  mock.list.mockResolvedValue({ enabled: true, jobs: [] });
  mock.request.mockResolvedValue({ job: { ...quote, source_kind: "references", source_id: null } });
  await mount(false);
  fireEvent.click(screen.getByRole("radio", { name: "Une ou plusieurs images" }));
  fireEvent.click(screen.getByRole("button", { name: /Ajouter mes images/ }));
  fireEvent.click(screen.getByRole("button", { name: "Choisir deux photos" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Rôle de Produit" }), { target: { value: "product" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Rôle de Décor" }), { target: { value: "background" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Quelle vidéo veux-tu créer ?" }),
    { target: { value: "Le produit se révèle doucement dans ce décor" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Type de plan" }), { target: { value: "close" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Mouvement de caméra" }), { target: { value: "orbit" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Lumière" }), { target: { value: "studio" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Vérifier le prix" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalled());
  expect(mock.request.mock.calls[0][0]).toMatchObject({ source_kind: "references", references: [
    { kind: "photo", id: "photo-1", role: "product" }, { kind: "photo", id: "photo-2", role: "background" },
  ] });
  expect(mock.request.mock.calls[0][0].prompt).toBe("Le produit se révèle doucement dans ce décor\nCadrage : Gros plan.\nCaméra : La caméra tourne lentement autour du sujet.\nLumière : Lumière de studio diffuse.");
});

it("passe directement d’une photo à plusieurs références sans changer de mode", async () => {
  mock.list.mockResolvedValue({ enabled: true, jobs: [] });
  await mount();
  fireEvent.click(screen.getByRole("button", { name: /Ajouter ou changer mes images/ }));
  fireEvent.click(screen.getByRole("button", { name: "Choisir deux photos" }));
  expect(screen.getByRole("combobox", { name: "Rôle de Décor" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ajouter ou changer mes images (2/4)" })).toBeInTheDocument();
});

it("montre les images choisies et demande leurs rôles avant le devis", async () => {
  mock.list.mockResolvedValue({ enabled: true, jobs: [] });
  await mount(false);
  fireEvent.click(screen.getByRole("radio", { name: "Une ou plusieurs images" }));
  fireEvent.click(screen.getByRole("button", { name: /Ajouter mes images/ }));
  fireEvent.click(screen.getByRole("button", { name: "Choisir deux photos" }));
  expect(screen.getByRole("img", { name: "Produit" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Décor" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Quelle vidéo veux-tu créer ?" }), { target: { value: "Le produit apparaît dans ce décor" } });
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "Vérifier le prix" })).toBeDisabled();
  fireEvent.change(screen.getByRole("combobox", { name: "Rôle de Produit" }), { target: { value: "product" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Rôle de Décor" }), { target: { value: "background" } });
  expect(screen.getByRole("button", { name: "Vérifier le prix" })).toBeEnabled();
});

it("restaure le brouillon mais pas l’attestation ni le devis", async () => {
  mock.list.mockResolvedValue({ enabled: true, jobs: [] });
  const view = await mount(true, "draft-a");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "La caméra tourne autour du produit" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Type de plan" }), { target: { value: "detail" } });
  fireEvent.click(screen.getByRole("checkbox"));
  view.unmount();
  await mount(true, "draft-a");
  expect(screen.getByRole("textbox")).toHaveValue("La caméra tourne autour du produit");
  expect(screen.getByRole("combobox", { name: "Type de plan" })).toHaveValue("detail");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.queryByRole("button", { name: /Générer ce clip/ })).not.toBeInTheDocument();
});
