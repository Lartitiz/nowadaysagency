import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { downloadReference, REFERENCE_MAX_SIDE } from "./reference-source.ts";

// Choix P1 option B (18/10/2026) : la photo produit part réduite à 1280 px,
// calcul fait par le stockage. Sinon le recadrage d'une photo 2000×2000
// (~1 s de CPU en ligne) faisait sauter la passe zoomée.

function jpeg(width: number, height: number) {
  return new Blob([new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ])], { type: "image/jpeg" });
}

function fakeStorage(original: Blob, reduced: Blob | null | "error") {
  const calls: (Record<string, unknown> | null)[] = [];
  const download = (options?: { transform: Record<string, unknown> }) => {
    calls.push(options?.transform ?? null);
    if (!options) return Promise.resolve({ data: original, error: null });
    if (reduced === "error") return Promise.resolve({ data: null, error: new Error("transform unavailable") });
    return Promise.resolve({ data: reduced, error: null });
  };
  return { download, calls };
}

Deno.test("a 2000 px photo is downloaded already reduced to 1280 px, original never fetched", async () => {
  const small = jpeg(1280, 1280);
  const s = fakeStorage(jpeg(2000, 2000), small);
  const out = await downloadReference(s.download, 2000);
  assertEquals(out, { blob: small, reduced: true });
  assertEquals(s.calls, [{ width: REFERENCE_MAX_SIDE, height: REFERENCE_MAX_SIDE, resize: "contain", format: "origin", quality: 90 }]);
});

Deno.test("a photo already small enough is downloaded as is", async () => {
  const original = jpeg(1080, 1200);
  const t = fakeStorage(original, null);
  assertEquals(await downloadReference(t.download, 1200), { blob: original, reduced: false });
  assertEquals(t.calls, [null], "no reduction asked");
});

Deno.test("reduction unavailable or wrong → the original photo (previous behaviour)", async () => {
  const original = jpeg(2000, 2000);
  const failed = fakeStorage(original, "error");
  assertEquals(await downloadReference(failed.download, 2000), { blob: original, reduced: false });
  const notReduced = fakeStorage(original, jpeg(2000, 2000));
  assertEquals(await downloadReference(notReduced.download, 2000), { blob: original, reduced: false });
  const webp = fakeStorage(original, new Blob([new Uint8Array([1])], { type: "image/webp" }));
  assertEquals(await downloadReference(webp.download, 2000), { blob: original, reduced: false });
});

Deno.test("size unknown in the table: read from the downloaded header", async () => {
  const small = jpeg(1280, 853);
  const s = fakeStorage(jpeg(3000, 2000), small);
  assertEquals(await downloadReference(s.download, null), { blob: small, reduced: true });
  assertEquals(s.calls.length, 2);
});
