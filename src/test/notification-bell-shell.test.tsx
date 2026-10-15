import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => ({ column: "user_id", value: "qa" }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() } }));

import NotificationBell from "@/components/NotificationBell";

// Largeur simulée : seules les requêtes qui la contiennent répondent « vrai ».
let width = 390;
function matches(query: string) {
  const min = Number(query.match(/min-width:\s*(\d+)px/)?.[1] ?? 0);
  const max = Number(query.match(/max-width:\s*(\d+)px/)?.[1] ?? Infinity);
  return width >= min && width <= max;
}
beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: matches(query), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mountAllShells() {
  return render(<MemoryRouter>
    <NotificationBell only="mobile" />
    <NotificationBell only="tablet" />
    <NotificationBell only="desktop" />
  </MemoryRouter>);
}

it.each([[390], [820], [1440]])("une seule cloche montée à %ipx de large", (w) => {
  width = w;
  mountAllShells();
  expect(screen.getAllByRole("button", { name: "Notifications" })).toHaveLength(1);
});
