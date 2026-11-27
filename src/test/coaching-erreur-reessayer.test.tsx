// Chantier 4 (27/11/2026) : les coachings Instagram, LinkedIn et audit montrent
// le même bloc d'erreur avec « Réessayer » (au lieu d'un toast qui disparaît et
// d'un écran vide). Rendu réel, appel IA simulé en échec puis en succès.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mock = vi.hoisted(() => ({ invoke: vi.fn(), quota: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/hooks/use-profile", () => ({ useProfile: () => ({ data: {} }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceReady: () => true, useWorkspaceId: () => "owner", useProfileUserId: () => "owner", useWorkspaceFilter: () => ({ column: "user_id", value: "owner" }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mock.invoke }));
vi.mock("@/lib/quota-error-handler", () => ({ handleQuotaError: mock.quota }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/Confetti", () => ({ default: () => null }));
vi.mock("@/components/ui/textarea-with-voice", () => ({ TextareaWithVoice: ({ onValueChange, ...p }: any) => <textarea {...p} /> }));
vi.mock("@/components/ui/input-with-voice", () => ({ InputWithVoice: ({ onValueChange, ...p }: any) => <input {...p} /> }));

import InstagramProfileCoaching from "@/components/instagram/InstagramProfileCoaching";
import LinkedInCoaching from "@/components/linkedin/LinkedInCoaching";
import AuditCoachingPanel from "@/components/audit/AuditCoachingPanel";

const questions = { data: { questions: [{ numero: 1, question: "Ta question ?", placeholder: "Réponse" }], intro: "On y va" }, error: null };
const diagnostic = { data: { diagnostic: "Voilà le diagnostic", pourquoi: "", consequences: [], proposals: [] }, error: null };
const down = { data: null, error: { code: "SERVER_ERROR", message: "Le service est momentanément indisponible. Réessaie dans quelques instants." } };
const screens: [string, () => JSX.Element][] = [
  ["Instagram", () => <InstagramProfileCoaching open onOpenChange={vi.fn()} initialModule="bio" />],
  ["LinkedIn", () => <LinkedInCoaching open onOpenChange={vi.fn()} initialModule="profil" />],
  ["Audit", () => <AuditCoachingPanel open onOpenChange={vi.fn()} module="positioning" pillarKey="positioning" pillarLabel="Cible" pillarEmoji="" onComplete={vi.fn()} onSkipToModule={vi.fn()} /> as any],
];
beforeEach(() => { vi.clearAllMocks(); Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);

describe.each(screens)("%s : coaching en erreur", (_name, ui) => {
  it("questions en échec → bloc + Réessayer → les questions arrivent", async () => {
    mock.invoke.mockResolvedValueOnce(down).mockResolvedValue(questions);
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent(/momentanément indisponible/);
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("button", { name: "C'est parti" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("diagnostic en échec → bloc + Réessayer → le diagnostic arrive, réponses gardées", async () => {
    let diagCalls = 0;
    mock.invoke.mockImplementation(async (_f: string, a: any) => a.body.phase === "questions" ? questions : (diagCalls++ === 0 ? down : diagnostic));
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "C'est parti" }));
    fireEvent.change(await screen.findByPlaceholderText("Réponse"), { target: { value: "Ma réponse" } });
    fireEvent.click(screen.getByRole("button", { name: /Analyser/ }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Voilà le diagnostic")).toBeInTheDocument();
    expect(diagCalls).toBe(2);
  });

  it("diagnostic en échec → « Revenir à mes réponses » garde le texte tapé", async () => {
    mock.invoke.mockImplementation(async (_f: string, a: any) => a.body.phase === "questions" ? questions : down);
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "C'est parti" }));
    fireEvent.change(await screen.findByPlaceholderText("Réponse"), { target: { value: "Ma réponse" } });
    fireEvent.click(screen.getByRole("button", { name: /Analyser/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Revenir à mes réponses" }));
    await waitFor(() => expect(screen.getByPlaceholderText("Réponse")).toHaveValue("Ma réponse"));
  });
});

it("LinkedIn : quota atteint → pas de rond qui tourne sans fin, pas de Réessayer", async () => {
  mock.quota.mockReturnValue(true);
  mock.invoke.mockResolvedValue({ data: { error: "limit_reached", quota: { reason: "total", plan: "free", usage: {} } }, error: { message: "limit" } });
  render(<MemoryRouter><LinkedInCoaching open onOpenChange={vi.fn()} initialModule="profil" /></MemoryRouter>);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull();
});
