import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { coachingDatabase } from "./coaching-fixtures";
const m = vi.hoisted(() => ({ scope: "A", owner: "owner", from: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), navigate: vi.fn(), confirm: vi.fn(), compute: vi.fn(), toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: m.from, rpc: m.rpc } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceReady: () => true, useWorkspaceFilter: () => ({ column: "workspace_id", value: m.scope }), useWorkspaceId: () => m.scope, useProfileUserId: () => m.owner }));
vi.mock("@/hooks/use-branding", () => ({ useEditorialLine: () => ({ data: null }) }));
vi.mock("@/hooks/use-profile", () => ({ useProfile: () => ({ data: {} }) }));
// The old flow's duplicate helper sees an initially empty calendar in the
// before/after date and refresh regressions. The corrected flow reads the fixture.
vi.mock("@/lib/calendar-duplicates", async importOriginal => ({ ...(await importOriginal<any>()), dropAlreadyPlanned: async (rows: any[]) => ({ fresh: rows, duplicates: [] }) }));
vi.mock("@/lib/plan-engine", () => ({ computePlan: m.compute }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: m.invoke }));
vi.mock("react-router-dom", () => ({ useNavigate: () => m.navigate }));
vi.mock("sonner", () => ({ toast: m.toast }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/SubPageHeader", () => ({ default: () => null }));
vi.mock("@/components/launch/LaunchStoriesPlanning", () => ({ default: () => null }));
vi.mock("@/components/SaveToIdeasDialog", () => ({ SaveToIdeasDialog: () => null }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => m.confirm }));
vi.mock("@/components/coaching/CoachingShell", () => ({ default: ({ open, children }: any) => open ? <div>{children}</div> : null }));
vi.mock("@/components/plan/PlanSetup", () => ({ default: ({ onSubmit, saving }: any) => <button disabled={saving} onClick={() => onSubmit({ weekly_time: "1h", main_goal: "visibility", channels: ["linkedin"] })}>Enregistrer la stratégie</button> }));
vi.mock("@/components/plan/PlanView", () => ({ default: ({ plan, onToggleStep, onEditConfig }: any) => <div>{plan.config.main_goal}<button onClick={() => onToggleStep("step1", "done")}>Cocher</button><button onClick={onEditConfig}>Modifier configuration</button></div> }));
vi.mock("@/components/plan/CoachPlanManager", () => ({ default: () => null }));
vi.mock("@/components/ui/input-with-voice", () => ({ InputWithVoice: ({ onValueChange, ...p }: any) => <input {...p} /> }));
vi.mock("@/components/ui/textarea-with-voice", () => ({ TextareaWithVoice: ({ onValueChange, ...p }: any) => <textarea {...p} /> }));
import CalendarCoachingDialog from "@/components/calendar/CalendarCoachingDialog";
import InstagramLaunchPlan from "@/pages/InstagramLaunchPlan";
import InstagramLaunchRecommendation from "@/pages/InstagramLaunchRecommendation";
import CommPlanPage from "@/pages/CommPlanPage";
let db: ReturnType<typeof coachingDatabase>;
const proposal = { planning: [{ day: "Lundi", subject: "Conseil", pillar: "Métier", format: "carousel", objective: "eduquer", hook_idea: "Premier texte" }, { day: "Dimanche", subject: "Lettre", pillar: "Métier", format: "newsletter", objective: "lien", hook_idea: "Bonjour" }], week_theme: "Une semaine", tip: "Conseil de rythme" };
beforeEach(() => {
  vi.clearAllMocks(); m.scope = "A"; m.owner = "owner"; m.confirm.mockResolvedValue(true);
  db = coachingDatabase({ calendar_posts: [], launches: [{ id: "launch", user_id: "owner", workspace_id: "A", name: "Mon offre", plan_generated: true, phases: [{ name: "vente", label: "Vente" }] }], launch_plan_contents: [{ id: "s1", launch_id: "launch", workspace_id: "A", phase: "vente", content_date: "2040-01-01", format: "post", content_type: "Offre", objective: "Vendre" }, { id: "s2", launch_id: "launch", workspace_id: "A", phase: "vente", content_date: "2040-01-02", format: "post", content_type: "Suite", objective: "Lien" }], user_plan_config: [], user_plan_overrides: [], coach_exercises: [], plan_step_visibility: [] });
  m.from.mockImplementation(db.from); m.invoke.mockResolvedValue({ data: proposal });
  m.compute.mockImplementation(async (_, config) => ({ config, phases: [], totalCount: 1, totalMinutesRemaining: 5 }));
  m.rpc.mockImplementation(async (_fn, args) => ({ data: { launch_id: "launch", inserted: args.p_slot_ids.length, preserved: 0, refreshed: 0, items: args.p_slot_ids.map((id: string) => ({ slot_id: id, post_id: `post-${id}`, date: "2040-01-01" })) } }));
});
afterEach(cleanup);
async function generate() {
  fireEvent.click(screen.getByRole("button", { name: "2" }));
  fireEvent.click(screen.getByRole("button", { name: "Rien de spécial" }));
  fireEvent.click(screen.getByRole("button", { name: /Mix de mes piliers/ }));
  fireEvent.click(screen.getByRole("button", { name: "Planifier ma semaine" }));
  await screen.findByText(/Une semaine/);
}
it("uses the actual selected week and keeps the newsletter channel", async () => {
  render(<CalendarCoachingDialog open onOpenChange={vi.fn()} weekStartDate="2040-01-02" defaultCanal="linkedin" />);
  await generate();
  fireEvent.click(screen.getByRole("button", { name: /Tout ajouter/ }));
  await waitFor(() => expect(db.rows.calendar_posts).toHaveLength(2));
  expect(db.rows.calendar_posts[0]).toMatchObject({ date: "2040-01-02", canal: "linkedin", format: "carousel" });
  expect(db.rows.calendar_posts[1]).toMatchObject({ date: "2040-01-08", canal: "newsletter", format: "newsletter" });
  expect(m.invoke.mock.calls[0][1].body).toMatchObject({ week_start: "2040-01-02", canal: "linkedin" });
});
it("keeps proposals and partial receipts when the parent refreshes existing posts", async () => {
  const view = render(<CalendarCoachingDialog open onOpenChange={vi.fn()} existingPosts={[]} weekStartDate="2040-01-02" />);
  await generate();
  fireEvent.click(screen.getAllByRole("button", { name: /Ajouter à ma semaine/ })[0]);
  await screen.findByRole("button", { name: "✅ Posé" });
  view.rerender(<CalendarCoachingDialog open onOpenChange={vi.fn()} existingPosts={[db.rows.calendar_posts[0]]} weekStartDate="2040-01-02" />);
  expect(screen.getByText(/Une semaine/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "✅ Posé" })).toBeDisabled();
  db.fail("calendar_posts", "insert");
  fireEvent.click(screen.getByRole("button", { name: /Ajouter à ma semaine/ }));
  await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
  db.recover(); fireEvent.click(screen.getByRole("button", { name: /Ajouter à ma semaine/ }));
  await waitFor(() => expect(db.rows.calendar_posts).toHaveLength(2));
  expect(m.invoke).toHaveBeenCalledTimes(1);
  const attempts = db.calls.filter(c => c.action === "insert" && c.payload.theme === "Lettre");
  expect(attempts[0].payload.id).toBe(attempts[1].payload.id);
});
it("fails closed on duplicate read failure and resumes without regeneration", async () => {
  render(<CalendarCoachingDialog open onOpenChange={vi.fn()} weekStartDate="2040-01-02" />); await generate();
  db.fail("calendar_posts", "read"); fireEvent.click(screen.getAllByRole("button", { name: /Ajouter à ma semaine/ })[0]);
  await waitFor(() => expect(m.toast.error).toHaveBeenCalled()); expect(db.rows.calendar_posts).toHaveLength(0);
  db.recover(); fireEvent.click(screen.getAllByRole("button", { name: /Ajouter à ma semaine/ })[0]);
  await waitFor(() => expect(db.rows.calendar_posts).toHaveLength(1));
});
it("passes complete editor parameters and confirmed calendar ID for a new proposal", async () => {
  render(<CalendarCoachingDialog open onOpenChange={vi.fn()} weekStartDate="2040-01-02" />); await generate();
  fireEvent.click(screen.getAllByRole("button", { name: /Créer ce contenu/ })[0]);
  await waitFor(() => expect(m.navigate).toHaveBeenCalled());
  const [url, options] = m.navigate.mock.calls[0];
  expect(new URL(url, "https://example.test").searchParams.get("format")).toBe("carousel");
  expect(options.state).toMatchObject({ fromCalendar: true, calendarPostId: db.rows.calendar_posts[0].id, postDate: "2040-01-02" });
});
it("ignores late generation from A after A → B → A", async () => {
  let resolve!: (r: any) => void; m.invoke.mockImplementation(() => new Promise(r => { resolve = r; }));
  const view = render(<CalendarCoachingDialog open onOpenChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "2" })); fireEvent.click(screen.getByRole("button", { name: "Rien de spécial" })); fireEvent.click(screen.getByRole("button", { name: /Mix de mes piliers/ })); fireEvent.click(screen.getByRole("button", { name: "Planifier ma semaine" }));
  m.scope = "B"; view.rerender(<CalendarCoachingDialog open onOpenChange={vi.fn()} />);
  m.scope = "A"; view.rerender(<CalendarCoachingDialog open onOpenChange={vi.fn()} />);
  await act(async () => resolve({ data: proposal })); expect(screen.queryByText(/Une semaine/)).not.toBeInTheDocument();
});
it("sends only selected slots through one transaction and never deletes existing content", async () => {
  render(<InstagramLaunchPlan />);
  await screen.findByText(/Vendre/);
  fireEvent.click(screen.getAllByRole("checkbox")[1]);
  fireEvent.click(screen.getByRole("button", { name: /Envoyer la sélection/ }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalled());
  expect(m.rpc.mock.calls[0]).toEqual(["sync_launch_calendar", { p_launch_id: "launch", p_workspace_id: "A", p_slot_ids: ["s1"], p_replace: false }]);
  expect(db.calls.every(c => c.action === "read")).toBe(true);
});
it("requires explicit replacement confirmation when server finds an earlier partial send", async () => {
  m.rpc.mockResolvedValueOnce({ error: { message: "launch_replace_confirmation_required" } }); m.confirm.mockResolvedValue(false);
  render(<InstagramLaunchPlan />); await screen.findByText(/Vendre/);
  fireEvent.click(screen.getByRole("button", { name: /Envoyer la sélection/ }));
  await waitFor(() => expect(m.confirm).toHaveBeenCalled()); expect(m.rpc).toHaveBeenCalledTimes(1); expect(m.navigate).not.toHaveBeenCalled();
});
it("rejects a successful response without per-slot receipts", async () => {
  m.rpc.mockResolvedValue({ data: { launch_id: "launch", items: [] } });
  render(<InstagramLaunchPlan />); await screen.findByText(/Vendre/); fireEvent.click(screen.getByRole("button", { name: /Envoyer la sélection/ }));
  await waitFor(() => expect(m.toast.error).toHaveBeenCalled()); expect(m.navigate).not.toHaveBeenCalled();
});
it("does not interpret a strategy read failure as an empty setup", async () => {
  db.fail("user_plan_config", "read"); render(<CommPlanPage embedded />);
  await screen.findByText(/Impossible de charger ta stratégie/); expect(screen.queryByText("Enregistrer la stratégie")).not.toBeInTheDocument();
  db.recover(); fireEvent.click(screen.getByRole("button", { name: "Réessayer" })); await screen.findByText("Enregistrer la stratégie");
});
it("preserves an account configuration already attached to another workspace", async () => {
  db.rows.user_plan_config.push({ id: "config", user_id: "owner", workspace_id: "B", main_goal: "original" });
  render(<CommPlanPage embedded />); fireEvent.click(await screen.findByText("Enregistrer la stratégie"));
  await waitFor(() => expect(m.toast.error).toHaveBeenCalled()); expect(db.rows.user_plan_config[0]).toMatchObject({ workspace_id: "B", main_goal: "original" });
});
it("does not confirm an override after failed write", async () => {
  db.rows.user_plan_config.push({ id: "config", user_id: "owner", workspace_id: "A", main_goal: "Original" });
  render(<CommPlanPage embedded />); fireEvent.click(await screen.findByText("Cocher"));
  await waitFor(() => expect(db.rows.user_plan_overrides).toHaveLength(1));
  db.fail("user_plan_overrides", "update"); m.toast.success.mockClear(); fireEvent.click(screen.getByText("Cocher"));
  await waitFor(() => expect(m.toast.error).toHaveBeenCalled()); expect(m.toast.success).not.toHaveBeenCalled();
});
it("strategy changes reload configuration on A → B → A", async () => {
  db.rows.user_plan_config.push({ id: "config", user_id: "owner", workspace_id: "A", main_goal: "Original" });
  const view = render(<CommPlanPage embedded />); await screen.findByText("Original");
  m.scope = "B"; view.rerender(<CommPlanPage embedded />); await screen.findByText("Enregistrer la stratégie"); expect(screen.queryByText("Original")).not.toBeInTheDocument();
  m.scope = "A"; view.rerender(<CommPlanPage embedded />); await screen.findByText("Original");
});
it("recovers a committed calendar row after its response was lost", async () => {
  let loseResponse = true;
  m.from.mockImplementation((table: string) => {
    const query = db.from(table); const single = query.single;
    query.single = async () => {
      const result = await single();
      if (table === "calendar_posts" && loseResponse) { loseResponse = false; return { data: null, error: new Error("response lost") }; }
      return result;
    };
    return query;
  });
  render(<CalendarCoachingDialog open onOpenChange={vi.fn()} weekStartDate="2040-01-02" />); await generate();
  fireEvent.click(screen.getAllByRole("button", { name: /Ajouter à ma semaine/ })[0]);
  await waitFor(() => expect(m.toast.error).toHaveBeenCalled()); expect(db.rows.calendar_posts).toHaveLength(1);
  const id = db.rows.calendar_posts[0].id;
  fireEvent.click(screen.getAllByRole("button", { name: /Ajouter à ma semaine/ })[0]);
  await screen.findByRole("button", { name: "✅ Posé" });
  expect(db.rows.calendar_posts).toHaveLength(1); expect(db.rows.calendar_posts[0].id).toBe(id);
  expect(db.calls.filter(c => c.action === "insert")).toHaveLength(1);
});
it("preserves the owner's legacy account config without moving it into a workspace", async () => {
  db.rows.user_plan_config.push({ id: "legacy", user_id: "owner", workspace_id: null, main_goal: "Original", onboarding_completed: true });
  render(<CommPlanPage embedded />); fireEvent.click(await screen.findByText("Modifier configuration"));
  fireEvent.click(screen.getByText("Enregistrer la stratégie"));
  await waitFor(() => expect(db.rows.user_plan_config[0].main_goal).toBe("visibility"));
  expect(db.rows.user_plan_config[0]).toMatchObject({ id: "legacy", workspace_id: null, onboarding_completed: true });
});
