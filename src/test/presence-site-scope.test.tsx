import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteHub from "@/pages/SiteHub";
const m = vi.hoisted(() => ({ scope: "A", ready: true, role: "owner", reads: [] as any[], writes: [] as any[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "actor" } }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ activeRole: m.role }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => ({ column: "workspace_id", value: m.scope }), useWorkspaceReady: () => m.ready }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/lib/branding-import-persistence", async original => ({ ...await original<typeof import("@/lib/branding-import-persistence")>(),
  readImportRows: (table: string, scope: any) => new Promise((resolve, reject) => m.reads.push({ table, scope, resolve, reject })),
  saveImportRow: (table: string, scope: any, id: string, fields: any) => new Promise((resolve, reject) => m.writes.push({ table, scope, id, fields, resolve, reject })),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
 const q: any = { select: () => q, eq: () => q, is: () => q, order: () => q, limit: () => q, maybeSingle: () => Promise.resolve({ data: null, error: null }) }; return q;
} } }));
const ui = () => <MemoryRouter><SiteHub /></MemoryRouter>;
const answer = async (i: number, cms: string | null = "wordpress", id = "existing") => { await act(async () => m.reads[i].resolve(cms === null ? [] : [{ id, cms, user_id: "original-owner" } ])); };
const open = () => fireEvent.click(screen.getByText("Mon outil de site web · facultatif"));
const edit = () => { fireEvent.click(screen.getByRole("button", { name: "Modifier mon outil" })); fireEvent.change(screen.getByLabelText("Quel outil utilises-tu ?"), { target: { value: "shopify" } }); fireEvent.click(screen.getByRole("button", { name: "Enregistrer mon outil" })); };
beforeEach(() => { m.scope = "A"; m.ready = true; m.role = "owner"; m.reads = []; m.writes = []; });
describe("site hub scope and receipts", () => {
 it("waits for scope; optional CMS does not block access to writing", async () => {
  m.ready = false; const view = render(ui()); expect(m.reads).toHaveLength(0);
  m.ready = true; view.rerender(ui()); await answer(0, null);
  fireEvent.click(screen.getByText("Rédiger une page"));
  expect(screen.getByRole("link", { name: "Page de capture · recueillir des emails" })).toHaveAttribute("href", "/site/capture");
  open(); expect(screen.getByText("Pas encore renseigné")).toBeInTheDocument(); expect(m.writes).toHaveLength(0);
 });
 it("ignores late A and B reads after A→B→A", async () => {
  const view = render(ui()); m.scope = "B"; view.rerender(ui()); m.scope = "A"; view.rerender(ui());
  await answer(2, "wix"); await answer(1, "shopify"); await answer(0, "wordpress"); open();
  expect(screen.getByText("Wix")).toBeInTheDocument(); expect(screen.queryByText("WordPress")).not.toBeInTheDocument();
 });
 it("does not turn an error or ambiguous collection into an empty choice", async () => {
  render(ui()); await act(async () => m.reads[0].reject(new Error("offline"))); open();
  expect(screen.queryByRole("button", { name: "Modifier mon outil" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  await act(async () => m.reads[1].resolve([{ id: "one" }, { id: "two" }]));
  expect(screen.getByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" })); await answer(2);
  expect(screen.getByText("WordPress")).toBeInTheDocument();
 });
 it("keeps the original row ID and confirms only after a real receipt; failed save stays editable", async () => {
  render(ui()); await answer(0); open(); edit();
  expect(screen.queryByText("Outil enregistré.")).not.toBeInTheDocument();
  expect(m.writes[0]).toMatchObject({ table: "website_profile", id: "existing", scope: { column: "workspace_id", value: "A", userId: "actor" }, fields: { cms: "shopify" } });
  await act(async () => m.writes[0].reject(new Error("denied")));
  expect(screen.getByRole("alert")).toHaveTextContent("n’a pas été enregistré");
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer mon outil" }));
  await act(async () => m.writes[1].resolve({ id: "existing", cms: "shopify" }));
  expect(screen.getByText("Outil enregistré.")).toBeInTheDocument(); expect(screen.getByText("Shopify")).toBeInTheDocument();
 });
 it("does not apply a save receipt to the next workspace", async () => {
  const view = render(ui()); await answer(0); open(); edit(); m.scope = "B"; view.rerender(ui()); await answer(1, "wix");
  await act(async () => m.writes[0].resolve({ id: "existing", cms: "shopify" })); open();
  expect(screen.getByText("Wix")).toBeInTheDocument(); expect(screen.queryByText("Outil enregistré.")).not.toBeInTheDocument();
 });
 it.each(["viewer", ""])("does not offer editing with role %s", async role => {
  m.role = role; render(ui()); await answer(0); open();
  expect(screen.queryByRole("button", { name: "Modifier mon outil" })).not.toBeInTheDocument();
 });
 it("rechecks permission at save time", async () => {
  const view = render(ui()); await answer(0); open(); fireEvent.click(screen.getByRole("button", { name: "Modifier mon outil" }));
  m.role = "viewer"; view.rerender(ui());
  fireEvent.submit(screen.getByLabelText("Quel outil utilises-tu ?").closest("form")!);
  expect(m.writes).toHaveLength(0);
 });
});
