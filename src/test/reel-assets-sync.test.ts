import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* Les sons du reel « sans voix » vivent à deux endroits : à côté du relais de
   rendu Google Cloud (MP4) et dans le site (aperçu immédiat, 14/11/2026). Les
   deux doivent rester identiques, sinon l'aperçu ne sonne pas comme la vidéo. */
const RELAIS = "services/reel-render-gateway/assets";
const SITE = "public/reel-assets";

function files(dir: string, prefix = ""): string[] {
  return readdirSync(join(dir, prefix)).flatMap((name) => {
    const rel = join(prefix, name);
    return statSync(join(dir, rel)).isDirectory() ? files(dir, rel) : [rel];
  }).sort();
}

describe("sons du reel : relais et aperçu identiques", () => {
  it("mêmes fichiers, mêmes octets", () => {
    expect(files(SITE)).toEqual(files(RELAIS));
    for (const f of files(RELAIS)) expect(readFileSync(join(SITE, f)).equals(readFileSync(join(RELAIS, f))), f).toBe(true);
  });
});
