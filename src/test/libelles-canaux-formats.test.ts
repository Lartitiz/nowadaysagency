import { describe, it, expect } from "vitest";
import { channelLabel } from "@/lib/channel-labels";
import { formatLabel } from "@/lib/idea-state";
import { stockKeywordLabel, stockSearchFor } from "@/lib/stock-photos";

describe("libellés lisibles (passe complète du 16/10)", () => {
  it("canaux : jamais la clé brute en minuscules", () => {
    expect(channelLabel("instagram")).toBe("Instagram");
    expect(channelLabel("linkedin")).toBe("LinkedIn");
    expect(channelLabel("website")).toBe("Site web");
    expect(channelLabel("")).toBe("");
  });

  it("formats : « carousel » et « epingle » prennent leurs mots français, accent compris", () => {
    expect(formatLabel("carousel")).toBe("Carrousel");
    expect(formatLabel("epingle")).toBe("Épingle Pinterest");
    expect(formatLabel("epingle_idee")).toBe("Épingle idée");
    expect(formatLabel("format_inconnu")).toBe("Format inconnu");
  });

  it("photos libres de droits : libellé français affiché, requête anglaise envoyée", () => {
    const labels = { "closed pottery kiln studio": "four de potière dans l'atelier" };
    expect(stockKeywordLabel("closed pottery kiln studio", labels)).toBe("four de potière dans l'atelier");
    expect(stockSearchFor("four de potière dans l'atelier", labels)).toEqual({ term: "closed pottery kiln studio", locale: "en-US" });
    expect(stockSearchFor("atelier céramique", labels)).toEqual({ term: "atelier céramique", locale: "fr-FR" });
  });
});
