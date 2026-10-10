import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hedgedStructureCall, type HedgeReport, STRUCTURE_DEADLINE_MS, STRUCTURE_HEDGE_AFTER_MS, StructureDeadlineError } from "./structure-hedge.ts";

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); reject(new Error("annulé")); }, { once: true });
});

// Miroir de STRUCTURE_PROPOSAL_TIMEOUT_MS (src/hooks/use-do-generate.ts, vérifié côté front).
const SCREEN_TIMEOUT_MS = 170_000;

Deno.test("plan : réglages sous le délai de l'écran (170 s) et second appel encore possible", () => {
  assert(STRUCTURE_DEADLINE_MS + 10_000 <= SCREEN_TIMEOUT_MS, "le serveur doit répondre avant que l'écran ne coupe");
  // Un plan prend 56 à 72 s : le second appel doit avoir le temps de finir.
  assert(STRUCTURE_DEADLINE_MS - STRUCTURE_HEDGE_AFTER_MS >= 75_000);
  // Ne pas doubler les appels normaux (mesurés jusqu'à 72 s).
  assert(STRUCTURE_HEDGE_AFTER_MS >= 78_000);
});

Deno.test("plan rapide : un seul appel", async () => {
  let report: HedgeReport | undefined;
  const calls: number[] = [];
  const v = await hedgedStructureCall(async (n) => { calls.push(n); await wait(10); return "plan"; },
    { hedgeAfterMs: 100, deadlineMs: 300, onReport: (r) => report = r });
  assertEquals(v, "plan");
  assertEquals(calls, [1]);
  assertEquals(report?.winner, 1);
  assertEquals(report?.calls, 1);
});

Deno.test("plan lent : le second appel part et gagne, le premier est annulé", async () => {
  let report: HedgeReport | undefined;
  let firstAborted = false;
  const v = await hedgedStructureCall(async (n, signal) => {
    if (n === 1) {
      signal.addEventListener("abort", () => firstAborted = true);
      await wait(500, signal);
      return "lent";
    }
    await wait(20, signal);
    return "second";
  }, { hedgeAfterMs: 50, deadlineMs: 400, onReport: (r) => report = r });
  assertEquals(v, "second");
  assertEquals(report?.winner, 2);
  assertEquals(report?.calls, 2);
  assert(firstAborted, "le premier appel doit être coupé une fois le plan reçu");
});

Deno.test("plan lent : le premier peut encore finir avant le second", async () => {
  const v = await hedgedStructureCall(async (n, signal) => {
    await wait(n === 1 ? 70 : 200, signal);
    return `appel ${n}`;
  }, { hedgeAfterMs: 50, deadlineMs: 400 });
  assertEquals(v, "appel 1");
});

Deno.test("échec rapide du premier (plan vide) : relance immédiate", async () => {
  const started: number[] = [];
  const t0 = Date.now();
  let report: HedgeReport | undefined;
  const v = await hedgedStructureCall(async (n) => {
    started.push(Date.now() - t0);
    if (n === 1) { await wait(10); throw new Error("structure_vide"); }
    await wait(10);
    return "plan";
  }, { hedgeAfterMs: 200, deadlineMs: 600, onReport: (r) => report = r });
  assertEquals(v, "plan");
  assert(started[1] < 150, `relance attendue tout de suite, pas après ${started[1]} ms`);
  assertEquals(report?.first_error, "structure_vide");
});

Deno.test("deux échecs : l'erreur du second remonte", async () => {
  await assertRejects(() => hedgedStructureCall(async (n) => {
    await wait(5);
    throw new Error(`échec ${n}`);
  }, { hedgeAfterMs: 50, deadlineMs: 400 }), Error, "échec 2");
});

Deno.test("échéance : tout est annulé et une erreur claire remonte", async () => {
  const aborted: number[] = [];
  let report: HedgeReport | undefined;
  await assertRejects(() => hedgedStructureCall(async (n, signal) => {
    signal.addEventListener("abort", () => aborted.push(n));
    await wait(1_000, signal);
    return "trop tard";
  }, { hedgeAfterMs: 30, deadlineMs: 100, onReport: (r) => report = r }), StructureDeadlineError);
  assertEquals(aborted.sort(), [1, 2]);
  assertEquals(report?.timed_out, true);
});

Deno.test("le temps de préparation déjà écoulé compte dans l'échéance et le second appel", async () => {
  const t0 = Date.now();
  const started: number[] = [];
  const v = await hedgedStructureCall(async (n, signal) => {
    started.push(Date.now() - t0);
    await wait(n === 1 ? 500 : 10, signal);
    return `appel ${n}`;
  }, { elapsedMs: 80, hedgeAfterMs: 100, deadlineMs: 400 });
  assertEquals(v, "appel 2");
  assert(started[1] < 70, `second appel attendu ~20 ms après le début, pas ${started[1]} ms`);
});
