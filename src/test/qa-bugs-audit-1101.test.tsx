import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import StatsReading, { defaultStatsMetric } from "@/components/stats/StatsReading";
import ConfirmResetDialog from "@/components/creer/ConfirmResetDialog";
import { computeDraftConflict } from "@/features/creer/draft-conflict";
import { clearDeletedAccountStorage } from "@/lib/storage-cleanup";

const base = { photoCount: 0, aurianaDemoActive: false, isFreshStart: false, paramSujet: "", paramIdeaId: null, paramAuto: false, paramFormat: null, paramCanal: null };

describe("audit du 01/11/2026", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it("rouvrir le contenu déjà en cours ne demande rien ; un autre contenu, si", () => {
    const existingFlowState: any = { step: "result", ideaText: "Sujet", result: { raw: { type: "x", slides: [{ before: 1, after: 2 }] } }, editingIdeaId: "a" };
    const same = { format: "carousel", raw: { slides: [{ after: 2, before: 1 }], type: "x", _carousel_base_updated_at: "t" } };
    const edited = { format: "carousel", raw: { type: "x", slides: [{ before: 9, after: 2 }] } };
    expect(computeDraftConflict({ ...base, existingFlowState, locState: { ideaId: "a", resumeIdea: same } })).toBeNull();
    expect(computeDraftConflict({ ...base, existingFlowState, locState: { ideaId: "a", resumeIdea: edited } })).not.toBeNull();
    expect(computeDraftConflict({ ...base, existingFlowState, locState: { ideaId: "b", resumeIdea: same } })).not.toBeNull();
  });

  it("statistiques : ne s'ouvrent sur Instagram que pour qui l'utilise ou sans réponse", () => {
    expect(defaultStatsMetric(["website", "linkedin"])).toBe("website_visitors");
    expect(defaultStatsMetric(["linkedin"])).toBe("clients_signed");
    expect(defaultStatsMetric(["instagram"])).toBe("reach");
    expect(defaultStatsMetric(null)).toBe("reach");
  });

  it("statistiques vides : pas de phrase d'unité orpheline", () => {
    render(<StatsReading rows={[]} from="2026-09-01" to="2026-11-01" currentMonth="2026-11-01" onData={vi.fn()} />);
    expect(screen.queryByText(/par mois renseigné/)).toBeNull();
  });

  it("Repartir de zéro : ne parle pas d'effacement si le contenu est dans Mes idées", () => {
    render(<ConfirmResetDialog open onOpenChange={vi.fn()} photoCount={2} onConfirm={vi.fn()} savedInIdeas />);
    expect(screen.getByText(/reste dans Mes idées/)).toBeInTheDocument();
    expect(screen.queryByText(/irréversible/)).toBeNull();
  });

  it("suppression : plus aucun repère du compte dans le navigateur", () => {
    localStorage.setItem("lac_ideas_todo_count:u", "4");
    localStorage.setItem("branding_skip_import_w", "1");
    sessionStorage.setItem("creer_flow_reset_at:u:w", "1");
    clearDeletedAccountStorage("u");
    expect(localStorage.getItem("lac_ideas_todo_count:u")).toBeNull();
    expect(localStorage.getItem("branding_skip_import_w")).toBeNull();
    expect(sessionStorage.getItem("creer_flow_reset_at:u:w")).toBeNull();
  });
});
