// Filet de la page Studio AVANT son découpage (fiche 4 de
// docs/robustesse/gros-fichiers.md, lot 0). Il complète visual-studio.test.tsx
// sur ce qu'aucun test ne couvrait : garde d'entrée, bandeau d'archive, largeur
// réglable, tiroir « Outils et créations », menu Options, galerie au-delà de
// 20 images, et un « instantané d'écran » (boutons visibles + appels serveur)
// sur 4 états. Les lots de découpage ne doivent changer aucun de ces tests.
//   npx vitest run src/test/visual-studio-page-net.test.tsx
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  request: vi.fn(),
  list: vi.fn(),
  older: vi.fn(),
  upload: vi.fn(),
  space: "A",
  role: "owner",
  user: "user",
  demo: false,
  loading: false,
  noWorkspace: false,
}));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: mock.user } }),
}));
vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({
    activeWorkspace: mock.noWorkspace ? null : { id: mock.space, name: `Espace ${mock.space}` },
    activeRole: mock.role,
    loading: mock.loading,
  }),
}));
vi.mock("@/components/photos/AvantApresDialog", () => ({
  AvantApresDialog: ({ onSaved }: { onSaved: (photo: { id: string }) => void }) =>
    <div role="dialog" aria-label="Avant / après test"><button onClick={() => onSaved({ id: "before-after-photo" })}>Enregistrer l’avant / après test</button></div>,
}));
vi.mock("@/components/photos/OfferMockupDialog", () => ({
  OfferMockupDialog: ({ onSaved }: { onSaved: (photo: { id: string }) => void }) =>
    <div role="dialog" aria-label="Mockup test"><button onClick={() => onSaved({ id: "mockup-photo" })}>Enregistrer le mockup test</button></div>,
}));
vi.mock("@/contexts/DemoContext", () => ({
  useDemoContext: () => ({ isDemoMode: mock.demo }),
}));
vi.mock("@/components/photos/PhotoLibraryPickerDialog", () => ({
  PhotoLibraryPickerDialog: ({ open, onConfirm, maxSelectable, unavailablePhotoIds }: {
    open: boolean;
    onConfirm: (photos: Array<{ id: string; name: string; kind: string }>) => void;
    maxSelectable: number;
    unavailablePhotoIds?: string[];
  }) => open ? <div role="dialog" aria-label="Choisir des photos de référence">
    <span>Places disponibles : {maxSelectable}</span>
    <span>Déjà choisies : {unavailablePhotoIds?.join(", ") || "aucune"}</span>
    <button onClick={() => onConfirm([
      { id: "product-one", name: "Bol face", kind: "produit" },
      { id: "ambience-two", name: "Atelier", kind: "ambiance" },
    ])}>Utiliser deux photos</button>
  </div> : null,
}));
vi.mock("@/components/photos/PhotoPreparationDialog", () => ({
  default: ({ initialRecipe, onSaved }: { initialRecipe?: { exposure?: number; format?: string }; onSaved?: (photo: {id:string}) => void }) =>
    <div>Préparation ouverte · {initialRecipe?.format || "post"} · {initialRecipe?.exposure || 0}
      <button onClick={() => onSaved?.({id:"prepared-photo"})}>Enregistrer la préparation test</button>
    </div>,
}));
vi.mock("@/features/studio-video/StudioVideoPanel", () => ({
  StudioVideoPanel: ({ initialSource, onPickClip }: { initialSource?: { kind: string; id: string } | null; onPickClip?: (job: { id: string }) => void }) =>
    <div>Source du clip : {initialSource?.kind || "aucune"} · {initialSource?.id || "aucune"}
      {onPickClip && <button onClick={() => onPickClip({ id: "clip-ready" })}>Choisir le clip prêt</button>}
    </div>,
}));
vi.mock("@/features/studio-video/VideoStudioSessions", () => ({
  VideoStudioSessions: ({ initialSource, onPickClip }: { initialSource?: { kind: string; id: string } | null; onPickClip?: (job: { id: string }) => void }) =>
    <div>Source du clip : {initialSource?.kind || "aucune"} · {initialSource?.id || "aucune"}
      {onPickClip && <button onClick={() => onPickClip({ id: "clip-ready" })}>Choisir le clip prêt</button>}
    </div>,
}));
vi.mock("@/features/visual-studio/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  studioRequest: mock.request,
  listStudioSessions: mock.list,
  listOlderStudioCompositions: mock.older,
}));
vi.mock("@/hooks/use-user-photos", () => ({
  useUploadLibraryPhotos: () => ({ mutate: mock.upload, progress: null, pendingUploads: [] }),
}));
import VisualStudioPage from "@/pages/VisualStudioPage";
import { draftKey, StudioRequestError, type StudioState } from "@/features/visual-studio/api";
const original = (): StudioState => ({
  session: {
    id: "session",
    workspace_id: mock.space,
    name: "Ma tasse",
    source_photo_id: "photo",
    source_url: "/source.jpg",
    revision: 0,
    messages: [{ role: "assistant", text: "Décris ton fond." }],
    proposal: null,
    updated_at: "",
    archived_at: null,
  },
  versions: [],
  writable: true,
  quota: { allowed: true, plan: "free" },
});
const proposal = {
  id: "proposal",
  operation: "background" as const,
  summary: "Un fond crème",
  background_prompt: "cream background",
  viewed_version_id: null,
  cost: 1 as const,
};
const clients: QueryClient[] = [];
function CurrentPath() { const location = useLocation(); return <><span hidden data-testid="current-path">{location.pathname + location.search}</span><span hidden data-testid="current-state">{JSON.stringify(location.state)}</span></>; }
function mount(path = "/photos/studio?session=session") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const element = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <VisualStudioPage />
        <CurrentPath />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...render(element), element };
}
beforeEach(() => {
  mock.request.mockReset();
  mock.list.mockReset();
  mock.older.mockReset();
  mock.upload.mockReset();
  mock.list.mockResolvedValue({ active: [], archived: [] });
  mock.space = "A";
  mock.role = "owner";
  mock.demo = false;
  mock.loading = false;
  mock.noWorkspace = false;
  mock.user = "user";
  localStorage.clear();
  Object.defineProperty(window, "innerWidth", { value: 1280, writable: true });
});

afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
});

function widen(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {},
    }),
  });
}
afterEach(() => widen(false));

const ready = (id: string, extra: Partial<StudioState["versions"][number]["proposal"]> = {}) => ({
  id, status: "ready" as const, proposal: { ...proposal, ...extra }, url: `/${id}.png`,
  library_photo_id: null, error_message: null, created_at: "",
});

// ── Garde d'entrée ──

it("garde d'entrée : chargement, aucun espace, démo — aucun appel au Studio", () => {
  mock.loading = true;
  mount();
  expect(screen.getByText("Chargement de ton espace…")).toBeInTheDocument();
  cleanup();
  mock.loading = false;
  mock.noWorkspace = true;
  mount();
  expect(screen.getByText("Sélectionne un espace pour ouvrir le Studio.")).toBeInTheDocument();
  cleanup();
  mock.noWorkspace = false;
  mock.demo = true;
  mount();
  expect(screen.getByText(/Le Studio photo est disponible dans ton espace connecté/)).toBeInTheDocument();
  expect(mock.request).not.toHaveBeenCalled();
});

it("une session archivée affiche son bandeau et se restaure depuis la page", async () => {
  const start = original();
  start.session.archived_at = "2026-09-28T00:00:00Z";
  start.session.revision = 3;
  mock.request.mockImplementation((body) => Promise.resolve(body.action === "restore"
    ? { ...start, session: { ...start.session, archived_at: null, revision: 4 } } : start));
  mount();
  expect(await screen.findByText("Cette session est archivée. Les échanges, versions et images enregistrées sont conservés.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Restaurer la session" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({ action: "restore", session_id: "session", revision: 3 })));
});

// ── Largeur réglable de la conversation ──

it("largeur de la conversation : flèches par pas de 24, bornes 340-760, double-clic pour revenir à 430", async () => {
  widen(true);
  localStorage.setItem("visual-studio-chat-width", "748");
  mock.request.mockResolvedValue(original());
  mount();
  await screen.findByText("Décris ton fond.");
  const handle = screen.getByRole("separator", { name: "Ajuster la largeur de la conversation" });
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(localStorage.getItem("visual-studio-chat-width")).toBe("760");
  fireEvent.keyDown(handle, { key: "ArrowLeft" });
  expect(localStorage.getItem("visual-studio-chat-width")).toBe("736");
  fireEvent.keyDown(handle, { key: "Enter" });
  expect(localStorage.getItem("visual-studio-chat-width")).toBe("736");
  fireEvent.doubleClick(handle);
  expect(localStorage.getItem("visual-studio-chat-width")).toBe("430");
  for (let i = 0; i < 6; i++) fireEvent.keyDown(handle, { key: "ArrowLeft" });
  expect(localStorage.getItem("visual-studio-chat-width")).toBe("340");
  const grid = handle.closest(".studio-grid") as HTMLElement;
  expect(grid.style.gridTemplateColumns).toBe("340px minmax(0, 1fr)");
});

