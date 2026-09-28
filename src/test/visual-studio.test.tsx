import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  request: vi.fn(),
  list: vi.fn(),
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
vi.mock("@/features/visual-studio/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  studioRequest: mock.request,
  listStudioSessions: mock.list,
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
function CurrentPath() { const location = useLocation(); return <span hidden data-testid="current-path">{location.pathname + location.search}</span>; }
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
  mock.list.mockResolvedValue({ active: [], archived: [] });
  mock.space = "A";
  mock.role = "owner";
  mock.demo = false;
  mock.user = "user";
  localStorage.clear();
  Object.defineProperty(window, "innerWidth", { value: 1280, writable: true });
});
it("archives a session without deleting it and offers restoration", async () => {
  const start = original();
  mock.request.mockImplementation((body) => Promise.resolve(
    body.action === "read" ? start : {
      ...start,
      session: { ...start.session, archived_at: body.action === "archive" ? "2026-09-28T00:00:00Z" : null, revision: 1 },
    },
  ));
  mock.list.mockResolvedValue({ active: [{ id: "session", name: "Ma tasse", revision: 0, archived_at: null }], archived: [] });
  mount();
  await screen.findByText("Décris ton fond.");
  fireEvent.click(screen.getByRole("button", { name: "Mes sessions" }));
  fireEvent.click(await screen.findByRole("button", { name: "Archiver Ma tasse" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({
    action: "archive", session_id: "session", revision: 0,
  })));
  await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent("/photos/studio"));
  expect(screen.getByTestId("current-path")).not.toHaveTextContent("session=session");
  mock.list.mockResolvedValue({ active: [], archived: [{ id: "session", name: "Ma tasse", revision: 1, archived_at: "2026-09-28T00:00:00Z" }] });
  fireEvent.click(screen.getByRole("button", { name: "Mes sessions" }));
  fireEvent.click(await screen.findByRole("button", { name: "Restaurer Ma tasse" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({
    action: "restore", session_id: "session", revision: 1,
  })));
});
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
});
it("ouvre les clips sans quitter la session photo et reprend la version sélectionnée", async () => {
  mock.request.mockResolvedValue({ ...original(), versions: [{
    id: "version-ready", status: "ready", proposal, url: "/version.png",
    library_photo_id: null, error_message: null, created_at: "",
  }] });
  mount();
  await screen.findByText("Décris ton fond.");
  fireEvent.click(screen.getByRole("button", { name: "Animer cette image en vidéo" }));
  expect(await screen.findByText("Source du clip : studio_version · version-ready")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Photos" }));
  expect(screen.getByText("Décris ton fond.")).toBeInTheDocument();
});
it("shows an uncertain provider outcome without offering an unsafe retry", async () => {
  mock.request.mockResolvedValue({ ...original(), versions: [{
    id: "unknown", status: "uncertain", proposal, url: null,
    library_photo_id: null, error_message: "Réponse fournisseur perdue.", created_at: "",
  }] });
  mount();
  expect(await screen.findByText("Réponse fournisseur perdue.")).toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Réessayer cette image seulement"})).not.toBeInTheDocument();
});
it("opens deterministic preparation from the chat and returns the saved copy", async () => {
  const state: StudioState = { ...original(), session: {
    ...original().session, messages: [{role:"assistant",text:"Éclaircir sans redessiner",operation:"existing_tool",existing_tool:"preparation",preparation:{exposure:0.2,format:"post"},viewed_version_id:"v1"}],
  }, versions: [{id:"v1",status:"ready",proposal,url:"/studio-image.jpg",library_photo_id:null,error_message:null,created_at:""}] };
  mock.request.mockResolvedValue(state);
  const fetchMock = vi.spyOn(globalThis,"fetch").mockResolvedValue({
    ok: true,
    blob: async () => new Blob(["source"], {type:"image/jpeg"}),
  } as Response);
  try {
    mount();
    fireEvent.click(await screen.findByRole("button", {name:"Préparer cette photo sans la redessiner"}));
    expect(await screen.findByText("Préparation ouverte · post · 0.2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name:"Enregistrer la préparation test"}));
    await waitFor(() => expect(mock.request.mock.calls.some(([body]) => body.action === "reference" && body.photo_id === "prepared-photo")).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith("/studio-image.jpg");
  } finally { fetchMock.mockRestore(); }
});
it("revient de Photo via Vidéo au passage d'origine du Reel", async () => {
  mock.request.mockResolvedValue({ ...original(), versions: [{
    id: "version-ready", status: "ready", proposal, url: "/version.png",
    library_photo_id: null, error_message: null, created_at: "",
  }] });
  mount("/photos/studio?session=session&reel_passage=1");
  await screen.findByRole("button", { name: "Animer cette image en vidéo" });
  fireEvent.click(screen.getByRole("button", { name: "Animer cette image en vidéo" }));
  expect(screen.getByText("Source du clip : studio_version · version-ready")).toBeInTheDocument();
  expect(screen.getByTestId("current-path")).toHaveTextContent("reel_passage=1");
  fireEvent.click(screen.getByRole("button", { name: "Choisir le clip prêt" }));
  expect(screen.getByTestId("current-path")).toHaveTextContent("/creer?studio_passage=1&studio_clip=clip-ready");
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
  await screen.findByRole("dialog");
  fireEvent.click(
    screen.getByRole("button", { name: "Fermer la conversation" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 3000 });
  fireEvent.click(
    await screen.findByRole("button", { name: /Toute la conversation/ }),
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

it("a question starts a source-free session and prepares without generating", async () => {
  const start = original();
  start.session.source_photo_id = null;
  start.session.source_url = null;
  start.session.references = [];
  mock.request.mockImplementation((body) =>
    Promise.resolve(
      body.action === "message"
        ? {
            ...start,
            session: {
              ...start.session,
              messages: [
                {
                  role: "assistant",
                  text: "Une illustration pour ton atelier.",
                },
              ],
              revision: 1,
              proposal: {
                ...proposal,
                operation: "create",
                image_prompt: "Illustration",
              },
            },
          }
        : start,
    ),
  );
  mount("/photos/studio");
  fireEvent.change(screen.getByRole("textbox", { name: "Ta demande" }), {
    target: { value: "Quel visuel pour mon atelier ?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  await screen.findByText("Une illustration pour ton atelier.");
  const actions = mock.request.mock.calls.map(([b]) => b);
  expect(actions.find((b) => b.action === "create")).not.toHaveProperty(
    "photo_id",
  );
  expect(actions.filter((b) => b.action === "message")).toHaveLength(1);
  expect(actions.some((b) => b.action === "generate")).toBe(false);
});
it("generative Premium gating is visible before confirmation", async () => {
  const start = original();
  mock.request.mockResolvedValue({
    ...start,
    generative_allowed: false,
    session: {
      ...start.session,
      proposal: { ...proposal, operation: "create" },
    },
  });
  mount();
  await screen.findByText(/Cette création est réservée à Premium/);
  expect(
    screen.getByRole("button", { name: /Générer cette image/ }),
  ).toBeDisabled();
});
it("editing an older selected version sends that parent, not the latest", async () => {
  const start = original();
  const v = (id: string) => ({
    id,
    status: "ready",
    proposal,
    url: `/${id}.jpg`,
    library_photo_id: null,
    error_message: null,
    created_at: "",
  });
  mock.request.mockResolvedValue({ ...start, versions: [v("v1"), v("v2")] });
  mount();
  await screen.findByRole("button", { name: "Version 1" });
  fireEvent.click(screen.getByRole("button", { name: "Version 1" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Ta demande" }), {
    target: { value: "Garde la scène, enlève la plante" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  await waitFor(() =>
    expect(
      mock.request.mock.calls.find(([b]) => b.action === "message")?.[0]
        .viewed_version_id,
    ).toBe("v1"),
  );
});
it("changing a reference role clears confirmation without generating", async () => {
  const start = original();
  const ref = {
    id: "ref",
    photo_id: "photo",
    name: "Bol",
    role: "subject",
    url: "/bol.jpg",
  };
  mock.request.mockImplementation((body) =>
    Promise.resolve({
      ...start,
      session: {
        ...start.session,
        proposal: body.action === "reference" ? null : proposal,
        references: [
          { ...ref, role: body.action === "reference" ? "style" : "subject" },
        ],
      },
    }),
  );
  mount();
  await screen.findByRole("combobox", { name: "Rôle de Bol" });
  fireEvent.change(screen.getByRole("combobox", { name: "Rôle de Bol" }), {
    target: { value: "style" },
  });
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: /Générer cette image/ }),
    ).toBeNull(),
  );
  expect(
    mock.request.mock.calls.find(([b]) => b.action === "reference")?.[0],
  ).toMatchObject({ reference_role: "style", reference_id: "ref", revision: 0 });
  expect(mock.request.mock.calls.some(([b]) => b.action === "generate")).toBe(
    false,
  );
});

it("the first mobile question keeps the conversation open after creating its session", async () => {
  window.innerWidth = 390;
  const start = original();
  start.session.source_photo_id = null;
  start.session.source_url = null;
  start.session.references = [];
  mock.request.mockImplementation((body) =>
    Promise.resolve(
      body.action === "message"
        ? {
            ...start,
            session: {
              ...start.session,
              messages: [
                {
                  role: "assistant",
                  text: "Une direction graphique pour ton atelier.",
                },
              ],
              revision: 1,
            },
          }
        : start,
    ),
  );
  mount("/photos/studio");
  fireEvent.click(
    await screen.findByRole("button", { name: /Toute la conversation/ }),
  );
  await screen.findByRole("dialog");
  fireEvent.change(screen.getByRole("textbox", { name: "Ta demande" }), {
    target: { value: "Quel visuel pour mon atelier ?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  await waitFor(() =>
    expect(
      within(screen.getByRole("dialog")).getByText(
        "Une direction graphique pour ton atelier.",
      ),
    ).toBeVisible(),
  );
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(mock.request.mock.calls.some(([b]) => b.action === "generate")).toBe(
    false,
  );
});

it("a persisted reply recovered after a lost acknowledgement clears only its own draft", async () => {
  const start = original();
  let received: string | null = null;
  mock.request.mockImplementation((body) => {
    if (body.action === "message") {
      received = body.request_id;
      return Promise.reject(new Error("Réponse perdue"));
    }
    return Promise.resolve(
      received
        ? {
            ...start,
            session: {
              ...start.session,
              revision: 1,
              proposal,
              messages: [
                ...start.session.messages,
                { role: "user", id: received, text: "Fond crème" },
                { role: "assistant", text: "Proposition retrouvée" },
              ],
            },
          }
        : start,
    );
  });
  mount();
  await screen.findByText("Décris ton fond.");
  fireEvent.change(screen.getByRole("textbox", { name: "Ta demande" }), {
    target: { value: "Fond crème" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  await screen.findByText("Proposition retrouvée");
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Ta demande" })).toHaveValue(""),
  );
  expect(screen.getByRole("button", { name: "Envoyer" })).toBeDisabled();
  expect(
    mock.request.mock.calls.filter(([b]) => b.action === "message"),
  ).toHaveLength(1);
});

it("annonce le coût complet d’une série et permet un pilote avant toute génération", async () => {
 const state=original();state.session.proposal={...proposal,operation:'create',cost:3,shots:[{id:'two',summary:'Un détail',image_prompt:'Detail',format:'square'},{id:'three',summary:'En situation',image_prompt:'Scene',format:'portrait'}]};
 mock.request.mockResolvedValue(state);mount();
 expect(await screen.findByText('Un détail')).toBeInTheDocument();
 const pilot=await screen.findByRole('button',{name:/D’abord une image pilote/});fireEvent.click(pilot);
 await waitFor(()=>expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({action:'pilot',proposal_id:proposal.id,revision:state.session.revision})));
 expect(mock.request.mock.calls.some(([p])=>p.action==='generate')).toBe(false);
});
it("une série partielle conserve un accès à chaque échec sans relancer les images réussies",async()=>{
 const state=original();state.versions=['failed-1','failed-2'].map((id,index)=>({id,status:'failed',created_at:'',url:null,library_photo_id:null,error_message:'Échec de cet essai',proposal:{...proposal,series_size:3,series_index:index}}));
 mock.request.mockResolvedValue(state);mount();
 const retries=await screen.findAllByRole('button',{name:'Réessayer cette image seulement'});expect(retries).toHaveLength(2);fireEvent.click(retries[1]);
 await waitFor(()=>expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({action:'retry',version_id:'failed-2'})));
 expect(mock.request.mock.calls.some(([p])=>p.action==='generate')).toBe(false);
});

it("le bouton proposé par le chat attache réellement la mémoire avant une création",async()=>{
 const state=original();state.memory=[{id:'casting',kind:'casting',name:'Anna',note:'Fictive',revision:0,references:[]}];state.session.messages=[{role:'assistant',text:'Choisis la référence',suggested_memory_ids:['casting']}];mock.request.mockResolvedValue(state);mount();fireEvent.click(await screen.findByRole('button',{name:'Utiliser ce mannequin · Anna'}));await waitFor(()=>expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({action:'memory_apply',memory_id:'casting'})));expect(mock.request.mock.calls.some(([p])=>p.action==='generate')).toBe(false);
});
