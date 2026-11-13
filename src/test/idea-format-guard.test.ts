// Une fiche de Mes idées n'est jamais réécrite par un contenu d'un autre format (13/11/2026).
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { ideaFormatFamily, ideaTakesFormat } from "@/features/creer/idea-format-guard";

describe("idea-format-guard", () => {
  it("regroupe les noms d'un même format", () => {
    expect(ideaFormatFamily("story_serie")).toBe(ideaFormatFamily("story"));
    expect(ideaFormatFamily("post_carrousel")).toBe("carousel");
    expect(ideaFormatFamily("pinterest_photo")).toBe("pinterest");
    expect(ideaFormatFamily("Reel")).toBe("reel");
  });

  it("même format, format inconnu ou fiche sans contenu écrit : la fiche reçoit le contenu", () => {
    expect(ideaTakesFormat({ format: "carousel", content_data: { slides: [1] } }, "carousel")).toBe(true);
    expect(ideaTakesFormat({ format: "story", content_data: { stories: [1] } }, "story_serie")).toBe(true);
    expect(ideaTakesFormat({ format: null, content_data: { slides: [1] } }, "reel")).toBe(true);
    expect(ideaTakesFormat({ format: "carousel", content_data: null }, "reel")).toBe(true);
    expect(ideaTakesFormat({ format: "post", content_data: { _creer_draft: { version: 1, flow: {} } } }, "reel")).toBe(true);
    expect(ideaTakesFormat(null, "reel")).toBe(true);
  });

  it("autre format avec un contenu écrit : jamais réécrite", () => {
    expect(ideaTakesFormat({ format: "carousel", content_data: { slides: [1] } }, "reel")).toBe(false);
    expect(ideaTakesFormat({ format: "reel", content_data: JSON.stringify({ script: [1] }) }, "post")).toBe(false);
    expect(ideaTakesFormat({ format: "post", content_data: { content: "Mon texte" } }, "linkedin")).toBe(false);
  });
});
