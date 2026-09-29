import { expect, it } from "vitest";
import { cleanStudioSummary } from "@/features/visual-studio/summary";

it("retire l'enveloppe technique d'une ancienne proposition sans couper le brief", () => {
  expect(cleanStudioSummary("<summary>Un bol sur la table.\nLumière douce.</summary>\n<parameter name=\"format\">square"))
    .toBe("Un bol sur la table.\nLumière douce.");
  expect(cleanStudioSummary("Un bol sur la table.")).toBe("Un bol sur la table.");
});
