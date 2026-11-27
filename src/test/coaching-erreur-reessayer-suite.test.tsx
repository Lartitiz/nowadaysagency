// Chantier 4, suite (27/11/2026) : PreGenCoaching et CoachingFlow montrent le
// bloc d'erreur commun avec « Réessayer ». Rendu réel, appel IA simulé.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mock = vi.hoisted(() => ({ invoke: vi.fn(), stream: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner", email: "a@b.c" } }) }));
vi.mock("@/hooks/use-profile", () => ({ useProfile: () => ({ data: {} }), useBrandProfile: () => ({ data: {} }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceReady: () => true, useWorkspaceId: () => "owner", useProfileUserId: () => "owner", useWorkspaceFilter: () => ({ column: "user_id", value: "owner" }) }));
vi.mock("@/hooks/use-streaming-invoke", () => ({ useStreamingInvoke: () => ({ invoke: mock.stream, reset: vi.fn(), content: "", streaming: false }) }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mock.invoke }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/ui/textarea-with-voice", () => ({ TextareaWithVoice: ({ onValueChange, ...p }: any) => <textarea {...p} /> }));
vi.mock("@/components/ui/input-with-voice", () => ({ InputWithVoice: ({ onValueChange, ...p }: any) => <input {...p} /> }));

import PreGenCoaching from "@/components/coach/PreGenCoaching";
import CoachingFlow from "@/components/CoachingFlow";

const down = { data: null, error: { code: "SERVER_ERROR", message: "Le service est momentanément indisponible. Réessaie dans quelques instants." } };
beforeEach(() => { vi.clearAllMocks(); Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);

describe("PreGenCoaching en erreur", () => {
  it("échec → bloc + Réessayer renvoie le même message sans le retaper", async () => {
    mock.invoke.mockResolvedValueOnce(down).mockResolvedValue({ data: { response: "Super, et ensuite ?" }, error: null });
    render(<PreGenCoaching generationType="content" onComplete={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Ta réponse..."), { target: { value: "Mon idée" } });
    fireEvent.click(screen.getByLabelText("Envoyer"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/momentanément indisponible/);
    expect(screen.getAllByText("Mon idée")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Super, et ensuite ?")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByText("Mon idée")).toHaveLength(1);
    expect(mock.invoke).toHaveBeenCalledTimes(2);
    expect(mock.invoke.mock.calls[1][1].body.messages.filter((m: any) => m.role === "user")).toHaveLength(1);
  });
});

describe("CoachingFlow en erreur", () => {
  const questions = { data: { questions: [{ numero: 1, question: "Ta question ?", placeholder: "Réponse" }], intro: "On y va" }, error: null };
  it("questions en échec → bloc + Réessayer → les questions arrivent", async () => {
    mock.invoke.mockResolvedValueOnce(down).mockResolvedValue(questions);
    render(<MemoryRouter><CoachingFlow module="positioning" onComplete={vi.fn()} onSkip={vi.fn()} /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent(/momentanément indisponible/);
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("button", { name: "C'est parti" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("diagnostic en échec → bloc, réponses gardées, Réessayer relance", async () => {
    mock.invoke.mockResolvedValue(questions);
    mock.stream.mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValue(JSON.stringify({ diagnostic: "Voilà le diagnostic", pourquoi: "", consequences: [], proposals: [] }));
    render(<MemoryRouter><CoachingFlow module="positioning" onComplete={vi.fn()} onSkip={vi.fn()} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "C'est parti" }));
    fireEvent.change(await screen.findByPlaceholderText("Réponse"), { target: { value: "Ma réponse" } });
    fireEvent.click(screen.getByRole("button", { name: /Analyser/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/connexion/i);
    expect(screen.getByPlaceholderText("Réponse")).toHaveValue("Ma réponse");
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Voilà le diagnostic")).toBeInTheDocument();
  });
});
