import { expect, it } from "vitest";
import { planningDayDate, planningChannel, planningFormat } from "@/lib/weekly-planning";
it("places all days in the selected week, including Sunday and DST", () => {
  expect(planningDayDate("Lundi", "2026-10-19")).toBe("2026-10-19");
  expect(planningDayDate("Dimanche", "2026-10-19")).toBe("2026-10-25");
  expect(() => planningDayDate("Unknown", "2026-10-19")).toThrow();
});
it("preserves newsletter and selected channels with compatible formats", () => {
  expect(planningChannel("newsletter", "instagram")).toBe("newsletter");
  expect(planningChannel("carousel", "linkedin")).toBe("linkedin");
  expect(planningFormat("carousel", "instagram")).toBe("post_carrousel");
  expect(planningFormat("post", "linkedin")).toBe("linkedin");
  expect(planningFormat("post", "pinterest")).toBe("pinterest");
});
