import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { calendarWeek } from "./calendar-week.ts";
Deno.test("selected calendar week ignores current date and includes Sunday", () => {
  assertEquals(calendarWeek("2040-01-02"), { from: "2040-01-02", to: "2040-01-08" });
  assertEquals(calendarWeek("2026-10-25"), { from: "2026-10-19", to: "2026-10-25" });
});
Deno.test("rejects impossible calendar dates", () => {
  assertThrows(() => calendarWeek("2026-02-30"));
  assertThrows(() => calendarWeek("oops"));
});
import { keepPlanInDays, parisToday, remainingWeekDays } from "./calendar-week.ts";
Deno.test("current week: only today and the days after it", () => {
  const week = calendarWeek("2026-11-09");
  assertEquals(remainingWeekDays(week, "2026-11-13"), ["Vendredi", "Samedi", "Dimanche"]);
  assertEquals(remainingWeekDays(week, "2026-11-15"), ["Dimanche"]);
  assertEquals(remainingWeekDays(week, "2026-11-09").length, 7);
  assertEquals(remainingWeekDays(week, "2026-11-05").length, 7);
  assertEquals(remainingWeekDays(week, "2026-11-20").length, 7);
  assertEquals(remainingWeekDays(week, "oops").length, 7);
});
Deno.test("past days of a plan move to the remaining days", () => {
  const days = ["Vendredi", "Samedi", "Dimanche"];
  assertEquals(keepPlanInDays([{ day: "Lundi" }, { day: "Jeudi" }], days).map((p) => p.day), ["Vendredi", "Samedi"]);
  assertEquals(keepPlanInDays([{ day: "Lundi" }, { day: "Vendredi" }], days).map((p) => p.day), ["Samedi", "Vendredi"]);
  assertEquals(keepPlanInDays([{ day: "Lundi" }, { day: "Mardi" }], ["Dimanche"]).map((p) => p.day), ["Dimanche", "Dimanche"]);
});
Deno.test("Paris date", () => {
  assertEquals(parisToday(new Date("2026-11-13T23:30:00Z")), "2026-11-14");
});
