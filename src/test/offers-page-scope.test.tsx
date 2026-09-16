import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import OffersPage from "@/pages/OffersPage";

const state = vi.hoisted(() => ({ scope: "A", ready: true, requests: [] as any[], inserts: [] as any[], navigate: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock("@/hooks/use-workspace-query", () => ({
  useWorkspaceFilter: () => ({ column: state.scope === "personal" ? "user_id" : "workspace_id", value: state.scope === "personal" ? "owner" : state.scope }),
  useWorkspaceId: () => state.scope === "personal" ? "owner" : state.scope,
  useWorkspaceReady: () => state.ready,
}));
vi.mock("react-router-dom", async importOriginal => ({ ...await importOriginal<typeof import("react-router-dom")>(), useNavigate: () => state.navigate }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/CoachingFlow", () => ({ default: () => <div>Coaching actif</div> }));
vi.mock("@/components/branding/OffersSynthesisView", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
 const filters: any[] = [];
 const q: any = { select: () => q, eq: (...args:any[]) => { filters.push(args); return q; }, is: (...args:any[]) => { filters.push(args); return q; },
  order: () => new Promise(resolve => state.requests.push({ filters, resolve })),
  insert: (payload:any) => { q.single = () => new Promise(resolve => state.inserts.push({ payload, resolve })); return q; }
 }; return q;
} } }));
const offer = (name:string) => ({id:name, name, offer_type:"paid"});
const ui = () => <MemoryRouter><OffersPage /></MemoryRouter>;
async function answer(index:number, data:any[] = [], error:any = null) { await act(async () => state.requests[index].resolve({data,error})); }
beforeEach(() => { state.scope="A"; state.ready=true; state.requests=[]; state.inserts=[]; state.navigate.mockReset(); });
describe("OffersPage conserve le scope visible", () => {
 it("attend la résolution initiale de l’espace avant toute lecture ou création", async () => {
  state.ready=false; const view=render(ui()); expect(state.requests).toHaveLength(0);
  expect(screen.queryByText("Créer ma première offre", {exact:false})).not.toBeInTheDocument();
  state.ready=true; view.rerender(ui()); await waitFor(() => expect(state.requests).toHaveLength(1));
  expect(state.requests[0].filters).toEqual([["workspace_id","A"]]);
 });
 it("retire immédiatement les offres et le coaching de A lors du passage vers B", async () => {
  const view=render(ui()); await answer(0,[offer("Offre A")]); fireEvent.click(screen.getByRole("button",{name:"Besoin d’aide pour formuler mes offres"}));
  state.scope="B"; view.rerender(ui());
  expect(screen.queryByText(/Offre A/)).not.toBeInTheDocument(); expect(screen.queryByText("Coaching actif")).not.toBeInTheDocument();
  await waitFor(() => expect(state.requests).toHaveLength(2)); await answer(1,[offer("Offre B")]); expect(screen.getByText(/Offre B/)).toBeInTheDocument();
 });
 it("ignore les réponses lentes de précédents passages A et B après A→B→A", async () => {
  const view=render(ui()); state.scope="B"; view.rerender(ui()); state.scope="A"; view.rerender(ui());
  expect(state.requests).toHaveLength(3); await answer(2,[offer("A actuelle")]); await answer(1,[offer("B ancienne")]); await answer(0,[offer("A ancienne")]);
  expect(screen.getByText(/A actuelle/)).toBeInTheDocument(); expect(screen.queryByText(/ancienne/)).not.toBeInTheDocument();
 });
 it("présente une lecture échouée comme indisponible et permet une reprise", async () => {
  render(ui()); await answer(0,[],{message:"diagnostic privé"});
  expect(screen.getByRole("alert")).toHaveTextContent("Impossible de charger tes offres"); expect(screen.queryByText("Tu n'as pas encore d'offres")).not.toBeInTheDocument();
  expect(screen.queryByText("diagnostic privé")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Réessayer"})); await answer(1,[offer("Reprise A")]); expect(screen.getByText(/Reprise A/)).toBeInTheDocument();
 });
 it("ne navigue pas dans une offre A dont la création se termine après passage vers B", async () => {
  const view=render(ui()); await answer(0); fireEvent.click(screen.getByRole("button",{name:/Créer ma première offre/}));
  fireEvent.click(screen.getByRole("button",{name:/Offre payante/}));
  expect(state.inserts[0].payload.workspace_id).toBe("A"); state.scope="B"; view.rerender(ui());
  await act(async () => state.inserts[0].resolve({data:{id:"created-A"},error:null})); expect(state.navigate).not.toHaveBeenCalled();
 });
 it("crée dans B après une vraie liste vide, puis ouvre seulement le nouvel identifiant B", async () => {
  const view=render(ui()); await answer(0,[offer("Offre A")]); state.scope="B"; view.rerender(ui()); await answer(1);
  fireEvent.click(screen.getByRole("button",{name:/Créer ma première offre/}));
  fireEvent.click(screen.getByRole("button",{name:/Offre payante/}));
  expect(state.inserts[0].payload).toMatchObject({user_id:"owner",workspace_id:"B"});
  await act(async () => state.inserts[0].resolve({data:{id:"created-B"},error:null}));
  expect(state.navigate).toHaveBeenCalledWith("/branding/offres/created-B");
 });
 it("limite le mode personnel aux anciennes offres sans workspace", async () => {
  state.scope="personal"; render(ui()); expect(state.requests[0].filters).toEqual([["user_id","owner"],["workspace_id",null]]);
 });
});
