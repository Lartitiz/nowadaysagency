import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Rendu réel de la page « Mon calendrier » (src/pages/Calendar.tsx, fiche 20 de
// docs/robustesse/gros-fichiers.md). Les grilles, filtres et fenêtres sont des
// faux qui exposent leurs props ; Supabase est un petit client en mémoire qui
// enregistre chaque appel (table + chaîne de méthodes).

type Appel = { table: string; ops: [string, any[]][] };
const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  demo: false,
  demoData: null as any,
  column: "user_id",
  value: "u1",
  db: {} as Record<string, any[]>,
  appels: [] as Appel[],
  props: {} as Record<string, any>,
  location: null as any,
  confirm: vi.fn(async () => true),
  move: vi.fn(async () => undefined),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: state.demo, demoData: state.demoData }) }));
vi.mock("@/hooks/use-workspace-query", () => ({
  useWorkspaceFilter: () => ({ column: state.column, value: state.value }),
  useWorkspaceId: () => state.value,
  useWorkspaceReady: () => true,
}));
vi.mock("@/hooks/use-profile", () => ({ useProfile: () => ({ data: null }) }));
vi.mock("@/hooks/use-active-series", () => ({ useAllSeriesMap: () => ({ data: undefined }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => state.confirm }));
vi.mock("sonner", () => ({ toast: state.toast }));
vi.mock("@/lib/idea-calendar-persistence", () => ({ planSavedIdea: vi.fn(), moveCalendarPost: state.move }));
vi.mock("@/lib/saved-idea-summaries", () => ({ loadFullIdea: vi.fn(), needsFullIdea: () => false }));

// Client Supabase en mémoire : filtre les lignes de state.db selon la chaîne.
vi.mock("@/integrations/supabase/client", () => {
  const METHODES = ["select", "eq", "is", "gte", "lte", "gt", "lt", "in", "order", "limit", "insert", "update", "delete", "single", "maybeSingle"];
  let n = 0;
  const executer = ({ table, ops }: Appel) => {
    const lignes = (state.db[table] ??= []);
    const op = (m: string) => ops.find(([x]) => x === m)?.[1];
    const garde = (r: any) => ops.every(([m, [c, v]]) =>
      m === "eq" ? r[c] === v : m === "is" ? (r[c] ?? null) === v : m === "gte" ? r[c] >= v : m === "lte" ? r[c] <= v
        : m === "gt" ? r[c] > v : m === "lt" ? r[c] < v : m === "in" ? v.includes(r[c]) : true);
    if (op("insert")) {
      const ligne = { id: `new-${++n}`, ...op("insert")[0] };
      lignes.push(ligne);
      return { data: op("single") ? ligne : [ligne], error: null };
    }
    let trouvees = lignes.filter(garde);
    if (op("update")) { trouvees.forEach((r) => Object.assign(r, op("update")[0])); return { data: null, error: null }; }
    if (op("delete")) { state.db[table] = lignes.filter((r) => !trouvees.includes(r)); return { data: null, error: null }; }
    const tri = op("order");
    if (tri) trouvees = [...trouvees].sort((a, b) => (a[tri[0]] < b[tri[0]] ? -1 : 1) * (tri[1]?.ascending === false ? -1 : 1));
    if (op("limit")) trouvees = trouvees.slice(0, op("limit")[0]);
    return { data: op("single") || op("maybeSingle") ? trouvees[0] ?? null : trouvees, error: null };
  };
  const from = (table: string) => {
    const appel: Appel = { table, ops: [] };
    state.appels.push(appel);
    const q: any = {};
    for (const m of METHODES) q[m] = (...a: any[]) => { appel.ops.push([m, a]); return q; };
    q.then = (ok: any, ko: any) => Promise.resolve().then(() => executer(appel)).then(ok, ko);
    return q;
  };
  return { supabase: { from, rpc: vi.fn() } };
});

// Faux composants : exposent leurs props dans state.props.
const { affichePosts, rien } = vi.hoisted(() => ({
  affichePosts: (p: any) => Object.values(p.postsByDate).flat().map((post: any) => <span key={post.id}>{post.theme}</span>),
  rien: () => null,
}));
vi.mock("@/components/calendar/CalendarGrid", () => ({ CalendarGrid: (p: any) => { state.props.grid = p; return <div>{affichePosts(p)}</div>; } }));
vi.mock("@/components/calendar/CalendarWeekGrid", () => ({ CalendarWeekGrid: (p: any) => { state.props.week = p; return <div>{affichePosts(p)}</div>; } }));
vi.mock("@/components/calendar/CalendarFilterBar", () => ({
  CalendarFilterBar: (p: any) => (
    <div>
      <p>filtre canal : {p.canalFilter}</p>
      <button onClick={() => p.onCanalChange("instagram")}>choisir Instagram</button>
      <button onClick={() => p.onSeriesChange("s1")}>choisir la série s1</button>
    </div>
  ),
}));
vi.mock("@/components/calendar/CalendarCoachingDialog", () => ({
  default: (p: any) => (p.open ? <div>coaching ouvert <button onClick={() => p.onOpenChange(false)}>fermer le coaching</button></div> : null),
}));
vi.mock("@/components/calendar/CalendarPostDialog", () => ({
  CalendarPostDialog: (p: any) => { state.props.dialog = p; return p.open ? <p>fenêtre du post ouverte</p> : null; },
}));
vi.mock("@/components/calendar/CalendarDndWrapper", () => ({ default: (p: any) => { state.props.dnd = p; return <>{p.children}</>; } }));
vi.mock("@/components/calendar/CalendarIdeasSidebar", () => ({ CalendarIdeasSidebar: rien }));
vi.mock("@/components/calendar/IdeaDetailSheet", () => ({ IdeaDetailSheet: rien }));
vi.mock("@/components/calendar/WeekDashboard", () => ({ WeekDashboard: rien }));
vi.mock("@/components/calendar/QuickBatchAdd", () => ({ QuickBatchAdd: rien }));
vi.mock("@/components/calendar/ImportContentDialog", () => ({ ImportContentDialog: rien }));
vi.mock("@/components/calendar/MarronnierBanner", () => ({ MarronnierBanner: rien }));
vi.mock("@/components/calendar/SeasonalPhotoDialog", () => ({ SeasonalPhotoDialog: rien }));
vi.mock("@/components/calendar/CalendarShareDialog", () => ({ CalendarShareDialog: rien }));
vi.mock("@/components/hub", () => ({ HubConnectBanner: rien }));
vi.mock("@/components/AuditRecommendationBanner", () => ({ default: rien }));
vi.mock("@/components/AppHeader", () => ({ default: rien }));
vi.mock("@/components/SubPageHeader", () => ({ default: rien }));
vi.mock("@/components/BrandingPrompt", () => ({ default: rien }));

import CalendarPage from "@/pages/Calendar";

function Sonde() {
  const location = useLocation();
  state.location = location;
  return <output aria-label="adresse">{location.pathname + location.search}</output>;
}

function rendre(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <CalendarPage embedded />
      <Sonde />
    </MemoryRouter>,
  );
}
const adresse = () => screen.getByLabelText("adresse").textContent;
const post = (champs: Record<string, any>) => ({ canal: "instagram", status: "idea", theme: "Sans titre", ...champs });

