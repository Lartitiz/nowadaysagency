import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ library: vi.fn(), legacy: vi.fn(), sessions: vi.fn(), detail: vi.fn(), create: vi.fn(), archive: vi.fn(), read: vi.fn() }));
vi.mock("@/features/studio-video/api", () => ({
  listVideoLibrary: mock.library, listLegacyVideoJobs: mock.legacy, listVideoSessions: mock.sessions, getVideoSession: mock.detail,
  createVideoSession: mock.create, archiveVideoSession: mock.archive, readStudioVideo: mock.read,
  videoTitle: (job: { display_name?: string; source_name: string }) => job.display_name || job.source_name,
}));
vi.mock("@/features/studio-video/StudioVideoPanel", () => ({
  StudioVideoPanel: ({ sessionId, writable }: { sessionId: string; writable: boolean }) =>
    <div>Conversation {sessionId} · {writable ? "modifiable" : "lecture seule"}</div>,
}));
import { VideoLibrary } from "@/features/studio-video/VideoLibrary";
import { VideoStudioSessions } from "@/features/studio-video/VideoStudioSessions";

const clients: QueryClient[] = [];
function mount(child: React.ReactNode, path = "/photos") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{child}</MemoryRouter></QueryClientProvider>);
}
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0;
  Object.values(mock).forEach(fn => fn.mockReset()); });

it("shows only returned ready clips, keeps historical clips without invented sessions and pages the complete library", async () => {
  const job = { id: "clip-1", workspace_id: "space", source_kind: "text", source_id: null,
    source_name: "Idée seule", display_name: "Le bol tourne sur une table rouge", session_id: null,
    preparation: { idea: "Le bol tourne sur une table rouge" }, prompt: "Technical prompt",
    duration: 5, resolution: "480p", aspect_ratio: "9:16", status: "ready", created_at: "2026-09-29T12:00:00Z",
    estimated_usd: 1, estimated_credits: 10, quote_expires_at: "", error_code: null, video_url: "/clip.mp4" };
  mock.library.mockImplementation(async (_space: string, page: number) => ({ jobs: [{ ...job, id: `clip-${page + 1}` }], total: 25 }));
  mount(<VideoLibrary workspaceId="space" />);
  expect(await screen.findByText("Le bol tourne sur une table rouge")).toBeInTheDocument();
  expect(screen.queryByText("Technical prompt")).not.toBeInTheDocument();
  expect(screen.getByText(/Clip historique : aucune session associée/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Reprendre depuis ce clip" })).toHaveAttribute("href", "/photos/studio?tab=video&from_clip=clip-1");
  await userEvent.click(screen.getByRole("button", { name: "Suivante" }));
  await waitFor(() => expect(mock.library).toHaveBeenCalledWith("space", 1, "", "newest"));
});

it("creates a video session before opening the chat and offers archive/restore without deleting its clips", async () => {
  mock.legacy.mockResolvedValue({ jobs: [], total: 0, enabled: true });
  mock.sessions.mockResolvedValue({ sessions: [], total: 0 });
  mock.create.mockImplementation(async (_space: string, id: string) => ({ session: { id } }));
  let archived = false;
  mock.detail.mockImplementation(async (_space: string, id: string) => ({
    session: { id, title: "Mon idée vidéo", draft: {}, archived_at: archived ? "2026-09-29T12:00:00Z" : null },
    events: [], jobs: [], enabled: true,
  }));
  mock.archive.mockImplementation(async (_space: string, id: string, next: boolean) => {
    archived = next; return { session: { id, archived_at: next ? "2026-09-29T12:00:00Z" : null } };
  });
  mount(<VideoStudioSessions workspaceId="space" userId="user" writable />, "/photos/studio?tab=video");
  await userEvent.click(screen.getByRole("button", { name: "Nouvelle session" }));
  expect(await screen.findByText(/Conversation .* · modifiable/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Archiver" }));
  expect(await screen.findByRole("status", { name: "" })).toHaveTextContent("Session archivée");
  await userEvent.click(screen.getByRole("button", { name: "Restaurer" }));
  await waitFor(() => expect(mock.archive).toHaveBeenLastCalledWith("space", expect.any(String), false));
});
