import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  request: vi.fn(),
  space: "A",
  role: "owner",
  user: "user",
  demo: false,
}));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: mock.user } }),
}));
vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({
    activeWorkspace: { id: mock.space, name: `Espace ${mock.space}` },
    activeRole: mock.role,
    loading: false,
  }),
}));
vi.mock("@/contexts/DemoContext", () => ({
  useDemoContext: () => ({ isDemoMode: mock.demo }),
}));
vi.mock("@/components/photos/PhotoLibraryPickerDialog", () => ({
  PhotoLibraryPickerDialog: () => null,
}));
vi.mock("@/features/visual-studio/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  studioRequest: mock.request,
  listStudioSessions: async () => [],
}));
import VisualStudioPage from "@/pages/VisualStudioPage";
import { draftKey, type StudioState } from "@/features/visual-studio/api";
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
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const element = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/photos/studio?session=session"]}>
        <VisualStudioPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...render(element), element };
}
beforeEach(() => {
  mock.request.mockReset();
  mock.space = "A";
  mock.role = "owner";
  mock.demo = false;
  mock.user = "user";
  localStorage.clear();
  Object.defineProperty(window, "innerWidth", { value: 1280, writable: true });
});
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
});
it("sending only interprets; explicit confirmation is locked against duplicate clicks", async () => {
  const start = original(),
    prepared = {
      ...start,
      session: { ...start.session, revision: 1, proposal },
    };
  let finish: (v: StudioState) => void = () => {};
  mock.request.mockImplementation((body) =>
    body.action === "read"
      ? Promise.resolve(start)
      : body.action === "message"
        ? Promise.resolve(prepared)
        : new Promise((r) => {
            finish = r;
          }),
  );
  mount();
  await screen.findByText("Décris ton fond.");
  fireEvent.change(screen.getByRole("textbox", { name: "Ta demande" }), {
    target: { value: "Un fond crème" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  const generate = await screen.findByRole("button", {
    name: /Générer cette image/,
  });
  expect(
    mock.request.mock.calls.filter(([b]) => b.action === "generate"),
  ).toHaveLength(0);
  fireEvent.click(generate);
  fireEvent.click(generate);
  await waitFor(() =>
    expect(
      mock.request.mock.calls.filter(([b]) => b.action === "generate"),
    ).toHaveLength(1),
  );
  await act(async () =>
    finish({
      ...prepared,
      session: { ...prepared.session, proposal: null },
      versions: [
        {
          id: "proposal",
          status: "processing",
          proposal,
          url: null,
          library_photo_id: null,
          error_message: null,
          created_at: "",
        },
      ],
    }),
  );
  await screen.findByText("Création en cours.");
});
it("a lost message acknowledgement preserves the text and request ID for retry", async () => {
  const start = original();
  let tries = 0;
  mock.request.mockImplementation((body) =>
    body.action === "read"
      ? Promise.resolve(start)
      : ++tries === 1
        ? Promise.reject(new Error("Connexion perdue"))
        : Promise.resolve({
            ...start,
            session: { ...start.session, revision: 1, proposal },
          }),
  );
  mount();
  await screen.findByText("Décris ton fond.");
  const input = screen.getByRole("textbox", { name: "Ta demande" });
  fireEvent.change(input, { target: { value: "Crème" } });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  await screen.findByRole("alert");
  expect(input).toHaveValue("Crème");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  await screen.findByRole("button", { name: /Générer cette image/ });
  const requests = mock.request.mock.calls.filter(
    ([b]) => b.action === "message",
  );
  expect(requests[0][0].request_id).toBe(requests[1][0].request_id);
});
it("late workspace A responses cannot replace workspace B or erase A’s draft", async () => {
  let finish: (v: StudioState) => void = () => {};
  mock.request.mockImplementation((body) =>
    body.action === "read"
      ? Promise.resolve({
          ...original(),
          session: {
            ...original().session,
            messages: [
              { role: "assistant", text: `Bienvenue ${body.workspace_id}` },
            ],
          },
        })
      : new Promise((r) => {
          finish = r;
        }),
  );
  const view = mount();
  await screen.findByText("Bienvenue A");
  fireEvent.change(screen.getByRole("textbox", { name: "Ta demande" }), {
    target: { value: "Mon brouillon A" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  mock.space = "B";
  view.rerender(
    <QueryClientProvider client={clients[0]}>
      <MemoryRouter initialEntries={["/photos/studio?session=session"]}>
        <VisualStudioPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText("Bienvenue B");
  await act(async () =>
    finish({
      ...original(),
      session: {
        ...original().session,
        proposal,
        messages: [{ role: "assistant", text: "Réponse A tardive" }],
      },
    }),
  );
  expect(screen.queryByText("Réponse A tardive")).toBeNull();
  expect(localStorage.getItem(draftKey("user", "A", "session"))).toBe(
    "Mon brouillon A",
  );
  expect(screen.getByRole("textbox", { name: "Ta demande" })).toHaveValue("");
});
it("viewer can read but cannot send or generate", async () => {
  mock.role = "viewer";
  const start = original();
  mock.request.mockResolvedValue({
    ...start,
    session: { ...start.session, proposal },
  });
  mount();
  await screen.findByRole("button", { name: /Générer cette image/ });
  expect(
    screen.getByRole("button", { name: /Générer cette image/ }),
  ).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Ta demande" })).toBeDisabled();
});
it("generated versions stay outside the library until an explicit save, with one save in flight", async () => {
  const start = original(),
    v = {
      id: "v1",
      status: "ready" as const,
      proposal,
      url: "/version.jpg",
      library_photo_id: null,
      error_message: null,
      created_at: "",
    };
  let saved = false;
  mock.request.mockImplementation((body) =>
    body.action === "read"
      ? Promise.resolve({
          ...start,
          versions: [
            { ...v, library_photo_id: saved ? "library-photo" : null },
          ],
        })
      : Promise.resolve().then(() => {
          saved = true;
          return { photo_id: "library-photo" };
        }),
  );
  mount();
  await screen.findByText(/pas encore dans la bibliothèque/);
  expect(mock.request.mock.calls.some(([b]) => b.action === "save")).toBe(
    false,
  );
  const button = screen.getByRole("button", {
    name: "Ajouter à la bibliothèque",
  });
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByRole("button", { name: "Dans la bibliothèque" });
  expect(
    mock.request.mock.calls.filter(([b]) => b.action === "save"),
  ).toHaveLength(1);
});
it("mobile drawer exposes the whole conversation and its confirmation", async () => {
  window.innerWidth = 390;
  const start = original();
  mock.request.mockResolvedValue({
    ...start,
    session: { ...start.session, proposal },
  });
  mount();
  await screen.findByText("Décris ton fond.");
  fireEvent.click(
    screen.getByRole("button", { name: /Toute la conversation/ }),
  );
  await screen.findByRole("dialog");
  fireEvent.click(
    screen.getByRole("button", { name: "Vérifier la proposition" }),
  );
  expect(
    screen.getByRole("button", { name: /Générer cette image/ }),
  ).toBeVisible();
});

it("a response preserves new text typed while the previous request was in flight", async () => {
  const start = original();
  let finish: (v: StudioState) => void = () => {};
  mock.request.mockImplementation((body) =>
    body.action === "read"
      ? Promise.resolve(start)
      : new Promise((r) => {
          finish = r;
        }),
  );
  mount();
  await screen.findByText("Décris ton fond.");
  const input = screen.getByRole("textbox", { name: "Ta demande" });
  fireEvent.change(input, { target: { value: "Fond crème" } });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  await waitFor(() =>
    expect(mock.request.mock.calls.some(([b]) => b.action === "message")).toBe(
      true,
    ),
  );
  fireEvent.change(input, { target: { value: "Et une lumière du matin" } });
  await act(async () =>
    finish({ ...start, session: { ...start.session, revision: 1, proposal } }),
  );
  expect(input).toHaveValue("Et une lumière du matin");
});
