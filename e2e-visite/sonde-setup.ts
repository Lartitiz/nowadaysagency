import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// globalSetup : purge les artefacts de sonde du run précédent pour que
// `aggregate.ts` ne synthétise que le run courant.
export default function () {
  fs.rmSync(path.join(__dirname, "sonde"), { recursive: true, force: true });
  fs.rmSync(path.join(__dirname, "sonde-report.json"), { force: true });
  fs.rmSync(path.join(__dirname, "sonde-report.md"), { force: true });
}
