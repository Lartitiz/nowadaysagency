import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { sharedUsage } from "../../scripts/carte-impact.mjs";
import {
  FRONT_ONLY_ATTRIBUTES,
  SERVER_ONLY_ATTRIBUTES,
  SHARED_ATTRIBUTES,
  SLIDE_TEXT_FIELDS,
} from "../../supabase/functions/_shared/carousel-dom-contract";

// Contrat des attributs data-* des slides de carrousel (lot E1, 14/10/2026).
// Le serveur écrit le HTML, l'éditeur et les exports le relisent : un attribut
// renommé d'un seul côté ne fait aucune erreur, il casse l'éditeur en silence.
// Ce test relit le code des deux côtés et le confronte à la liste officielle
// (supabase/functions/_shared/carousel-dom-contract.ts).
//
// Il échoue ? Lis le message : soit déclare le nouvel attribut dans le contrat
// (et à quoi il sert), soit renomme-le aussi de l'autre côté.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/(_test|\.test|\.spec)\.tsx?$/.test(f));

// Côté serveur : les deux fonctions du carrousel et tous les modules _shared
// qu'elles atteignent (calculé, donc à jour tout seul).
const usage = sharedUsage(path.join(ROOT, "supabase/functions")) as Map<string, Set<string>>;
const carouselShared = new Set(
  [...usage].filter(([, fns]) => fns.has("carousel-visual") || fns.has("carousel-ai")).map(([m]) => `supabase/functions/_shared/${m}.ts`),
);
const isServer = (f: string) =>
  f.startsWith("supabase/functions/carousel-visual/") || f.startsWith("supabase/functions/carousel-ai/") || carouselShared.has(f);
const isFront = (f: string) =>
  /^src\/lib\/(carousel|export-carousel)/.test(f) ||
  /^src\/components\/creer\/(CarouselEditor|formatRenderers\/Carousel)/.test(f) ||
  f.startsWith("src/features/carousel-studio/");

const CONTRACT_FILE = "supabase/functions/_shared/carousel-dom-contract.ts";
const serverFiles = tracked.filter((f) => isServer(f) && f !== CONTRACT_FILE);
const frontFiles = tracked.filter(isFront);

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

/** Attributs data-* d'un fichier : forme littérale et forme `.dataset.xxx`. */
function attributesIn(src: string): Set<string> {
  const found = new Set<string>();
  for (const m of src.matchAll(/data-([a-z][a-z0-9-]*[a-z0-9])(?![a-z0-9-])/g)) {
    // `data-photo-${x}` ou `data-photo-(?:format|step)` : préfixe, pas un attribut.
    if (src[m.index! + m[0].length] === "-") continue;
    found.add(m[0]);
  }
  for (const m of src.matchAll(/\.dataset\.([a-zA-Z]+)/g)) found.add("data-" + kebab(m[1]));
  return found;
}

function index(files: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of files) {
    for (const a of attributesIn(fs.readFileSync(path.join(ROOT, f), "utf8"))) {
      out.set(a, [...(out.get(a) || []), f]);
    }
  }
  return out;
}

const server = index(serverFiles);
const front = index(frontFiles);
const declared = { ...SHARED_ATTRIBUTES, ...SERVER_ONLY_ATTRIBUTES, ...FRONT_ONLY_ATTRIBUTES } as Record<string, unknown>;

describe("contrat des attributs data-* du carrousel", () => {
  it("le périmètre est bien trouvé (sinon le test ne vérifierait rien)", () => {
    expect(serverFiles).toContain("supabase/functions/carousel-visual/index.ts");
    expect(serverFiles).toContain("supabase/functions/_shared/photo-overlay-templates.ts");
    expect(frontFiles).toContain("src/lib/carousel-editor.ts");
    expect(frontFiles).toContain("src/components/creer/CarouselEditor.tsx");
    expect(frontFiles).toContain("src/lib/export-carousel-hybrid-pptx.ts");
  });

  it("chaque attribut utilisé est déclaré dans le contrat", () => {
    const missing = [...new Set([...server.keys(), ...front.keys()])]
      .filter((a) => !(a in declared))
      .map((a) => `${a} (${[...(server.get(a) || []), ...(front.get(a) || [])].join(", ")})`);
    expect(missing, `Attribut absent de ${CONTRACT_FILE} : déclare-le (et son rôle), ou c'est un nom mal recopié.`).toEqual([]);
  });

  it("chaque attribut partagé est encore écrit par le serveur ET lu par le front", () => {
    const broken = Object.keys(SHARED_ATTRIBUTES).flatMap((a) => [
      ...(server.has(a) ? [] : [`${a} : plus aucun fichier serveur ne l'écrit (renommé côté serveur ?)`]),
      ...(front.has(a) ? [] : [`${a} : plus aucun fichier front ne le lit (renommé côté éditeur/export ?)`]),
    ]);
    expect(broken).toEqual([]);
  });

  it("un attribut réservé à un côté n'apparaît pas de l'autre", () => {
    const leaks = [
      ...Object.keys(SERVER_ONLY_ATTRIBUTES).filter((a) => front.has(a)).map((a) => `${a} est lu par le front (${front.get(a)!.join(", ")}) : passe-le dans SHARED_ATTRIBUTES`),
      ...Object.keys(FRONT_ONLY_ATTRIBUTES).filter((a) => server.has(a)).map((a) => `${a} est écrit par le serveur (${server.get(a)!.join(", ")}) : passe-le dans SHARED_ATTRIBUTES`),
    ];
    expect(leaks).toEqual([]);
  });

  it("aucune déclaration morte (attribut déclaré mais utilisé nulle part)", () => {
    const dead = Object.keys(declared).filter((a) => !server.has(a) && !front.has(a));
    expect(dead, "Attribut déclaré mais introuvable : retire-le du contrat, ou il a été renommé partout sans mise à jour.").toEqual([]);
  });

  it("les valeurs de data-slide-text sont celles du contrat, des deux côtés", () => {
    const values = new Map<string, string[]>();
    for (const f of [...serverFiles, ...frontFiles]) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      for (const m of src.matchAll(/data-slide-text=\\?["']([a-z_]+)["'\\]/g)) values.set(m[1], [...(values.get(m[1]) || []), f]);
    }
    const unknown = [...values].filter(([v]) => !(SLIDE_TEXT_FIELDS as readonly string[]).includes(v)).map(([v, fs_]) => `${v} (${[...new Set(fs_)].join(", ")})`);
    expect(unknown).toEqual([]);
    // Chaque valeur du contrat est encore réellement écrite quelque part.
    for (const v of SLIDE_TEXT_FIELDS) expect(values.has(v), `data-slide-text="${v}" n'est plus écrit nulle part`).toBe(true);
  });
});
