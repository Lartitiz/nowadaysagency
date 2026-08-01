import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

// Toute fenêtre Radix (Dialog, Sheet, Drawer, AlertDialog) DOIT porter un titre :
// sans lui, un lecteur d'écran annonce « boîte de dialogue » et rien d'autre, et
// Radix crie dans la console à chaque ouverture. Le coach com' sur mobile avait
// un simple <span className="sr-only"> — Radix ne le reconnaît pas.

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ pathname: "/", search: "" }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ activeWorkspace: { id: "w1" } }) }));
vi.mock("@/hooks/use-user-plan", () => ({
  useUserPlan: () => ({ plan: "free", usage: {}, refresh: vi.fn() }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));

import CoachChat from "@/components/coach/CoachChat";

const RALES_RADIX = /requires a `(Dialog|Sheet|Drawer|AlertDialog)?Title`|Missing `Description`/;

let plaintes: string[] = [];

beforeEach(() => {
  plaintes = [];
  const collecte = (...args: unknown[]) => plaintes.push(args.map(String).join(" "));
  vi.spyOn(console, "error").mockImplementation(collecte);
  vi.spyOn(console, "warn").mockImplementation(collecte);
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function sansPlainteRadix() {
  const fautives = plaintes.filter((p) => RALES_RADIX.test(p));
  expect(fautives).toEqual([]);
}

describe("les fenêtres modales annoncent leur titre", () => {
  it("le coach com' sur mobile (Sheet du bas)", () => {
    vi.useFakeTimers();
    const { container } = render(<CoachChat />);

    // Le bouton flottant n'apparaît qu'après 500 ms.
    act(() => { vi.advanceTimersByTime(600); });
    const bouton = container.querySelector("button");
    expect(bouton).toBeTruthy();
    act(() => { bouton!.click(); });

    sansPlainteRadix();
  });
});
