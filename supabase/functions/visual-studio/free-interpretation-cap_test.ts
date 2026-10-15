// Plafond quotidien des discussions du Studio pour le plan Gratuit (15/10/2026).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FREE_DAILY_INTERPRETATIONS, freeInterpretationCapReached } from "./free-interpretation-cap.ts";

Deno.env.set("SUPABASE_URL", "http://localhost");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test");

const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const WS = "00000000-0000-4000-8000-0000000000bb";

function fakeSb(count: number) {
  const calls: string[] = [];
  // deno-lint-ignore no-explicit-any
  const b: any = {};
  b.select = () => b;
  b.eq = (col: string, v: string) => { calls.push(`${col}=${v}`); return b; };
  b.gt = (col: string) => { calls.push(`${col}>`); return Promise.resolve({ count, error: null }); };
  return { sb: { from: (t: string) => { calls.push(t); return b; } }, calls };
}
const plan = (p: string, reason?: string) => () => Promise.resolve({ allowed: true, plan: p, reason } as never);

Deno.test("gratuit : bloqué à partir de 15 demandes sur 24 h", async () => {
  const { sb, calls } = fakeSb(FREE_DAILY_INTERPRETATIONS);
  assertEquals(await freeInterpretationCapReached(sb, ACTOR, WS, plan("free")), true);
  assertEquals(calls.includes("visual_studio_interpretations"), true);
  assertEquals(calls.includes(`user_id=${ACTOR}`), true);
});

Deno.test("gratuit : passe à 14 demandes", async () => {
  const { sb } = fakeSb(FREE_DAILY_INTERPRETATIONS - 1);
  assertEquals(await freeInterpretationCapReached(sb, ACTOR, WS, plan("free")), false);
});

Deno.test("Premium, Binôme et admin : jamais bloqués par ce plafond", async () => {
  for (const p of ["outil", "binome", "admin"]) {
    const { sb, calls } = fakeSb(99);
    assertEquals(await freeInterpretationCapReached(sb, ACTOR, WS, plan(p)), false);
    assertEquals(calls.length, 0);
  }
});

Deno.test("lecture du plan en erreur : on laisse passer (la limite SQL reste le filet)", async () => {
  const { sb } = fakeSb(99);
  assertEquals(await freeInterpretationCapReached(sb, ACTOR, WS, plan("free", "error")), false);
});