beforeEach(() => {
  state.user = { id: "u1" };
  state.demo = false;
  state.demoData = null;
  state.column = "user_id";
  state.value = "u1";
  state.db = {};
  state.appels = [];
  state.props = {};
  state.confirm.mockReset().mockResolvedValue(true);
  state.move.mockReset().mockResolvedValue(undefined);
  state.toast.mockReset(); state.toast.success.mockReset(); state.toast.error.mockReset();
});
afterEach(cleanup);

// ── Défaut 1 : paramètres d'URL à usage unique (?coaching=1, ?canal=) ──
it("?coaching=1 ouvre le coaching une seule fois : un autre changement d'URL ne le rouvre pas", async () => {
  rendre("/calendrier?coaching=1");
  expect(await screen.findByText("coaching ouvert")).toBeInTheDocument();
  await waitFor(() => expect(adresse()).toBe("/calendrier"));
  fireEvent.click(screen.getByRole("button", { name: "fermer le coaching" }));
  fireEvent.click(screen.getAllByRole("button", { name: "choisir la série s1" })[0]);
  await waitFor(() => expect(adresse()).toContain("serie=s1"));
  expect(screen.queryByText("coaching ouvert")).not.toBeInTheDocument();
});

it("?canal= règle le filtre à l'arrivée, puis ne l'impose plus après un autre changement d'URL", async () => {
  rendre("/calendrier?canal=linkedin");
  expect((await screen.findAllByText("filtre canal : linkedin")).length).toBeGreaterThan(0);
  await waitFor(() => expect(adresse()).toBe("/calendrier"));
  fireEvent.click(screen.getAllByRole("button", { name: "choisir Instagram" })[0]);
  fireEvent.click(screen.getAllByRole("button", { name: "choisir la série s1" })[0]);
  await waitFor(() => expect(adresse()).toContain("serie=s1"));
  expect(screen.getAllByText("filtre canal : instagram").length).toBeGreaterThan(0);
  expect(screen.queryByText("filtre canal : linkedin")).not.toBeInTheDocument();
});

