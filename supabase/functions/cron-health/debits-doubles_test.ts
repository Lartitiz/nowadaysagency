// Ligne « 💳 Débits en double » du bilan du lundi (16/11/2026).
//   deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/cron-health/debits-doubles_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { debitsDoubles } from "./debits-doubles.ts";

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 16, 9);
const fenetres = { curFrom: now - 7 * DAY, curTo: now, prevFrom: now - 14 * DAY, prevTo: now - 7 * DAY };
const debit = (user_id: string, created_at: string, action_type = "carousel_express_full") => ({ user_id, action_type, created_at });
const ligne = (user_id: string, created_at: string, total_ms: number, format = "carousel_express_full") => ({ user_id, format, created_at, content_preview: { durees: { total_ms } } });

Deno.test("débits en double : le cas réel du 13/11/2026 est compté (2e création lancée pendant la 1re)", () => {
  const ai = [debit("cliente", "2026-11-13T17:56:55.563Z"), debit("cliente", "2026-11-13T17:58:59.100Z"), debit("cliente", "2026-11-13T17:59:18.000Z", "carousel_visual")];
  const cqAll = [ligne("cliente", "2026-11-13T17:56:48.257Z", 190_474), ligne("cliente", "2026-11-13T17:58:53.289Z", 192_326)];
  const out = debitsDoubles({ ai, aiRows: ai, cqAll, internalIds: new Set(), ...fenetres });
  assertEquals({ n: out.n, clientes: out.clientes, n_s1: out.n_s1, internes: out.internes }, { n: 1, clientes: 1, n_s1: 0, internes: 0 });
  assertEquals(out.exemples, [{ action: "carousel_express_full", ecart_s: 124, quand: "2026-11-13T17:58:59.100Z" }]);
});

Deno.test("débits en double : deux créations enchaînées, formats différents ou images ne comptent pas", () => {
  const ai = [
    // Enchaînées : la 2e (120 s) a démarré 60 s après le débit de la 1re.
    debit("a", "2026-11-12T10:00:00Z"), debit("a", "2026-11-12T10:03:00Z"),
    // Formats différents.
    debit("b", "2026-11-12T10:00:00Z"), debit("b", "2026-11-12T10:01:00Z", "carousel_photo"),
    // Une ligne par image : jamais un double.
    debit("c", "2026-11-12T10:00:00Z", "carousel_visual"), debit("c", "2026-11-12T10:00:02Z", "carousel_visual"),
    // Même format, 10 minutes d'écart.
    debit("d", "2026-11-12T10:00:00Z"), debit("d", "2026-11-12T10:10:00Z"),
  ];
  const cqAll = [ligne("a", "2026-11-12T10:02:55Z", 120_000)];
  assertEquals(debitsDoubles({ ai, aiRows: ai, cqAll, internalIds: new Set(), ...fenetres }).n, 0);
});

Deno.test("débits en double : durée inconnue = compté ; internes et S-1 à part", () => {
  const clientes = [
    debit("a", "2026-11-12T10:00:00Z"), debit("a", "2026-11-12T10:02:00Z"),
    debit("b", "2026-11-05T10:00:00Z", "carousel_mix"), debit("b", "2026-11-05T10:01:30Z", "carousel_mix"),
  ];
  const internes = [debit("admin", "2026-11-12T10:00:00Z", "carousel_photo"), debit("admin", "2026-11-12T10:00:01Z", "carousel_photo")];
  const out = debitsDoubles({ ai: clientes, aiRows: [...clientes, ...internes], cqAll: [], internalIds: new Set(["admin"]), ...fenetres });
  assertEquals({ n: out.n, clientes: out.clientes, n_s1: out.n_s1, internes: out.internes }, { n: 1, clientes: 1, n_s1: 1, internes: 1 });
});

Deno.test("débits en double : aucune ligne = zéros, pas d'erreur", () => {
  assertEquals(debitsDoubles({ ai: [], aiRows: [], cqAll: [], internalIds: new Set(), curFrom: 0, curTo: 1, prevFrom: 0, prevTo: 0 }), { n: 0, clientes: 0, n_s1: 0, internes: 0, exemples: [] });
});
