import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { higgsfieldReceiptLost } from "./higgsfield-image.ts";

const now = Date.parse("2026-10-01T14:40:00Z");

Deno.test("uncertain submit without receipt ends the processing display", () => {
  assertEquals(higgsfieldReceiptLost({ status: "uncertain", provider_id: null }, now), true);
});

Deno.test("a known provider receipt keeps recovering through polling", () => {
  assertEquals(higgsfieldReceiptLost({ status: "uncertain", provider_id: "4da9051f-9404-4a14-83a5-009b371a76e6" }, now), false);
  assertEquals(higgsfieldReceiptLost({ status: "queued", provider_id: "4da9051f-9404-4a14-83a5-009b371a76e6" }, now), false);
});

Deno.test("an active submission is not flagged; a stalled worker is", () => {
  assertEquals(higgsfieldReceiptLost({ status: "submitting", created_at: "2026-10-01T14:35:00Z" }, now), false);
  assertEquals(higgsfieldReceiptLost({ status: "submitting", created_at: "2026-10-01T14:10:00Z" }, now), true);
});
