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
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "space" }));
vi.mock("@/hooks/use-branding", () => ({ useBrandCharter: () => ({ data: { visual_direction: { video_motion: "Plans calmes", light: "Fenêtre douce" } } }) }));
import { StudioVideoPanel } from "@/features/studio-video/StudioVideoPanel";

const quote = {
  id: "job", workspace_id: "space", source_kind: "photo", source_id: "photo",
  source_name: "Atelier", prompt: "La lumière traverse l'atelier", duration: 5,
  resolution: "480p", status: "quoted", estimated_usd: 0.72,
  estimated_credits: 72, quote_expires_at: new Date(Date.now() + 60_000).toISOString(),
  created_at: "", error_code: null, video_url: null,
};
const signedToken = `${Date.now() + 15 * 60_000}.${"a".repeat(64)}`;
const prepared = { summary: "Le produit est montré dans un plan doux avec un mouvement de caméra lent.",
  continuity: ["La table rouge garde la même couleur pendant tout le plan."],
  allowed_changes: "Le produit et les mains bougent.", forbidden_changes: "La table ne devient pas beige.",
  prompt: "Plan vidéo précis du produit, mouvement lent et lumière douce. La table reste rouge.", prepared_token: signedToken };
async function prepareAndConfirm() {
  fireEvent.click(screen.getByRole("button", { name: "Préparer avec Claude" }));
  expect(await screen.findByText(prepared.summary)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Oui, c’est bien ça" }));
}
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
    body.action === "prepare" ? prepared : body.action === "quote" ? { job: quote } : { job: { ...quote, status: "failed" } });
  mock.read.mockResolvedValue({ job: { ...quote, status: "failed" } });
  await mount();
  fireEvent.change(screen.getByRole("textbox", { name: "Ce qui doit bouger" }),
    { target: { value: quote.prompt } });
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "Vérifier le prix" })).toBeDisabled();
  await prepareAndConfirm();
  expect(screen.getByText(prepared.continuity[0])).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Vérifier le prix" }));
  expect(await screen.findByText(/Devis Higgsfield/)).toBeInTheDocument();
  expect(mock.request.mock.calls.map(([body]) => body.action)).toEqual(["prepare", "quote"]);
  expect(mock.request.mock.calls[1][0]).toMatchObject({ prompt: prepared.prompt,
    summary: prepared.summary, continuity: prepared.continuity, prepared_token: signedToken });
  fireEvent.click(screen.getByRole("button", { name: /Générer ce clip/ }));
  await waitFor(() => expect(mock.request.mock.calls.map(([body]) => body.action)).toEqual(["prepare", "quote", "submit"]));
});

it("propose le style vidéo de la marque dans une consigne modifiable sans lancer de génération", async () => {
  mock.list.mockResolvedValue({ enabled: true, jobs: [] });
  await mount(false);
  fireEvent.click(screen.getByRole("button", { name: "Reprendre mon style vidéo dans cette consigne" }));
  expect(screen.getByRole("textbox", { name: "Quelle vidéo veux-tu créer ?" })).toHaveValue("Style de ma marque : Plans calmes ; Fenêtre douce");
  expect(mock.request).not.toHaveBeenCalled();
});

