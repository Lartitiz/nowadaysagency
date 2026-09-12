import { expect, it } from "vitest";
import { collectCoachingProposals } from "@/lib/coaching-proposals";
it("retains separate variants and requires explicit choice instead of silently taking the last one", () => {
  const proposals = [{ field: "description_short", label: "Description", value: "Version A" }, { field: "description_short", label: "Description", value: "Version B" }];
  const edits = { "0:description_short": "Version A corrigée", "1:description_short": "" };
  expect(() => collectCoachingProposals(proposals, edits, {})).toThrow(/Choisis/);
  expect(collectCoachingProposals(proposals, edits, { description_short: 0 })).toEqual({ description_short: "Version A corrigée" });
  expect(collectCoachingProposals(proposals, edits, { description_short: 1 })).toEqual({ description_short: "" });
  expect(proposals[1].value).toBe("Version B");
});
