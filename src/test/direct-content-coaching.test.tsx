import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ContentCoachingDialog from "../components/dashboard/ContentCoachingDialog";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), insert: vi.fn(), scope: "workspace-a", user: "user-a" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: mocks.user } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => mocks.scope, useWorkspaceReady: () => true }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invoke }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ insert: mocks.insert }) } }));
vi.mock("@/components/coaching/CoachingShell", () => ({ default: ({ open, children }: any) => open ? <div>{children}</div> : null }));
vi.mock("@/components/ui/textarea-with-voice", () => ({ TextareaWithVoice: (props: any) => <textarea {...props} /> }));
const idea = (subject: string) => ({ subject, angle: "Analyse", insight: "Une idée centrale précise", mechanism: "Un mécanisme à développer", reader_benefit: "Choisir selon son besoin", outline: ["Montrer", "Expliquer"], example: "Un exemple fictif", nuance: "Une limite essentielle", grounding: "Un public précis", objective_tag: "credibilite", sources: [], to_verify: [] });
const response = (name = "Idée") => ({ data: { version: 2, ideas: [1, 2, 3, 4].map(n => idea(`${name} ${n}`)) }, error: null });
function setup(props: any = {}) { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); const onSelect = vi.fn(); const view = (p: any = {}) => <QueryClientProvider client={client}><ContentCoachingDialog open onOpenChange={() => {}} onSelect={onSelect} initialChannel="linkedin" {...props} {...p} /></QueryClientProvider>; const rendered = render(view()); return { client, onSelect, view, ...rendered }; }
beforeEach(() => { cleanup(); sessionStorage.clear(); mocks.scope = "workspace-a"; mocks.user = "user-a"; vi.clearAllMocks(); mocks.invoke.mockResolvedValue(response()); mocks.insert.mockImplementation((payload: any) => ({ select: () => ({ single: async () => ({ data: { id: payload.id }, error: null }) }) })); });
describe("direct coach journey", () => {
  it("generates immediately without a subject questionnaire and keeps full brief and channel", async () => {
    const { onSelect } = setup();
    await screen.findByText("Idée 1");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke.mock.calls[0][1].body.answers.sujet).toBe("");
    fireEvent.click(screen.getAllByRole("button", { name: "Créer" })[0]);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ subject: "Idée 1", canal: "linkedin", format: "" });
    expect(onSelect.mock.calls[0][0].editorialAngle).toContain("Une limite essentielle");
  });
  it("reopens cached ideas without another paid generation", async () => {
    const { rerender, view } = setup(); await screen.findByText("Idée 1");
    rerender(view({ open: false })); rerender(view());
    await screen.findByText("Idée 1"); expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
  it("keeps the same selection when the creator returns on a different channel", async () => {
    const { rerender, view, onSelect } = setup(); await screen.findByText("Idée 1");
    rerender(view({ open: false, initialChannel: "newsletter" })); rerender(view({ initialChannel: "newsletter" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Créer" })[0]);
    expect(mocks.invoke).toHaveBeenCalledTimes(1); expect(onSelect.mock.calls[0][0].canal).toBe("newsletter");
  });
  it("retains previous ideas after a failed new batch and sends semantic history", async () => {
    setup(); await screen.findByText("Idée 1"); mocks.invoke.mockResolvedValueOnce({ error: { message: "Indisponible" } });
    fireEvent.click(screen.getByText("D'autres idées")); await screen.findByText("Indisponible");
    expect(screen.getByText("Idée 1")).toBeInTheDocument();
    expect(mocks.invoke.mock.calls[1][1].body.previous_ideas[0]).toMatchObject({ subject: "Idée 1", insight: "Une idée centrale précise" });
  });
  it("ignores a late result in another workspace and returns to A's own cache", async () => {
    let resolve: (v: any) => void = () => {}; mocks.invoke.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const { rerender, view } = setup(); mocks.scope = "workspace-b"; mocks.invoke.mockResolvedValueOnce(response("B")); rerender(view()); await screen.findByText("B 1");
    resolve(response("A")); await waitFor(() => expect(screen.queryByText("A 1")).not.toBeInTheDocument());
    mocks.scope = "workspace-a"; rerender(view()); await screen.findByText("A 1");
  });
  it("saves the whole idea once with an explicit receipt", async () => {
    setup(); await screen.findByText("Idée 1"); const keep = screen.getAllByRole("button", { name: "Garder" })[0]; fireEvent.click(keep); fireEvent.click(keep);
    await screen.findByRole("button", { name: "Gardée" }); expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ workspace_id: "workspace-a", canal: "linkedin", personal_elements: { editorial_brief: { nuance: "Une limite essentielle" } } });
  });
  it("asks only the missing activity when the server lacks context", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { needs_activity: true } }); setup();
    expect(await screen.findByLabelText("Ton activité")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Trouver mes idées" })).toBeDisabled();
  });
});
