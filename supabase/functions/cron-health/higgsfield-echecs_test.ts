import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { jugerEchecsHiggsfield } from "./higgsfield-echecs.ts";

const NOW = Date.UTC(2026, 10, 12, 12);
const J = 24 * 3600000;
const il = (j: number) => new Date(NOW - j * J).toISOString();
const DEPUIS = NOW - 7 * J;

Deno.test("2 échecs, aucune réussite sur 7 j → alerte", () => {
  const r = jugerEchecsHiggsfield([
    { status: "failed", created_at: il(1) },
    { status: "failed", created_at: il(2) },
    { status: "completed", created_at: il(9) }, // hors fenêtre
  ], DEPUIS);
  assertEquals(r.reussies_7j, 0);
  assertEquals(r.echecs_7j, 2);
  assertEquals(typeof r.alerte, "string");
});

Deno.test("une réussite dans la semaine → pas d'alerte", () => {
  const r = jugerEchecsHiggsfield([
    { status: "failed", created_at: il(1) },
    { status: "failed", created_at: il(2) },
    { status: "completed", created_at: il(3) },
  ], DEPUIS);
  assertEquals(r.alerte, null);
  assertEquals(r.reussies_7j, 1);
});

Deno.test("un seul échec ou aucun usage → pas d'alerte", () => {
  assertEquals(jugerEchecsHiggsfield([{ status: "failed", created_at: il(1) }], DEPUIS).alerte, null);
  assertEquals(jugerEchecsHiggsfield([], DEPUIS).alerte, null);
});

Deno.test("en cours et incertaines ne comptent ni comme échec ni comme réussite", () => {
  const r = jugerEchecsHiggsfield([
    { status: "queued", created_at: il(1) },
    { status: "uncertain", created_at: il(1) },
  ], DEPUIS);
  assertEquals(r, { reussies_7j: 0, echecs_7j: 0, alerte: null });
});