it("largeur hors bornes en mémoire : la conversation repart à 430, et pas de poignée sur petit écran", async () => {
  widen(true);
  localStorage.setItem("visual-studio-chat-width", "9999");
  mock.request.mockResolvedValue(original());
  mount();
  await screen.findByText("Décris ton fond.");
  const grid = screen.getByRole("separator", { name: "Ajuster la largeur de la conversation" }).closest(".studio-grid") as HTMLElement;
  expect(grid.style.gridTemplateColumns).toBe("430px minmax(0, 1fr)");
  cleanup();
  widen(false);
  mount();
  await screen.findByText("Décris ton fond.");
  expect(screen.queryByRole("separator", { name: "Ajuster la largeur de la conversation" })).toBeNull();
});

// ── Tiroir « Outils et créations » ──

it("tiroir d'outils : photo proposée (sujet), charte (index), compositions plus anciennes (20 + n)", async () => {
  const state = original();
  state.session.revision = 5;
  state.suggested_photos = [{ id: "suggested", name: "Bol bleu", url: "/bol.jpg" }];
  state.charter_references = [{ index: 2, name: "Ambiance lin", url: "/lin.jpg" }];
  state.composition_history = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, title: `Affiche ${i}`, created_at: "2026-10-01T10:00:00Z" }));
  mock.request.mockResolvedValue(state);
  mock.older.mockResolvedValue({ items: [{ id: "c-old", title: "Ancienne affiche", created_at: "2026-09-01T10:00:00Z" }], hasMore: false });
  mount();
  await screen.findByText("Décris ton fond.");
  fireEvent.click(screen.getByRole("button", { name: /Outils et créations/ }));
  fireEvent.click(await screen.findByRole("button", { name: /Choisir Bol bleu/ }));
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({
    action: "reference", photo_id: "suggested", reference_role: "subject", revision: 5,
  })));
  fireEvent.click(screen.getByRole("button", { name: /Utiliser Ambiance lin/ }));
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({
    action: "reference", charter_index: 2, revision: 5,
  })));
  expect(screen.getByText("Compositions enregistrées · 20+")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Voir les compositions plus anciennes" }));
  await waitFor(() => expect(mock.older).toHaveBeenCalledWith("A", "session", 20));
  expect(await screen.findByRole("button", { name: /Reprendre Ancienne affiche/ })).toBeInTheDocument();
  expect(screen.getByText("Compositions enregistrées · 21")).toBeInTheDocument();
});

it("tiroir d'outils : « Reprendre » une composition la relit sur le serveur", async () => {
  const state = original();
  state.composition_history = [{ id: "c1", title: "Affiche du salon", created_at: "2026-10-01T10:00:00Z" }];
  mock.request.mockImplementation((body) => Promise.resolve(body.action === "composition_read"
    ? { composition: { id: "c1", design: { version: 1, format: "square", background: { color: "#fff" }, layers: [] }, background_url: null } }
    : state));
  mount();
  await screen.findByText("Décris ton fond.");
  fireEvent.click(screen.getByRole("button", { name: /Outils et créations/ }));
  fireEvent.click(await screen.findByRole("button", { name: /Reprendre Affiche du salon/ }));
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({
    action: "composition_read", workspace_id: "A", session_id: "session", composition_history_id: "c1",
  })));
});

// ── Menu Options ──