it("retour du coaching (?post=&date=&canal=) : la fenêtre du post s'ouvre et l'URL est nettoyée", async () => {
  state.db.calendar_posts = [post({ id: "p1", user_id: "u1", date: "2026-10-12", canal: "linkedin", theme: "Mon post" })];
  rendre("/calendrier?post=p1&date=2026-10-12&canal=linkedin");
  expect(await screen.findByText("fenêtre du post ouverte")).toBeInTheDocument();
  expect(state.props.dialog.editingPost.id).toBe("p1");
  expect(screen.getAllByText("filtre canal : linkedin").length).toBeGreaterThan(0);
  await waitFor(() => expect(adresse()).toBe("/calendrier"));
});

// ── Défaut 2 : « Générer » sur un post sans route ouvre la fenêtre avec SA date ──
it("« Générer » sur un post sans format ouvre la fenêtre avec la date du post, et l'auto-save aboutit", async () => {
  state.db.calendar_posts = [post({ id: "p2", user_id: "u1", date: "2026-10-14", theme: "Sans format" })];
  rendre("/calendrier?date=2026-10-14");
  fireEvent.click((await screen.findAllByRole("button", { name: "Semaine" }))[0]);
  await screen.findByText("Sans format");
  act(() => state.props.week.onQuickGenerate({ ...state.db.calendar_posts[0] }));
  expect(await screen.findByText("fenêtre du post ouverte")).toBeInTheDocument();
  expect(state.props.dialog.editingPost.id).toBe("p2");
  expect(state.props.dialog.selectedDate).toBe("2026-10-14");
  const brouillon = { theme: "Sans format", angle: null, status: "idea", notes: "", canal: "instagram", objectif: null };
  let retour: any;
  await act(async () => { retour = await state.props.dialog.onAutoSave(brouillon, "p2"); });
  expect(retour).toEqual({});
  expect(state.appels.some((a) => a.table === "calendar_posts" && a.ops.some(([m]) => m === "update"))).toBe(true);
});

// ── Défaut 3 : le contenu le plus proche suit la même portée que fetchPosts ──
it("espace personnel : le plus proche hors période ignore les posts rangés dans un espace de travail", async () => {
  state.db.calendar_posts = [
    post({ id: "w1", user_id: "u1", workspace_id: "ws-cliente", date: "2026-11-02", theme: "Post d'un espace" }),
    post({ id: "m1", user_id: "u1", date: "2026-11-20", theme: "Mon post" }),
  ];
  rendre("/calendrier?date=2026-10-10");
  await waitFor(() => expect(state.props.grid?.nearestOutsidePost).toBeTruthy());
  expect(state.props.grid.nearestOutsidePost).toEqual({ date: "2026-11-20", direction: "future" });
});

// ── Défaut 4 : mode démo, aucune écriture ni lecture Supabase ──
it("mode démo : statut, déplacement (et annulation), suppressions restent locaux, sans aucun appel Supabase", async () => {
  state.demo = true;
  state.user = { id: "demo-user" }; // ce que pose AuthContext en démo
  state.value = "demo-user";
  state.demoData = { calendar_posts: [
    { title: "Portrait en lumière", format: "post", objective: "vente", planned_day: "2026-10-14" },
    { title: "Coulisses", format: "reel", objective: "confiance", planned_day: "2026-10-15" },
    { title: "Avant / après", format: "carousel", objective: "visibilite", planned_day: "2026-10-16" },
  ] };
  rendre("/calendrier?date=2026-10-14");
  fireEvent.click((await screen.findAllByRole("button", { name: "Semaine" }))[0]);
  await screen.findByText("Coulisses");
  const semaine = () => state.props.week;
  const duPost = (id: string) => Object.values(semaine().postsByDate).flat().find((p: any) => p.id === id) as any;

  await act(async () => { await semaine().onQuickStatusChange("demo-post-1", "ready"); });
  expect(duPost("demo-post-1").status).toBe("ready");

  let deplace: any;
  await act(async () => { deplace = await semaine().onMovePost("demo-post-1", "2026-10-17"); });
  expect(deplace).toBe(true);
  expect(duPost("demo-post-1").date).toBe("2026-10-17");
  const annuler = state.toast.mock.calls.at(-1)?.[1]?.action;
  await act(async () => { await annuler.onClick(); });
  expect(duPost("demo-post-1").date).toBe("2026-10-15");

  await act(async () => { await semaine().onQuickDelete("demo-post-1"); });
  expect(screen.queryByText("Coulisses")).not.toBeInTheDocument();
  await act(async () => { await state.props.dialog.onDelete("demo-post-0"); });
  expect(screen.queryByText("Portrait en lumière")).not.toBeInTheDocument();
  expect(screen.getByText("Avant / après")).toBeInTheDocument();

  expect(state.move).not.toHaveBeenCalled();
  expect(state.appels.map((a) => a.table)).toEqual([]);
});
