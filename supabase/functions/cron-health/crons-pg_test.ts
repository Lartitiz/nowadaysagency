import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { intervalleMinutes, jugerCrons } from "./crons-pg.ts";

Deno.test("intervalleMinutes : formes utilisées par les automates de l'app", () => {
  assertEquals(intervalleMinutes("*/5 * * * *"), 5);
  assertEquals(intervalleMinutes("30 8 * * *"), 1440);
  assertEquals(intervalleMinutes("30 4 1 * *"), 44640);
  assertEquals(intervalleMinutes("0 9 * * 1"), null);
});

Deno.test("jugerCrons : vivant, en retard, en échec, inactif, jamais passé", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  const base = { schedule: "*/5 * * * *", active: true, last_status: "succeeded", last_message: null };
  const v = jugerCrons([
    { ...base, jobname: "ok", last_start: "2026-10-14T11:57:00Z" },
    { ...base, jobname: "lent", last_start: "2026-10-14T11:00:00Z" },
    { ...base, jobname: "echec", last_start: "2026-10-14T11:58:00Z", last_status: "failed", last_message: "boom" },
    { ...base, jobname: "off", active: false, last_start: "2026-10-14T11:58:00Z" },
    { ...base, jobname: "jamais", last_start: null, last_status: null },
  ], now);
  assertEquals(v.map((x) => x.en_panne), [false, true, true, true, true]);
  assertEquals(v[2].raison, "dernier passage en échec : boom");
});
