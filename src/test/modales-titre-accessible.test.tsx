import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import { render, act } from "@testing-library/react";

// Toute fenêtre Radix (Dialog, Sheet, Drawer, AlertDialog) DOIT porter un titre :
// sans lui, un lecteur d'écran annonce « boîte de dialogue » et rien d'autre, et
// Radix crie dans la console à chaque ouverture. Ce test monte les fenêtres qui
// n'en avaient pas et échoue si l'avertissement revient.

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
import { Sidebar, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { CommandDialog, CommandInput, CommandList, CommandItem } from "@/components/ui/command";

// cmdk observe la taille de sa liste et fait défiler l'item actif ; jsdom n'a ni
// ResizeObserver ni scrollIntoView.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver ??= ResizeObserverStub;
(Element.prototype as any).scrollIntoView ??= () => {};

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

  it("la barre latérale en version mobile (Sheet)", () => {
    // Le tiroir mobile n'est monté qu'une fois ouvert.
    const Ouvre = () => {
      const { setOpenMobile } = useSidebar();
      useEffect(() => { setOpenMobile(true); }, [setOpenMobile]);
      return null;
    };

    render(
      <SidebarProvider>
        <Ouvre />
        <Sidebar>
          <div>menu</div>
        </Sidebar>
      </SidebarProvider>,
    );

    sansPlainteRadix();
  });

  it("la palette de commandes (CommandDialog)", () => {
    render(
      <CommandDialog open>
        <CommandInput placeholder="Chercher…" />
        <CommandList>
          <CommandItem>Un résultat</CommandItem>
        </CommandList>
      </CommandDialog>,
    );

    sansPlainteRadix();
  });
});