it("menu Options : avant / après et mockup renvoient l'image enregistrée comme composition", async () => {
  const state = original();
  state.session.revision = 2;
  mock.request.mockResolvedValue(state);
  mount();
  await screen.findByText("Décris ton fond.");
  await userEvent.click(screen.getByRole("button", { name: "Options" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Avant / après" }));
  fireEvent.click(await screen.findByRole("button", { name: "Enregistrer l’avant / après test" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({
    action: "reference", photo_id: "before-after-photo", reference_role: "composition", revision: 2,
  })));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Avant / après test" })).toBeNull());
  await userEvent.click(screen.getByRole("button", { name: "Options" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Mockup d’offre" }));
  fireEvent.click(await screen.findByRole("button", { name: "Enregistrer le mockup test" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({
    action: "reference", photo_id: "mockup-photo", reference_role: "composition", revision: 2,
  })));
});

// ── Galerie ──

it("galerie : au-delà de 20 images, « Voir les images plus anciennes » affiche les suivantes", async () => {
  const state = original();
  state.versions = Array.from({ length: 23 }, (_, i) => ready(`v${i + 1}`));
  mock.request.mockResolvedValue(state);
  mount();
  await screen.findByText("Décris ton fond.");
  const gallery = screen.getByRole("region", { name: "Visuels et versions" });
  expect(within(gallery).getByText("23 images")).toBeInTheDocument();
  expect(within(gallery).queryByText("Image 3")).toBeNull();
  expect(within(gallery).getByText("Image 4")).toBeInTheDocument();
  fireEvent.click(within(gallery).getByRole("button", { name: "Voir les images plus anciennes" }));
  expect(within(gallery).getByText("Image 1")).toBeInTheDocument();
  expect(within(gallery).queryByRole("button", { name: "Voir les images plus anciennes" })).toBeNull();
});

// ── Instantané d'écran (filet global) ──

async function screenshot(state: StudioState | null, path?: string) {
  if (state) mock.request.mockResolvedValue(state);
  mount(path);
  if (state) await screen.findByText(state.session.messages[0].text);
  else await screen.findByRole("textbox", { name: "Ta demande" });
  await waitFor(() => expect(mock.request.mock.calls.length).toBeGreaterThanOrEqual(state ? 1 : 0));
  return {
    buttons: screen.getAllByRole("button").map((b) => `${b.textContent?.replace(/\s+/g, " ").trim() || ""}${b.getAttribute("aria-label") ? ` [${b.getAttribute("aria-label")}]` : ""}${(b as HTMLButtonElement).disabled ? " (inactif)" : ""}`),
    headings: screen.queryAllByRole("heading").map((h) => h.textContent?.replace(/\s+/g, " ").trim()),
    requests: mock.request.mock.calls.map(([body]) => Object.keys(body).sort().join(",") + " · " + body.action),
  };
}

it("instantané d'écran : sans session", async () => {
  expect(await screenshot(null, "/photos/studio")).toMatchSnapshot();
});

it("instantané d'écran : proposition à confirmer", async () => {
  const state = original();
  state.session.proposal = { ...proposal, operation: "create", summary: "Une tasse sur un plan de travail en bois" };
  expect(await screenshot(state)).toMatchSnapshot();
});

it("instantané d'écran : série en échec partiel", async () => {
  const state = original();
  state.versions = [
    ready("ok-1", { series_size: 3, series_index: 0 }),
    ...["failed-2", "failed-3"].map((id, index) => ({ id, status: "failed" as const, created_at: "", url: null, library_photo_id: null,
      error_message: "Échec de cet essai", proposal: { ...proposal, series_size: 3, series_index: index + 1 } })),
  ];
  expect(await screenshot(state)).toMatchSnapshot();
});

it("instantané d'écran : intégration prête après une scène", async () => {
  const state = original();
  state.quota.plan = "premium";
  state.generative_allowed = true;
  state.session.references = [{ id: "product", photo_id: "p", name: "Assiette", role: "product", url: "/plate.jpg" }];
  state.versions = [
    ready("scene", { operation: "create", scene_workflow: { phase: "scene", camera_match: "Face" } }),
    ready("integration", { operation: "create", scene_workflow: { phase: "integration", camera_match: "Face" } }),
  ];
  expect(await screenshot(state)).toMatchSnapshot();
});

// ── Relance mannequin et affiche ──

it("relance mannequin : « Préparer la scène » envoie la demande, « Le garder pour ma marque » ouvre la mémoire", async () => {
  const state = original();
  state.session.revision = 4;
  state.session.references = [{ id: "bol", photo_id: "b", name: "Bol", role: "product", url: "/bol.jpg" }];
  state.versions = [ready("casting", {
    operation: "create",
    person_reference: { mode: "identity_sheet", name: "Nora fictive", stable_traits: "42 ans", variable_details: "", views: [] },
  } as never)];
  mock.request.mockImplementation((body) => Promise.resolve(body.action === "message"
    ? { ...state, session: { ...state.session, revision: 5, messages: [...state.session.messages, { role: "user", text: body.message }] } }
    : state));
  mount();
  expect(await screen.findByText("Voilà ton mannequin. Prochaine étape : la photo portée, avec « Bol ». Tu veux que je prépare la scène ?")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Le garder pour ma marque" }));
  expect(await screen.findByRole("dialog", { name: "Mémoire de marque" })).toBeInTheDocument();
  fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Mémoire de marque" })).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Préparer la scène avec « Bol »" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({
    action: "message",
    message: "Ce mannequin me convient. Prépare maintenant la scène : elle porte « Bol », dans la direction artistique choisie.",
    viewed_version_id: "casting",
    revision: 4,
  })));
  const sent = mock.request.mock.calls.find(([body]) => body.action === "message")![0];
  expect({ reference_ids: sent.reference_ids, branch_reference_mode: sent.branch_reference_mode }).toMatchSnapshot();
});

it("« Corriger les textes de cette affiche » ouvre l'éditeur de composition", async () => {
  const state = original();
  state.session.messages = [{ role: "assistant", text: "Voici ton affiche.", operation: "compose",
    composition: { version: 1, format: "square", background: { color: "#fff" }, layers: [] } } as never];
  mock.request.mockResolvedValue(state);
  mount();
  await screen.findByText("Voici ton affiche.");
  fireEvent.click(screen.getByRole("button", { name: "Corriger les textes de cette affiche" }));
  expect(await screen.findByRole("dialog", { name: "Finaliser mon visuel" })).toBeInTheDocument();
  expect(mock.request.mock.calls.every(([body]) => body.action === "read")).toBe(true);
});
