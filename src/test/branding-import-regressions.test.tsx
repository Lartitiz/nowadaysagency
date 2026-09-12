import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const m = vi.hoisted(() => {
  const db: Record<string, any[]> = {};
  const readsFail = new Set<string>();
  const writesFail = new Set<string>();
  const writes: { table: string; op: string; payload: any }[] = [];
  const auth = { user: { id: "u1" } };
  const state = { workspace: "w1", user: "u1", extracted: {} as any, proposition: null as any };
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
  const client = { invalidateQueries: vi.fn() };
  const from = vi.fn((table: string) => {
    let op = "read", payload: any, limit = Infinity, single = false;
    const filters: [string, any][] = [], orders: [string, boolean][] = [];
    const result = () => {
      if ((op === "read" ? readsFail : writesFail).has(table)) return { data: null, error: { message: "Fixture failure" } };
      let rows = (db[table] || []).filter(row => filters.every(([k, v]) => row[k] === v));
      for (const [key, asc] of [...orders].reverse()) rows.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (asc ? 1 : -1));
      rows = rows.slice(0, limit);
      if (op === "update") { writes.push({ table, op, payload }); rows.forEach(row => Object.assign(row, payload)); }
      if (op === "insert") {
        writes.push({ table, op, payload });
        rows = (Array.isArray(payload) ? payload : [payload]).map((row, i) => ({ id: `new-${table}-${(db[table] || []).length + i}`, ...row }));
        db[table] = [...(db[table] || []), ...rows];
      }
      if (single && rows.length > 1) return { data: null, error: { message: "Multiple rows" } };
      return { data: single ? rows[0] || null : structuredClone(rows), error: null };
    };
    const q: any = {
      select: () => q, eq: (k: string, v: any) => { filters.push([k, v]); return q; },
      order: (k: string, opts: any) => { orders.push([k, opts.ascending]); return q; },
      limit: (n: number) => { limit = n; return q; },
      maybeSingle: () => { single = true; return q; }, single: () => { single = true; return q; },
      update: (v: any) => { op = "update"; payload = v; return q; },
      insert: (v: any) => { op = "insert"; payload = v; return q; },
      then: (resolve: any, reject: any) => Promise.resolve().then(result).then(resolve, reject),
    };
    return q;
  });
  return { db, readsFail, writesFail, writes, state, toast, client, from, auth };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: m.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => m.auth }));
vi.mock("@/hooks/use-workspace-query", () => ({
  useWorkspaceId: () => m.state.workspace || m.state.user,
  useWorkspaceFilter: () => ({ column: m.state.workspace ? "workspace_id" : "user_id", value: m.state.workspace || m.state.user }),
}));
vi.mock("@/hooks/use-profile", () => ({ useProfile: () => ({}), useBrandProfile: () => ({ data: m.db.brand_profile?.[0] }) }));
vi.mock("@/hooks/use-branding", () => ({ useBrandProposition: () => ({ data: m.state.proposition, isLoading: false }), usePersona: () => ({}) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => m.client }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: async () => ({ data: { extracted: m.state.extracted }, error: null }) }));
vi.mock("@/lib/file-extractors", () => ({ extractTextFromFile: vi.fn(), ACCEPTED_MIME_TYPES: ".txt" }));
vi.mock("sonner", () => ({ toast: m.toast }));
vi.mock("@/lib/posthog", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/SubPageHeader", () => ({ default: () => null }));
vi.mock("@/components/Confetti", () => ({ default: () => null }));
vi.mock("@/components/branding/BrandingCoachingFlow", () => ({ default: () => null }));
vi.mock("framer-motion", () => ({ motion: { div: ({ children }: any) => <div>{children}</div> }, AnimatePresence: ({ children }: any) => children }));

import BrandingReview from "@/components/branding/BrandingReview";
import BrandingImportReview from "@/components/branding/BrandingImportReview";
import BrandingImportDialog from "@/components/branding/BrandingImportDialog";
import PropositionRecapPage from "@/pages/PropositionRecapPage";
import { DEFAULT_EXTRACTION } from "@/lib/branding-import-types";
import { applyPositioningToProposition } from "@/lib/positioning-write";
import { importTarget, readImportRows, saveImportRow } from "@/lib/branding-import-persistence";

const row = (id: string, fields: any = {}) => ({ id, user_id: "u1", workspace_id: "w1", ...fields });
const extract = (fields: Record<string, string>) => ({ ...DEFAULT_EXTRACTION, ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { value, confidence: "high" }])) });
const apply = async () => {
  const button = await screen.findByRole("button", { name: /Appliquer mes choix/ });
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
};
const validateAll = () => fireEvent.click(screen.getAllByText("Je valide tout")[0]);

