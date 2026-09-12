import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ workspace: "A", invoke: vi.fn(), scan: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-test" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => m.workspace, useWorkspaceReady: () => true }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: m.invoke },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
} }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: m.scan }));
vi.mock("react-router-dom", () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));
vi.mock("@/components/calendar/AlreadyPlannedNotice", () => ({ default: () => null }));
import { SitePhotoImportDialog } from "@/components/photos/SitePhotoImportDialog";
import PublishOrScheduleDialog from "@/components/creer/PublishOrScheduleDialog";
const connected = { data: { connections: [{ platform: "instagram", connected: true }] }, error: null };
const photoProps = { open: true, onOpenChange: vi.fn(), maxSelectable: 5, onImportFiles: vi.fn(), initialSource: "instagram" as const };
beforeEach(() => { m.workspace = "A"; vi.clearAllMocks(); });
afterEach(cleanup);

describe("Instagram photo import with real social connection hook", () => {
  it("status failure ends the spinner, offers retry and recovers the existing photo scan", async () => {
    m.invoke.mockResolvedValueOnce({ data: null, error: { message: "offline" } }).mockResolvedValueOnce(connected);
    m.scan.mockResolvedValue({ data: { images: [{ url: "https://example.test/photo-b.jpg", alt: "Photo B" }] }, error: null });
    render(<SitePhotoImportDialog {...photoProps} />);
    await screen.findByText(/Impossible de vérifier ta connexion Instagram/);
    expect(screen.queryByText("Lecture de tes posts…")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connecter mon compte" })).not.toBeInTheDocument();
    expect(m.scan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await screen.findByAltText("Photo B");
    expect(m.scan).toHaveBeenCalledWith("site-photos-scan", { body: { mode: "instagram", workspace_id: "A" } }, 45000);
  });

  it("A scan arriving after B cannot replace B photos; returning to A reloads", async () => {
    let finishA!: (value: unknown) => void;
    m.invoke.mockResolvedValue(connected);
    m.scan.mockReturnValueOnce(new Promise((r) => { finishA = r; }))
      .mockResolvedValueOnce({ data: { images: [{ url: "https://example.test/b.jpg", alt: "Photo B" }] } })
      .mockResolvedValueOnce({ data: { images: [{ url: "https://example.test/a-new.jpg", alt: "Photo A nouvelle" }] } });
    const { rerender } = render(<SitePhotoImportDialog {...photoProps} />);
    await waitFor(() => expect(m.scan).toHaveBeenCalledTimes(1));
    m.workspace = "B"; rerender(<SitePhotoImportDialog {...photoProps} />);
    await screen.findByAltText("Photo B");
    await act(async () => finishA({ data: { images: [{ url: "https://example.test/a.jpg", alt: "Photo A ancienne" }] } }));
    expect(screen.queryByAltText("Photo A ancienne")).not.toBeInTheDocument();
    expect(screen.getByAltText("Photo B")).toBeInTheDocument();
    m.workspace = "A"; rerender(<SitePhotoImportDialog {...photoProps} />);
    expect(screen.queryByAltText("Photo B")).not.toBeInTheDocument();
    await screen.findByAltText("Photo A nouvelle");
  });

  it("known missing connection offers connect and does not scan", async () => {
    m.invoke.mockResolvedValue({ data: { connections: [] }, error: null });
    render(<SitePhotoImportDialog {...photoProps} />);
    await screen.findByRole("link", { name: "Connecter mon compte" });
    expect(m.scan).not.toHaveBeenCalled();
  });
});

describe("Publish/schedule connection states", () => {
  const props = { open: true, onOpenChange: vi.fn(), channel: "instagram" as const,
    onPublishNow: vi.fn(), onSchedule: vi.fn(), onDraft: vi.fn(), onConnectChannel: vi.fn(), onRefreshConnection: vi.fn() };
  it("unknown offers a status retry, never a false reconnect; successful retry enables actions", () => {
    const { rerender } = render(<PublishOrScheduleDialog {...props} channelConnected={null} />);
    expect(screen.getByTestId("publish-schedule-option")).toBeDisabled();
    expect(screen.queryByTestId("publish-connect-action")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer la connexion" }));
    expect(props.onRefreshConnection).toHaveBeenCalledTimes(1);
    expect(props.onConnectChannel).not.toHaveBeenCalled();
    rerender(<PublishOrScheduleDialog {...props} channelConnected={true} />);
    expect(screen.getByTestId("publish-now-option")).toBeEnabled();
    fireEvent.click(screen.getByTestId("publish-schedule-option"));
    fireEvent.click(screen.getByRole("button", { name: "Programmer la publication" }));
    expect(props.onSchedule).toHaveBeenCalledTimes(1);
  });
  it("loading is distinct from unknown and known disconnection", () => {
    const { rerender } = render(<PublishOrScheduleDialog {...props} channelConnected={null} connectionLoading />);
    expect(screen.getAllByText("Vérification de la connexion…")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Réessayer la connexion" })).toBeDisabled();
    rerender(<PublishOrScheduleDialog {...props} channelConnected={false} />);
    expect(screen.getByTestId("publish-connect-action")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Réessayer la connexion" })).not.toBeInTheDocument();
    expect(screen.getByTestId("publish-now-option")).toBeDisabled();
  });
});
