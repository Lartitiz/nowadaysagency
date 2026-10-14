import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, waitFor, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

// « Enregistrer dans Mes idées » sur une idée déjà ouverte (lot 10, 14/10/2026) :
// même contrôle de version que l'autosave carrousel et le retour calendrier.
// Si l'idée a changé ailleurs depuis son ouverture, rien n'est écrasé et on
// propose une copie ou le rechargement de la dernière version.

type Row = Record<string, any>;
const db = vi.hoisted(() => ({
  rows: new Map<string, Row>(),
  updates: [] as { payload: Row; filters: [string, string, unknown][] }[],
  inserts: [] as Row[],
  clock: 0,
}));

function nextVersion() {
  db.clock += 1;
  return `2026-10-14T10:00:0${db.clock}.000000+00:00`;
}

// Faux client Supabase : juste ce que le dialogue utilise sur saved_ideas.
function query(kind: "select" | "update" | "insert", payload?: Row) {
  const filters: [string, string, unknown][] = [];
  const matches = (row: Row) => filters.every(([op, col, val]) => (op === "is" ? row[col] === val : row[col] === val));
  const run = () => {
    if (kind === "insert") {
      const id = `copy-${db.inserts.length + 1}`;
      const row = { ...payload, id, updated_at: nextVersion() };
      db.inserts.push(payload!);
      db.rows.set(id, row);
      return row;
    }
    const found = [...db.rows.values()].filter(matches)[0] ?? null;
    if (kind === "update") {
      db.updates.push({ payload: payload!, filters: [...filters] });
      if (!found) return null;
      Object.assign(found, payload, { updated_at: nextVersion() });
    }
    return found ? { ...found } : null;
  };
  const builder: any = {
    eq: (col: string, val: unknown) => { filters.push(["eq", col, val]); return builder; },
    is: (col: string, val: unknown) => { filters.push(["is", col, val]); return builder; },
    select: () => builder,
    maybeSingle: async () => ({ data: run(), error: null }),
    single: async () => {
      const data = run();
      return data ? { data, error: null } : { data: null, error: { code: "PGRST116", message: "0 rows" } };
    },
  };
  return builder;
}

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), loading: vi.fn() },
  clearFlowState: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => query("select"),
      update: (payload: Row) => query("update", payload),
      insert: (payload: Row) => query("insert", payload),
    }),
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "u1" }));
vi.mock("@/hooks/use-flow-persistence", () => ({ clearFlowState: mocks.clearFlowState }));
vi.mock("@/lib/carousel-media", () => ({ externalizeCarouselMedia: async (value: unknown) => value }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/components/ui/textarea-with-voice", () => ({
  TextareaWithVoice: (props: any) => <textarea {...props} />,
}));

import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";

const V1 = "2026-10-14T09:00:00.000000+00:00";

function seedIdea() {
  db.rows.set("idea-1", {
    id: "idea-1", titre: "📸 Mes prix", angle: "vente", format: "post", canal: "instagram",
    objectif: "confiance", content_data: { content: "Version de l'autre onglet" },
    content_draft: "Version de l'autre onglet", updated_at: V1,
  });
}

let lastLocation: { pathname: string; search: string; state: any } | null = null;
function LocationProbe() {
  const location = useLocation();
  lastLocation = { pathname: location.pathname, search: location.search, state: location.state };
  return null;
}

