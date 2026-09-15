import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PhotoWishlistPanel } from "@/components/photos/PhotoWishlistPanel";

const mocks = vi.hoisted(() => ({
  queryResult: { data: null as any, error: { message: "wishlist unavailable" } as any },
  refetch: vi.fn(),
  panelQuery: {} as any,
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "workspace-1" }));
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(mocks.queryResult),
  };
  return { supabase: { from: () => chain } };
});

vi.mock("@/hooks/use-photo-wishlist", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/hooks/use-photo-wishlist")>();
  return {
    ...original,
    usePhotoWishlist: () => mocks.panelQuery,
    usePhotoWishlistMutations: () => ({ addMany: vi.fn(), setDone: vi.fn(), remove: vi.fn() }),
  };
});

beforeEach(() => {
  mocks.refetch.mockReset();
  mocks.panelQuery = {
    data: undefined,
    isLoading: false,
    isError: true,
    isFetching: false,
    refetch: mocks.refetch,
  };
});
afterEach(cleanup);

it("does not convert a wishlist read error into an empty successful query", async () => {
  // Import the unmocked implementation because the panel tests replace the hook export.
  const actual = await vi.importActual<typeof import("@/hooks/use-photo-wishlist")>("@/hooks/use-photo-wishlist");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => actual.usePhotoWishlist(), { wrapper });

  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
});

it("shows an unavailable state and retries instead of claiming the wishlist is empty", () => {
  render(<PhotoWishlistPanel />);

  expect(screen.getByRole("alert")).toHaveTextContent("Impossible de charger la liste");
  expect(screen.queryByText(/Rien pour l'instant/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  expect(mocks.refetch).toHaveBeenCalledTimes(1);
});

it("keeps cached wishlist rows visible when a refresh fails", () => {
  mocks.panelQuery.data = [{
    id: "wish-1",
    workspace_id: "workspace-1",
    user_id: "user-1",
    label: "Portrait au bureau",
    source: "manual",
    requested_count: 1,
    status: "open",
    satisfied_photo_id: null,
    created_at: "2026-09-15T10:00:00Z",
    updated_at: "2026-09-15T10:00:00Z",
  }];
  render(<PhotoWishlistPanel />);

  expect(screen.getByText("Portrait au bureau")).toBeVisible();
  expect(screen.getByRole("alert")).toBeVisible();
});
