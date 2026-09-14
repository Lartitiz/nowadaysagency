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
