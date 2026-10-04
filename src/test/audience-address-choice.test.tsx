import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AudienceAddressChoice from "@/components/branding/AudienceAddressChoice";
import { parseAudienceAddress, withAudienceAddress } from "@/lib/audience-address";

// Réglage « Je m'adresse à mon public en : tu / vous / pas de préférence »
// (décision de Laetitia, 04/10/2026) : écrit brand_profile.tone_register, que
// les générateurs lisent avec la même règle (supabase/functions/_shared/audience-address.ts).

const state = vi.hoisted(() => ({ updates: [] as any[], rows: [{ id: "bp1" }] as any[] | null, error: null as any }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const q: any = {
        update: (patch: any) => { state.updates.push(patch); return q; },
        eq: () => q,
        select: () => Promise.resolve({ data: state.rows, error: state.error }),
      };
      return q;
    },
  },
}));

beforeEach(() => { state.updates = []; state.rows = [{ id: "bp1" }]; state.error = null; });

it("lit les valeurs historiques comme le serveur", () => {
  expect(parseAudienceAddress("vouvoiement")).toBe("vous");
  expect(parseAudienceAddress("tu")).toBe("tu");
  expect(parseAudienceAddress("Je vouvoie")).toBe("vous");
  expect(parseAudienceAddress("tu/vous")).toBeNull();
  expect(parseAudienceAddress("familier")).toBeNull();
  expect(parseAudienceAddress("")).toBeNull();
});

it("remplace seulement tu/vous et garde le reste du texte libre (utilisé par le visuel)", () => {
  expect(withAudienceAddress("", "vous")).toBe("vouvoiement");
  expect(withAudienceAddress("tu", "vous")).toBe("vouvoiement");
  expect(withAudienceAddress("premium", "vous")).toBe("vouvoiement · premium");
  expect(withAudienceAddress("tutoiement · premium", "vous")).toBe("vouvoiement · premium");
  expect(withAudienceAddress("vouvoiement · punchy", null)).toBe("punchy");
  expect(parseAudienceAddress(withAudienceAddress("premium", "vous"))).toBe("vous");
});

it("affiche le choix actuel et enregistre « vouvoiement »", async () => {
  const onSaved = vi.fn();
  render(<AudienceAddressChoice value="tu" recordId="bp1" onSaved={onSaved} />);
  expect(screen.getByRole("radio", { name: "Tu" })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByRole("radio", { name: "Vous" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith("vouvoiement", "tu"));
  expect(state.updates[0].tone_register).toBe("vouvoiement");
});

it("« Pas de préférence » vide le réglage ; recliquer le choix actuel n'écrit rien", async () => {
  const onSaved = vi.fn();
  render(<AudienceAddressChoice value="vouvoiement" recordId="bp1" onSaved={onSaved} />);
  fireEvent.click(screen.getByRole("radio", { name: "Vous" }));
  expect(state.updates).toHaveLength(0);
  fireEvent.click(screen.getByRole("radio", { name: "Pas de préférence" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith("", "vouvoiement"));
});

it("valeur libre sans tu/vous : signalée, non écrasée par « Pas de préférence », gardée en choisissant vous", async () => {
  render(<AudienceAddressChoice value="familier" recordId="bp1" onSaved={vi.fn()} />);
  expect(screen.getByRole("radio", { name: "Pas de préférence" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByText(/Ta fiche indique aujourd'hui « familier »/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "Pas de préférence" }));
  expect(state.updates).toHaveLength(0);
  fireEvent.click(screen.getByRole("radio", { name: "Vous" }));
  await waitFor(() => expect(state.updates[0]?.tone_register).toBe("vouvoiement · familier"));
});

it("aucune ligne modifiée : pas de faux succès", async () => {
  state.rows = [];
  const onSaved = vi.fn();
  render(<AudienceAddressChoice value="" recordId="bp1" onSaved={onSaved} />);
  fireEvent.click(screen.getByRole("radio", { name: "Vous" }));
  await waitFor(() => expect(state.updates).toHaveLength(1));
  await new Promise((r) => setTimeout(r, 0));
  expect(onSaved).not.toHaveBeenCalled();
});
