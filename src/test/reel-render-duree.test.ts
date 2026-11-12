import { describe, it, expect, vi, beforeEach } from "vitest";

// Garde des 60 s du moteur de montage (QA reel du 12/11/2026) : un script de
// 62 s finissait sur « Movie duration (62s) is longer than your plan allowance
// (60s). Upgrade your plan », en anglais, après une minute d'attente.
const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { MAX_REEL_SECONDS, readableRenderMessage, renderPlanSeconds, submitReelRender, pollReelRender } from "@/lib/reel-render";

const plan = (durations: number[]) => ({ voice_mode: "silent" as const, sections: durations.map((duration) => ({ clip_url: "https://clips.test/a.mp4", duration })) });

describe("garde des 60 s du montage", () => {
  beforeEach(() => invoke.mockReset());

  it("additionne la durée des passages", () => {
    expect(renderPlanSeconds(plan([9, 7, 10, 8, 14, 8, 6]))).toBe(62);
  });

  it("refuse AVANT l'envoi un reel trop long, en français", async () => {
    await expect(submitReelRender(plan([9, 7, 10, 8, 14, 8, 6]))).rejects.toThrow(/environ 62 s.*60 s.*Éditer le texte/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("laisse partir un reel de 60 s pile", async () => {
    invoke.mockResolvedValue({ data: { project: "p1" }, error: null });
    await expect(submitReelRender(plan([30, 30]))).resolves.toBe("p1");
    expect(MAX_REEL_SECONDS).toBe(60);
  });

  it("traduit le refus anglais du moteur s'il arrive quand même", async () => {
    expect(readableRenderMessage("Movie duration (62s) is longer than your plan allowance (60s). Upgrade your plan")).toMatch(/^Ton reel dure environ 62 s, et le montage automatique s'arrête à 60 s/);
    expect(readableRenderMessage("Autre souci")).toBe("Autre souci");
    invoke.mockResolvedValue({ data: { status: "error", url: null, message: "Movie duration (61.5s) is longer than your plan allowance (60s). Upgrade your plan" }, error: null });
    await expect(pollReelRender("p1", { intervalMs: 0, maxTries: 1 })).rejects.toThrow(/environ 62 s/);
  });
});