beforeEach(() => {
  Object.keys(m.db).forEach(key => delete m.db[key]);
  m.readsFail.clear(); m.writesFail.clear(); m.writes.length = 0;
  m.state.workspace = "w1"; m.state.user = "u1"; m.state.extracted = {}; m.state.proposition = null;
  vi.clearAllMocks();
});

describe("Audit import — reviewed values and targets", () => {
  it("imports offers alone instead of silently discarding them", async () => {
    const done = vi.fn();
    render(<BrandingImportReview extraction={extract({ offers: "Cours et ressources" })} onDone={done} onCancel={() => {}} />);
    await apply(); await waitFor(() => expect(done).toHaveBeenCalled());
    expect(m.db.brand_profile[0].offer).toBe("Cours et ressources");
    expect(m.db.offers).toBeUndefined();
  });
  it("keeps positioning distinct from general offers and explicit workspace from active workspace", async () => {
    m.db.brand_profile = [row("own", { offer: "Own offer", positioning: "Own position" })];
    const done = vi.fn();
    render(<BrandingImportReview workspaceId="client" extraction={extract({ positioning: "Position client", offers: "Offres client" })} onDone={done} onCancel={() => {}} />);
    await apply(); await waitFor(() => expect(done).toHaveBeenCalled());
    expect(m.db.brand_profile[0].offer).toBe("Own offer");
    expect(m.db.brand_profile[1]).toMatchObject({ workspace_id: "client", offer: "Offres client" });
    expect(m.db.brand_proposition[0]).toMatchObject({ workspace_id: "client", version_final: "Position client" });
  });
  it("requires a choice between differing reference suggestions instead of overwriting either silently", async () => {
    const done = vi.fn();
    render(<BrandingImportReview extraction={extract({ positioning: "Position", unique_proposition: "Unique" })} onDone={done} onCancel={() => {}} />);
    await screen.findByText("Position");
    fireEvent.click(document.getElementById("positioning-replace")!);
    await apply(); await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(m.writes).toEqual([]); expect(done).not.toHaveBeenCalled();
    fireEvent.click(document.getElementById("unique_proposition-keep")!);
    await apply(); await waitFor(() => expect(done).toHaveBeenCalled());
    expect(m.db.brand_proposition[0].version_final).toBe("Position");
  });
  it("keeps existing text by default and stores the manual merge exactly", async () => {
    m.db.brand_profile = [row("brand", { mission: "Ma mission", offer: "Mon offre", voice_description: "Ma voix" })];
    const done = vi.fn();
    render(<BrandingImportReview extraction={extract({ mission: "Suggestion", offers: "Autre offre" })} onDone={done} onCancel={() => {}} />);
    await screen.findByText("Ma mission");
    expect(screen.getByRole("button", { name: /Appliquer mes choix/ })).toBeDisabled();
    fireEvent.click(document.getElementById("mission-merge")!);
    fireEvent.change(screen.getByPlaceholderText(/Modifie le texte/), { target: { value: "Mon texte validé, exactement." } });
    await apply(); await waitFor(() => expect(done).toHaveBeenCalled());
    expect(m.db.brand_profile[0]).toMatchObject({ mission: "Mon texte validé, exactement.", offer: "Mon offre", voice_description: "Ma voix" });
  });
  it("updates the chosen persona ID and preserves channels, portrait and other publics", async () => {
    m.db.persona = [row("p1", { is_primary: true, label: "Principal", step_1_frustrations: "Original" }), row("p2", { label: "Second", portrait: { deep: true }, channels: ["linkedin"] })];
    const before = structuredClone(m.db.persona[0]); const done = vi.fn();
    render(<BrandingImportReview extraction={extract({ target_frustrations: "Nouveau besoin" })} onDone={done} onCancel={() => {}} />);
    fireEvent.change(await screen.findByLabelText("Public concerné"), { target: { value: "p2" } });
    await apply(); await waitFor(() => expect(done).toHaveBeenCalled());
    expect(m.db.persona).toHaveLength(2); expect(m.db.persona[0]).toEqual(before);
    expect(m.db.persona[1]).toMatchObject({ id: "p2", step_1_frustrations: "Nouveau besoin", portrait: { deep: true }, channels: ["linkedin"] });
  });
  it("stores a reviewed story revision while preserving original, source, other histories and primary", async () => {
    m.db.storytelling = [row("s1", { title: "Première", is_primary: true, imported_text: "Original 1" }), row("s2", { title: "Deuxième", imported_text: "Original 2", source: "document", step_6_full_story: "Complet", pitch_short: "Pitch" })];
    const before = structuredClone(m.db.storytelling); const done = vi.fn();
    render(<BrandingImportReview extraction={extract({ story: "Révision validée" })} onDone={done} onCancel={() => {}} />);
    fireEvent.change(await screen.findByLabelText("Histoire concernée"), { target: { value: "s2" } });
    fireEvent.click(document.getElementById("story-replace")!);
    await apply(); await waitFor(() => expect(done).toHaveBeenCalled());
    expect(m.db.storytelling[0]).toEqual(before[0]);
    expect(m.db.storytelling[1]).toEqual({ ...before[1], step_7_polished: "Révision validée" });
  });
  it("blocks a failed read instead of inserting guessed targets or reporting an empty extraction", async () => {
    m.readsFail.add("persona");
    render(<BrandingImportReview extraction={extract({ target_frustrations: "Besoin" })} onDone={vi.fn()} onCancel={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/n’ont pas pu être chargées/);
    expect(m.writes).toEqual([]); expect(m.toast.success).not.toHaveBeenCalled();
  });
  it("retains partial successes and retries without duplicating rows", async () => {
    m.writesFail.add("persona"); const done = vi.fn();
    render(<BrandingImportReview extraction={extract({ mission: "Mission", target_frustrations: "Besoin" })} onDone={done} onCancel={() => {}} />);
    await apply(); await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(done).not.toHaveBeenCalled(); expect(m.toast.success).not.toHaveBeenCalled();
    expect(m.db.brand_profile).toHaveLength(1);
    m.writesFail.clear(); await apply(); await waitFor(() => expect(done).toHaveBeenCalled());
    expect(m.db.brand_profile).toHaveLength(1); expect(m.db.persona).toHaveLength(1);
  });
});

describe("Section import", () => {
  const setup = async (existingData = {} as any) => {
    const done = vi.fn();
    m.state.extracted = { mission: "Mission importée", ignored: "Must not save" };
    render(<BrandingImportDialog open onOpenChange={() => {}} sectionTitle="Mission" sectionTable="brand_profile" fields={[{ key: "mission", label: "Mission" }]} existingData={existingData} filterColumn="workspace_id" filterValue="w1" onImportDone={done} />);
    fireEvent.change(screen.getByPlaceholderText(/Colle ici/), { target: { value: "Notes fictives" } });
    fireEvent.click(screen.getByText("Analyser et remplir"));
    await screen.findByText("Valider l'import");
    return done;
  };
  it("creates a missing row and returns its ID", async () => {
    const done = await setup(); fireEvent.click(screen.getByText("Valider l'import"));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(done.mock.calls[0][0]).toMatchObject({ id: expect.any(String), mission: "Mission importée", workspace_id: "w1" });
    expect(m.db.brand_profile[0].ignored).toBeUndefined();
  });
  it("keeps existing fields unchecked and other fields intact when replacement is chosen", async () => {
    m.db.brand_profile = [row("b1", { mission: "Avant", brand_universe: { intact: true } })];
    const done = await setup(m.db.brand_profile[0]);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByText("Valider l'import"));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(m.db.brand_profile[0]).toMatchObject({ id: "b1", mission: "Mission importée", brand_universe: { intact: true } });
  });
  it("does not report success when the displayed ID no longer exists", async () => {
    const done = await setup(row("deleted")); fireEvent.click(screen.getByText("Valider l'import"));
    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(done).not.toHaveBeenCalled(); expect(m.toast.success).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Mission importée")).toBeInTheDocument();
  });
});