it("ne tronque pas silencieusement l'idée quand le style de marque dépasse la limite", async () => {
  mock.list.mockResolvedValue({ enabled: true, jobs: [] });
  await mount(false);
  const idea = screen.getByRole("textbox", { name: "Quelle vidéo veux-tu créer ?" });
  const longIdea = "Un produit sur une table. " + "x".repeat(955);
  fireEvent.change(idea, { target: { value: longIdea } });
  fireEvent.click(screen.getByRole("button", { name: "Reprendre mon style vidéo dans cette consigne" }));
  expect(idea).toHaveValue(`${longIdea}\nStyle de ma marque : Plans calmes ; Fenêtre douce`);
  expect(screen.getByText(/La consigne complète dépasse 1000 caractères/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Préparer avec Claude" })).toBeDisabled();
});

it("écarte un devis arrivé après que la demande a changé", async () => {
  mock.list.mockResolvedValue({ enabled: true, jobs: [] });
  let finish: (value: unknown) => void = () => {};
  mock.request.mockImplementation(async (body: { action: string }) => body.action === "prepare" ? prepared : new Promise(resolve => { finish = resolve; }));
  await mount();
  const prompt = screen.getByRole("textbox", { name: "Ce qui doit bouger" });
  fireEvent.change(prompt, { target: { value: quote.prompt } });
  fireEvent.click(screen.getByRole("checkbox"));
  await prepareAndConfirm();
  fireEvent.click(screen.getByRole("button", { name: "Vérifier le prix" }));
  fireEvent.change(prompt, { target: { value: "Une autre idée" } });
  finish({ job: quote });
  await waitFor(() => expect(mock.list).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("button", { name: /Générer ce clip/ })).not.toBeInTheDocument();
});

it("invalide la validation dès que l'idée change avant le devis", async () => {
  mock.list.mockResolvedValue({ enabled: true, jobs: [] });
  mock.request.mockResolvedValue(prepared);
  await mount(false);
  const idea = screen.getByRole("textbox", { name: "Quelle vidéo veux-tu créer ?" });
  fireEvent.change(idea, { target: { value: "Un produit tourne sur une table" } });
  await prepareAndConfirm();
  expect(screen.getByRole("button", { name: "Vérifier le prix" })).toBeEnabled();
  fireEvent.change(idea, { target: { value: "Un produit avance sur une table" } });
  expect(screen.getByRole("button", { name: "Vérifier le prix" })).toBeDisabled();
  expect(screen.queryByText(prepared.summary)).not.toBeInTheDocument();
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
  mock.request.mockImplementation(async (body: { action: string }) => body.action === "prepare" ? prepared :
    { job: { ...quote, source_kind: "text", source_id: null } });
  await mount(false);
  fireEvent.change(screen.getByRole("textbox", { name: "Quelle vidéo veux-tu créer ?" }),
    { target: { value: "Une main ouvre une boîte dans un atelier lumineux" } });
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  await prepareAndConfirm();
  fireEvent.click(screen.getByRole("button", { name: "Vérifier le prix" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalled());
  expect(mock.request.mock.calls[1][0]).toMatchObject({ source_kind: "text", person_free_attested: false, aspect_ratio: "9:16" });
  expect(mock.request.mock.calls[1][0].source_id).toBeUndefined();
});

it("transmet les rôles et l'ordre de deux références avec le devis", async () => {
  mock.list.mockResolvedValue({ enabled: true, jobs: [] });
  mock.request.mockImplementation(async (body: { action: string }) => body.action === "prepare" ? prepared :
    { job: { ...quote, source_kind: "references", source_id: null } });
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
  await prepareAndConfirm();
  fireEvent.click(screen.getByRole("button", { name: "Vérifier le prix" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalled());
  expect(mock.request.mock.calls[0][0]).toMatchObject({ action: "prepare", source_kind: "references", references: [
    { kind: "photo", id: "photo-1", role: "product" }, { kind: "photo", id: "photo-2", role: "background" },
  ] });
  expect(mock.request.mock.calls[0][0].prompt).toBe("Le produit se révèle doucement dans ce décor\nCadrage : Gros plan.\nCaméra : La caméra tourne lentement autour du sujet.\nLumière : Lumière de studio diffuse.");
  expect(mock.request.mock.calls[1][0].prompt).toBe(prepared.prompt);
});

it("demande de confirmer le droit d’utiliser les images, y compris les portraits", async () => {
  mock.list.mockResolvedValue({ enabled: true, jobs: [] });
  await mount(false);
  fireEvent.click(screen.getByRole("radio", { name: "Une ou plusieurs images" }));
  fireEvent.click(screen.getByRole("button", { name: /Ajouter mes images/ }));
  fireEvent.click(screen.getByRole("button", { name: "Choisir deux photos" }));
  expect(screen.getByText(/Je confirme avoir le droit d’utiliser ces images/)).toBeInTheDocument();
  expect(screen.queryByText(/aucune personne identifiable/)).not.toBeInTheDocument();
});

it("retire la confirmation si un rôle, l'ordre des images ou un réglage change", async () => {
  mock.list.mockResolvedValue({ enabled: true, jobs: [] });
  mock.request.mockResolvedValue(prepared);
  await mount(false);
  fireEvent.click(screen.getByRole("radio", { name: "Une ou plusieurs images" }));
  fireEvent.click(screen.getByRole("button", { name: /Ajouter mes images/ }));
  fireEvent.click(screen.getByRole("button", { name: "Choisir deux photos" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Rôle de Produit" }), { target: { value: "product" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Rôle de Décor" }), { target: { value: "background" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Quelle vidéo veux-tu créer ?" }),
    { target: { value: "Le produit reste sur la même table" } });
  fireEvent.click(screen.getByRole("checkbox"));
  await prepareAndConfirm();
  fireEvent.change(screen.getByRole("combobox", { name: "Rôle de Décor" }), { target: { value: "style" } });
  expect(screen.getByRole("button", { name: "Vérifier le prix" })).toBeDisabled();
  await prepareAndConfirm();
  fireEvent.click(screen.getByRole("button", { name: "Avancer Décor" }));
  expect(screen.getByRole("button", { name: "Vérifier le prix" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  await prepareAndConfirm();
  fireEvent.change(screen.getByRole("combobox", { name: "Mouvement de caméra" }), { target: { value: "static" } });
  expect(screen.getByRole("button", { name: "Vérifier le prix" })).toBeDisabled();
  expect(mock.request.mock.calls.every(([body]) => body.action === "prepare")).toBe(true);
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
  expect(screen.getByRole("button", { name: "Préparer avec Claude" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Vérifier le prix" })).toBeDisabled();
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

it("reprend une préparation exacte après rechargement sans restaurer les confirmations", async () => {
  mock.list.mockResolvedValue({ enabled: true, jobs: [] });
  mock.request.mockResolvedValue(prepared);
  const view = await mount(true, "prepared-a");
  fireEvent.change(screen.getByRole("textbox", { name: "Ce qui doit bouger" }), { target: { value: "La caméra tourne autour du produit" } });
  fireEvent.click(screen.getByRole("checkbox"));
  await prepareAndConfirm();
  view.unmount();
  await mount(true, "prepared-a");
  expect(screen.getByText(prepared.summary)).toBeInTheDocument();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Vérifier le prix" })).toBeDisabled();
  expect(mock.request).toHaveBeenCalledTimes(1);
});

it("permet de reprendre uniquement son devis conservé avec un nouveau clic explicite", async () => {
  mock.list.mockResolvedValue({ enabled: true, jobs: [
    { ...quote, can_submit: true, preparation: { idea: "Un bol en mouvement", summary: prepared.summary, continuity: prepared.continuity } },
    { ...quote, id: "other", can_submit: false },
  ] });
  mock.request.mockResolvedValue({ job: { ...quote, status: "queued" } });
  mock.read.mockResolvedValue({ job: { ...quote, status: "queued" } });
  await mount(false);
  expect(mock.request).not.toHaveBeenCalled();
  const resume = screen.getByRole("button", { name: "Générer ce clip avec ce devis" });
  fireEvent.click(resume);
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({ action: "submit", job_id: "job" })));
});
