import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { downscaleToJpeg } from "./image-downscale.ts";

// imagescript loads its WebAssembly over the network: the real conversion tests
// run only with --allow-net (locally); CI keeps the no-network fallback test.
const net = (await Deno.permissions.query({ name: "net", host: "deno.land" })).state === "granted";
const lib = () => import("https://deno.land/x/imagescript@1.3.0/mod.ts");

Deno.test({ name: "a 2k Higgsfield PNG becomes a 1024 px wide JPEG, aspect kept", ignore: !net, fn: async () => {
  const { Image } = await lib();
  const source = new Image(1360, 2048).fill((x, y) => Image.rgbToColor((x * 7) % 256, (y * 3) % 256, 120));
  const png = new Blob([new Uint8Array(await source.encode())], { type: "image/png" });
  const out = await downscaleToJpeg(png);
  assertEquals(out.type, "image/jpeg");
  const decoded = await Image.decode(new Uint8Array(await out.arrayBuffer()));
  assertEquals(decoded.width, 1024);
  assert(Math.abs(decoded.height - 1542) <= 1, `height ${decoded.height}`);
  assert(out.size < png.size);
} });

Deno.test({ name: "an image already narrow enough is not enlarged", ignore: !net, fn: async () => {
  const { Image } = await lib();
  const small = new Blob([new Uint8Array(await new Image(600, 900).fill(0xff0000ff).encode())], { type: "image/png" });
  const decoded = await Image.decode(new Uint8Array(await (await downscaleToJpeg(small)).arrayBuffer()));
  assertEquals([decoded.width, decoded.height], [600, 900]);
} });

Deno.test("an undecodable image (or an unavailable library) is returned untouched: a paid image is never lost", async () => {
  const odd = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" });
  assertEquals(await downscaleToJpeg(odd), odd);
});
