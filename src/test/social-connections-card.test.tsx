import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ workspace: "A", userId: "qa-user", ready: true, invoke: vi.fn(), success: vi.fn(), error: vi.fn(), navigate: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: m.userId }, session: { user: { id: m.userId } } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => m.workspace, useWorkspaceReady: () => m.ready }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: m.invoke } } }));
vi.mock("react-router-dom", () => ({ useNavigate: () => m.navigate }));
vi.mock("sonner", () => ({ toast: { success: m.success, error: m.error } }));
import SocialConnectionsCard from "@/components/SocialConnectionsCard";
const status = (name: string) => ({ data: { connections: [{ platform: "instagram", connected: true, accountName: name }] }, error: null });
const deferred = () => { let resolve!: (v: unknown) => void; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => { vi.clearAllMocks(); m.workspace = "A"; m.userId = "qa-user"; m.ready = true; window.history.replaceState({}, "", "/parametres/connexions"); sessionStorage.clear(); });
afterEach(cleanup);
it("late A status cannot replace the current B account and disconnect action", async () => {
  const a = deferred(); m.invoke.mockReturnValueOnce(a.promise).mockResolvedValueOnce(status("QA-B"));
  const { rerender } = render(<SocialConnectionsCard />);
  m.workspace = "B"; rerender(<SocialConnectionsCard />);
  await screen.findByText("Connecté : @QA-B");
  await act(async () => a.resolve(status("QA-A")));
  expect(screen.queryByText("Connecté : @QA-A")).not.toBeInTheDocument();
  expect(screen.getByText("Connecté : @QA-B")).toBeInTheDocument();
});
it("malformed status is unknown and retryable, never a confirmed missing account", async () => {
  m.invoke.mockResolvedValue({ data: { error: "unavailable" }, error: null });
  render(<SocialConnectionsCard />);
  await screen.findByRole("button", { name: "Réessayer" });
  expect(screen.queryByRole("button", { name: "Connecter Instagram" })).not.toBeInTheDocument();
});
it("OAuth return does not announce success or leave work before confirmed status", async () => {
  window.history.replaceState({}, "", "/parametres/connexions?connected=instagram");
  sessionStorage.setItem("retour_apres_detour", JSON.stringify({ chemin: "/creer", quoi: "ton contenu en cours", ts: Date.now() }));
  const pending = deferred(); m.invoke.mockReturnValue(pending.promise);
  render(<SocialConnectionsCard />);
  expect(m.success).not.toHaveBeenCalled();
  expect(m.navigate).not.toHaveBeenCalled();
  await act(async () => pending.resolve(status("QA-A")));
  await waitFor(() => expect(m.success).toHaveBeenCalledTimes(1));
  expect(m.navigate).toHaveBeenCalledWith("/creer");
});

it("unknown OAuth return preserves the resume memo and confirms only after retry", async () => {
  window.history.replaceState({}, "", "/parametres/connexions?connected=instagram");
  const memo = JSON.stringify({ chemin: "/creer", quoi: "ton contenu en cours", ts: Date.now() });
  sessionStorage.setItem("retour_apres_detour", memo);
  m.invoke.mockResolvedValueOnce({ error: { message: "offline" }, data: null }).mockResolvedValueOnce(status("QA-A"));
  render(<SocialConnectionsCard />);
  fireEvent.click(await screen.findByRole("button", { name: "Réessayer" }));
  expect(m.success).not.toHaveBeenCalled();
  expect(sessionStorage.getItem("retour_apres_detour")).toBe(memo);
  await waitFor(() => expect(m.navigate).toHaveBeenCalledWith("/creer"));
});
it("does not start a personal status lookup before the workspace is ready", async () => {
  m.ready = false; m.invoke.mockResolvedValue(status("QA-A"));
  const { rerender } = render(<SocialConnectionsCard />);
  expect(m.invoke).not.toHaveBeenCalled();
  m.ready = true; rerender(<SocialConnectionsCard />);
  await screen.findByText("Connecté : @QA-A");
});
it("late disconnection response from A neither reloads nor toasts in B", async () => {
  const pending = deferred(); m.invoke.mockResolvedValueOnce(status("QA-A")).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(status("QA-B"));
  const { rerender } = render(<SocialConnectionsCard />);
  fireEvent.click(await screen.findByRole("button", { name: "Déconnecter" }));
  m.workspace = "B"; rerender(<SocialConnectionsCard />);
  await screen.findByText("Connecté : @QA-B");
  await act(async () => pending.resolve({ data: { success: true }, error: null }));
  expect(m.success).not.toHaveBeenCalled();
  expect(m.invoke).toHaveBeenCalledTimes(3);
  expect(screen.getByRole("button", { name: "Déconnecter" })).toBeEnabled();
});