function mount(extra: Record<string, unknown> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    onSaved: vi.fn(),
    contentType: "post_instagram" as const,
    subject: "Mes prix",
    contentData: { content: "Ma version retouchée ici" },
    sourceModule: "creer",
    format: "post",
    editingIdeaId: "idea-1",
    ...extra,
  };
  render(
    <MemoryRouter initialEntries={["/creer"]}>
      <Routes>
        <Route path="*" element={<><SaveToIdeasDialog {...props} /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
  return props;
}

const clickSave = () => fireEvent.click(screen.getByText("Enregistrer dans Mes idées"));
const otherTabSaves = () => Object.assign(db.rows.get("idea-1")!, {
  content_data: { content: "Version de l'autre onglet, retouchée" }, updated_at: nextVersion(),
});

describe("SaveToIdeasDialog — contrôle de version d'une idée existante", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.rows.clear();
    db.updates.length = 0;
    db.inserts.length = 0;
    db.clock = 0;
    lastLocation = null;
    seedIdea();
  });

  it("met à jour l'idée quand personne ne l'a modifiée depuis son ouverture", async () => {
    const props = mount();
    clickSave();
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith("idea-1", true));
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].filters).toContainEqual(["eq", "updated_at", V1]);
    expect(db.rows.get("idea-1")!.content_data).toEqual({ content: "Ma version retouchée ici", _ai_generated: true });
    expect(mocks.toast.success).toHaveBeenCalledWith("Contenu mis à jour dans Mes idées → En cours.");
  });

  it("deux enregistrements de suite dans le même onglet : pas de faux conflit", async () => {
    const props = mount();
    clickSave();
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    const afterFirstSave = db.rows.get("idea-1")!.updated_at;
    clickSave();
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Une version plus récente existe")).toBeNull();
    expect(db.updates[1].filters).toContainEqual(["eq", "updated_at", afterFirstSave]);
  });

  it("visuels ajoutés après le texte : le 2ᵉ enregistrement ne voit pas de faux conflit", async () => {
    const props = mount({
      format: "carousel",
      visualSlides: [{ slide_number: 1, html: "<div>1</div>" }],
      onUploadVisuals: async () => ["https://x/1.png"],
    });
    clickSave();
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    // Texte puis visuels : deux écritures de cet onglet.
    expect(db.updates).toHaveLength(2);
    const afterVisuals = db.rows.get("idea-1")!.updated_at;
    clickSave();
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Une version plus récente existe")).toBeNull();
    expect(db.updates[2].filters).toContainEqual(["eq", "updated_at", afterVisuals]);
  });

  it("idée modifiée dans un autre onglet : rien n'est écrasé, le choix est proposé", async () => {
    const rollback = vi.fn(async () => {});
    const props = mount({
      onPrepareContent: async (content: Row) => ({ contentData: { ...content, image_url: "https://x/p.png" }, rollback }),
    });
    // Laisse la lecture de version à l'ouverture se faire, puis l'autre onglet enregistre.
    await new Promise((r) => setTimeout(r, 0));
    otherTabSaves();
    clickSave();

    await screen.findByText("Une version plus récente existe");
    expect(db.rows.get("idea-1")!.content_data).toEqual({ content: "Version de l'autre onglet, retouchée" });
    expect(props.onSaved).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    // Les photos téléversées pour cette écriture refusée sont retirées.
    expect(rollback).toHaveBeenCalled();
    expect(screen.getByText("Enregistrer une copie de mon contenu")).toBeTruthy();
    expect(screen.getByText("Recharger la dernière version")).toBeTruthy();
  });

  it("« Enregistrer une copie » crée une nouvelle idée et laisse l'autre version intacte", async () => {
    const props = mount();
    await new Promise((r) => setTimeout(r, 0));
    otherTabSaves();
    clickSave();
    fireEvent.click(await screen.findByText("Enregistrer une copie de mon contenu"));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith("copy-1", true));
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0].titre).toBe("📸 Mes prix (copie)");
    expect(db.inserts[0].content_data).toEqual({ content: "Ma version retouchée ici", _ai_generated: true });
    expect(db.rows.get("idea-1")!.content_data).toEqual({ content: "Version de l'autre onglet, retouchée" });
    expect(mocks.toast.success).toHaveBeenCalledWith("Copie enregistrée dans Mes idées → En cours. L’autre version n’a pas été touchée.");
  });

  it("« Recharger la dernière version » retire la copie de secours et rouvre l'idée enregistrée", async () => {
    mount();
    await new Promise((r) => setTimeout(r, 0));
    otherTabSaves();
    clickSave();
    fireEvent.click(await screen.findByText("Recharger la dernière version"));

    await waitFor(() => expect(lastLocation?.search).toContain("idea_id=idea-1"));
    expect(mocks.clearFlowState).toHaveBeenCalled();
    expect(lastLocation!.pathname).toBe("/creer");
    expect(lastLocation!.state.ideaId).toBe("idea-1");
    expect(lastLocation!.state.resumeIdea.raw.content).toBe("Version de l'autre onglet, retouchée");
    expect(db.updates).toHaveLength(1); // seule la tentative refusée
  });

  it("idée supprimée entre-temps : propose seulement de l'enregistrer comme nouvelle idée", async () => {
    const props = mount();
    await new Promise((r) => setTimeout(r, 0));
    db.rows.delete("idea-1");
    clickSave();

    await screen.findByText("Cette idée n’existe plus dans Mes idées");
    expect(screen.queryByText("Recharger la dernière version")).toBeNull();
    fireEvent.click(screen.getByText("Enregistrer comme nouvelle idée"));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith("copy-1", true));
  });
});
