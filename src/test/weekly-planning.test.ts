import { expect, it } from "vitest";
import { planningDayDate, planningChannel, planningFormat, planningWeekLabel, remainingPlanningDays } from "@/lib/weekly-planning";
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

it("remainingPlanningDays keeps only the days left in the current week", () => {
  expect(remainingPlanningDays("2026-11-09", "2026-11-13")).toEqual(["Vendredi", "Samedi", "Dimanche"]);
  expect(remainingPlanningDays("2026-11-09", "2026-11-09")).toHaveLength(7);
  expect(remainingPlanningDays("2026-11-16", "2026-11-13")).toHaveLength(7);
  expect(remainingPlanningDays("2026-11-02", "2026-11-13")).toHaveLength(7);
});

it("planningWeekLabel reads like a date, not 2026-11-09", () => {
  expect(planningWeekLabel("2026-11-09")).toBe("du 9 au 15 novembre");
  expect(planningWeekLabel("2026-11-30")).toBe("du 30 novembre au 6 décembre");
  expect(planningWeekLabel("2026-06-01")).toBe("du 1er au 7 juin");
});