describe("Structured review", () => {
  it("preserves advanced charter values, original story and proposition variants", async () => {
    m.db.brand_charter = [row("c1", { color_primary: "#123456", logo_variants: [{ url: "logo" }], uploaded_templates: ["template"] })];
    m.db.storytelling = [row("s1", { is_primary: true, step_1_raw: "Original", imported_text: "Document", step_6_full_story: "Full", pitch_long: "Pitch" })];
    m.db.brand_proposition = [row("prop", { step_1_what: "Activité", version_final: "Référence", version_one_liner: "Courte", version_bio: "Bio", step_3_for_whom: "Public", step_2d_refuse: "Refus" })];
    const before = structuredClone(m.db);
    render(<BrandingReview analysis={{ story: { origin: "IA", full_story: "Suggestion" }, value_proposition: { key_phrase: "Nouvelle", problem: "Problème", differentiator: "Différence" }, charter: { color_primary: "#ffffff", font_body: "Inter" } }} onDone={() => {}} />);
    validateAll(); await screen.findByText("Fiche validée ! 🎉");
    expect(m.db.storytelling).toEqual(before.storytelling);
    expect(m.db.brand_proposition).toEqual(before.brand_proposition);
    expect(m.db.brand_charter[0]).toMatchObject({ ...before.brand_charter[0], font_body: "Inter" });
    expect(m.db.brand_profile[0]).toMatchObject({ target_problem: "Problème", value_prop_difference: "Différence" });
  });
  it("blocks homonyms before any new offer is written, preserving existing associations", async () => {
    m.db.offers = [row("o1", { name: "Atelier", offer_type: "free", linked_freebie_id: "x", objections: [{ response: "Réponse" }] })];
    const before = structuredClone(m.db.offers);
    render(<BrandingReview analysis={{ offers: { offers: [{ name: "Nouveau" }, { name: " ATELIER " }] } }} onDone={() => {}} />);
    validateAll(); await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(m.db.offers).toEqual(before);
    expect(screen.queryByText("Fiche validée ! 🎉")).toBeNull();
    expect(m.toast.error.mock.calls.flat().join(" ")).toContain("Renomme");
  });
  it("does not turn an offers read failure into duplicate insertion", async () => {
    m.readsFail.add("offers");
    render(<BrandingReview analysis={{ offers: { offers: [{ name: "Offre" }] } }} onDone={() => {}} />);
    validateAll(); await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(m.writes.filter(w => w.table === "offers")).toEqual([]);
  });
  it("creates multiple offers in one write with legacy workspace left null", async () => {
    m.state.workspace = "";
    render(<BrandingReview analysis={{ offers: { offers: [{ name: "A" }, { name: "B" }] } }} onDone={() => {}} />);
    validateAll(); await screen.findByText("Fiche validée ! 🎉");
    expect(m.db.offers).toHaveLength(2); expect(m.db.offers[0].workspace_id).toBeNull();
    expect(m.writes.filter(w => w.table === "offers")).toHaveLength(1);
  });
  it("does not claim a prefilled section was reviewed and keeps postponement distinct", async () => {
    const done = vi.fn();
    render(<BrandingReview preFilledSections={new Set(["story"])} analysis={{ story: { full_story: "Story" } }} onDone={done} />);
    expect(screen.getByText("0/7 validées")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Finir plus tard"));
    expect(done).toHaveBeenCalledWith(false);
  });
  it("restores reviewed sections and persists new progress without repeating an offer insert after checkpoint failure", async () => {
    const progress = vi.fn().mockRejectedValueOnce(new Error("Checkpoint failed")).mockResolvedValue(undefined);
    render(<BrandingReview analysis={{ reviewed_sections: ["story", "persona", "value_proposition", "tone_style", "content_strategy", "charter"], offers: { offers: [{ name: "A" }] } }} onProgress={progress} onDone={() => {}} />);
    validateAll(); await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(m.db.offers).toHaveLength(1); validateAll();
    await screen.findByText("Fiche validée ! 🎉");
    expect(m.db.offers).toHaveLength(1); expect(progress).toHaveBeenCalledTimes(2);
  });
});

describe("Proposition reference", () => {
  const setup = () => {
    m.state.proposition = row("prop", { version_final: "Référence originale", version_bio: "Ma bio", version_pitch_naturel: "Mon pitch", version_site_web: "Mon site", version_engagee: "Engagée", version_one_liner: "Courte", version_complete: "Legacy", recap_summary: { what_i_do: ["Mon activité"], what_i_dont: [], for_whom: "Public", for_whom_tags: [], how: [], differentiator: "Différence" } });
    m.db.brand_proposition = [m.state.proposition];
    render(<MemoryRouter><PropositionRecapPage /></MemoryRouter>);
  };
  it("edits the actual reference independently from every variant", async () => {
    setup(); const before = structuredClone(m.db.brand_proposition[0]);
    fireEvent.click(await screen.findByText("Référence originale"));
    const editor = screen.getByDisplayValue("Référence originale"); fireEvent.change(editor, { target: { value: "Référence corrigée" } }); fireEvent.blur(editor);
    await waitFor(() => expect(m.db.brand_proposition[0].version_final).toBe("Référence corrigée"));
    expect(m.db.brand_proposition[0]).toEqual({ ...before, version_final: "Référence corrigée" });
  });
  it("selects a variant explicitly without generating or rewriting the other versions", async () => {
    setup(); const before = structuredClone(m.db.brand_proposition[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Utiliser : Pitch oral / networking" }));
    await waitFor(() => expect(m.db.brand_proposition[0].version_final).toBe("Mon pitch"));
    expect(m.db.brand_proposition[0]).toEqual({ ...before, version_final: "Mon pitch" });
  });
  it("preserves the recap edit as a separate correction", async () => {
    setup();
    fireEvent.click(await screen.findByText("Mon activité")); const editor = screen.getByDisplayValue("Mon activité");
    fireEvent.change(editor, { target: { value: "Activité corrigée" } }); fireEvent.blur(editor);
    await waitFor(() => expect(m.db.brand_proposition[0].recap_summary.what_i_do[0]).toBe("Activité corrigée"));
    expect(m.db.brand_proposition[0].version_final).toBe("Référence originale");
    expect(screen.getByText(/La synthèse ci-dessous et les variantes se modifient séparément/)).toBeInTheDocument();
  });
  it("keeps two recap edits made before the first save completes", async () => {
    setup();
    fireEvent.click(await screen.findByText("Mon activité"));
    const first = screen.getByDisplayValue("Mon activité");
    fireEvent.change(first, { target: { value: "Activité corrigée" } }); fireEvent.blur(first);
    fireEvent.click(screen.getByText("Public"));
    const second = screen.getByDisplayValue("Public");
    fireEvent.change(second, { target: { value: "Public corrigé" } }); fireEvent.blur(second);
    await waitFor(() => expect(m.db.brand_proposition[0].recap_summary).toMatchObject({ what_i_do: ["Activité corrigée"], for_whom: "Public corrigé" }));
  });
  it("creates a first manually written reference without a redirect loop", async () => {
    render(<MemoryRouter><PropositionRecapPage /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("Ma formulation de référence"), { target: { value: "Mon texte à moi" } });
    fireEvent.click(screen.getByText("Enregistrer ma référence"));
    await waitFor(() => expect(m.db.brand_proposition[0]).toMatchObject({ version_final: "Mon texte à moi", workspace_id: "w1" }));
    expect(m.db.brand_proposition[0].version_bio).toBeUndefined();
  });
  it("keeps the draft open without a false modified indicator on save error", async () => {
    setup(); m.writesFail.add("brand_proposition");
    fireEvent.click(await screen.findByText("Référence originale")); const editor = screen.getByDisplayValue("Référence originale");
    fireEvent.change(editor, { target: { value: "À conserver pour réessayer" } }); fireEvent.blur(editor);
    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(screen.queryByText("✓ Modifié")).toBeNull(); expect(screen.getByDisplayValue("À conserver pour réessayer")).toBeInTheDocument();
  });
});

it("rejects ambiguous singleton targets and zero-row scoped writes", async () => {
  expect(() => importTarget([row("a"), row("b")])).toThrow(/Plusieurs fiches/);
  await expect(saveImportRow("brand_profile", { column: "workspace_id", value: "other", userId: "u1" }, "missing", { mission: "x" })).rejects.toThrow(/Aucune fiche/);
});


describe("Shared positioning import helper", () => {
  it("fills a missing reference without overwriting any existing variant or reference", async () => {
    m.db.brand_proposition = [row("p", { version_bio: "Bio" })];
    await applyPositioningToProposition("workspace_id", "w1", "u1", "Proposition");
    await applyPositioningToProposition("workspace_id", "w1", "u1", "Autre proposition");
    expect(m.db.brand_proposition[0]).toMatchObject({ version_final: "Proposition", version_bio: "Bio" });
    expect(m.writes).toHaveLength(1);
  });
  it("propagates a failed lookup instead of inserting a second reference", async () => {
    m.readsFail.add("brand_proposition");
    await expect(applyPositioningToProposition("workspace_id", "w1", "u1", "Proposition")).rejects.toBeTruthy();
    expect(m.writes).toEqual([]);
  });
});
