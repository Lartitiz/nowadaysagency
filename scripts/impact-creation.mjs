#!/usr/bin/env node
// Rapport d'impact « création de contenu » (lot 4, 13/10/2026).
//
// Lancé par la CI sur chaque PR et chaque arrivée de code sur main. Il ne
// bloque rien : il écrit dans le résumé du lancement (GITHUB_STEP_SUMMARY)
//   - les formats de contenu que la modification peut toucher, y compris par
//     ricochet via un module partagé (rayon d'impact : scripts/carte-impact.mjs) ;
//   - les fichiers partagés modifiés, avec leur zone (rouge / orange / verte,
//     comme dans docs/creation-contenu/CARTE.md) ;
//   - les prompts dont le texte change (entrées de snapshots modifiées).
// But : voir en un coup d'œil qu'une retouche « pour LinkedIn » a aussi
// changé le prompt des stories.
//
// Usage :
//   node scripts/impact-creation.mjs --base <ref> [--head <ref>] [--summary <fichier>]
// Sans base valide (premier push d'une branche), le rapport le dit et s'arrête.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { sharedUsage } from "./carte-impact.mjs";

/** Edge functions de création de contenu → ce que l'utilisatrice y produit. */
const CREATIVE_FLOW_ALL = "Tous les formats de creative-flow (reel, stories, post Instagram, LinkedIn, newsletter, Pinterest texte, recyclage, mode photo)";
const ALL_GENERATORS = "Tous les générateurs de contenu";

export const FUNCTION_LABELS = {
  "creative-flow": CREATIVE_FLOW_ALL,
  "carousel-ai": "Carrousels : rédaction",
  "carousel-visual": "Carrousels : mise en forme",
  "carousel-slide-image": "Carrousels : image d'une slide",
  "generate-content": "Bio Instagram, légendes, brouillons du calendrier",
  "linkedin-ai": "LinkedIn : profil, crosspost, légende de carrousel",
  "pinterest-ai": "Pinterest : compte, tableaux, épingles",
  "pinterest-visual": "Pinterest : épingle visuelle",
  "pinterest-photo-brief": "Pinterest : épingle photo",
  "pinterest-inspiration": "Pinterest : inspiration",
  "storytelling-ai": "Storytelling",
  "inspire-ai": "Inspiration (adapter un contenu)",
  "ai-text-action": "Menu IA sur sélection de texte",
  "engagement-insight": "Analyse d'engagement",
  "newsjacking-ai": "Newsjacking",
  "newsjacking-angles": "Newsjacking",
  "newsjacking-from-url": "Newsjacking",
  "reel-render": "Montage des reels",
  "content-coaching": "Idées de contenu",
  // Lot 9 (14/10/2026) : fonctions de design et de vidéo, absentes jusque-là.
  "visual-studio": "Studio visuel : images et retouches photo",
  "visual-direction-suggest": "Charte : direction photo et vidéo suggérée",
  "studio-video": "Studio vidéo",
};

/** Fichiers de creative-flow → format touché (lot 3). */
export const CREATIVE_FLOW_FILES = {
  "formats/linkedin.ts": "Post LinkedIn",
  "formats/newsletter.ts": "Newsletter",
  "formats/stories.ts": "Stories",
  "formats/reel.ts": "Reel",
  "formats/post.ts": "Post Instagram / légende",
  "formats/photo.ts": "Mode photo (tous formats)",
  "formats/recycle.ts": "Recyclage",
  "formats/carousel.ts": "Recyclage et ajustement en carrousel",
};
/**
 * Briefs de _shared/format-briefs/ (découpage du 14/10/2026) → formats touchés.
 * Une retouche du brief reel annonce « Reel », pas tous les formats de
 * creative-flow. Le sommaire format-briefs.ts (réexports) garde la règle générale.
 */
export const FORMAT_BRIEF_FILES = {
  "format-briefs/reel": ["Reel"],
  "format-briefs/stories": ["Stories"],
  "format-briefs/linkedin": ["Post LinkedIn"],
  "format-briefs/newsletter": ["Newsletter"],
  "format-briefs/caption": ["Post Instagram / légende"],
  "format-briefs/photo-caption": ["Mode photo (tous formats)"],
  "format-briefs/pinterest": ["Pinterest texte"],
  "format-briefs/carousel": ["Carrousel (brief de creative-flow)"],
  "format-briefs/position": ["Post Instagram / légende", "Reel", "Stories"],
  "format-briefs/common": ["Reel", "Stories"],
};
/** Écrans du front → format touché. */
export const FRONT_FILES = [
  [/^src\/pages\/CreerUnifie\.tsx$|^src\/components\/creer\/(LowCreditsBanner|PhotoMissingDialog|ConfirmResetDialog|LaunchSequenceResults)\.tsx$|^src\/hooks\/use-launch-sequence\.ts$|^src\/features\/creer\/(creer-step|draft-conflict|pending-stream|edit-text-from-result|content-brief)\.ts$|^src\/hooks\/use-creer-exports\.ts$/, "Parcours /creer (tous formats)"],
  [/^src\/components\/creer\/formatRenderers\/Carousel/, "Carrousels : écran de résultat"],
  [/^src\/components\/creer\/CarouselEditor|^src\/lib\/carousel-editor\.ts$/, "Carrousels : éditeur visuel"],
  [/^src\/lib\/export-carousel-/, "Carrousels : exports"],
  [/^src\/hooks\/use-generate-visuals\.ts$/, "Carrousels : lancement de la mise en forme visuelle"],
  [/^src\/hooks\/use-user-slides-generate\.ts$/, "Carrousels : slides écrites par l'utilisatrice"],
  [/^src\/components\/creer\/ReelMontage\.tsx$/, "Reel : écran de montage"],
  [/^src\/components\/creer\/CreerStepEdit\.tsx$|^src\/features\/creer\/edited-text\.ts$/, "Parcours /creer : étape « Modifier » (tous formats)"],
  [/^src\/hooks\/use-regeneration-backup\.ts$/, "Parcours /creer : filet « Régénérer » / « Changer d'angle » (tous formats)"],
  [/^src\/components\/creer\/formatRenderers\/(\w+)Result\.tsx$/, (m) => `Écran de résultat : ${m[1]}`],
  [/^src\/hooks\/use-(do-generate|content-generator|format-next)\.ts$/, "Parcours /creer : lancement des générations (tous formats)"],
  [/^src\/pages\/Calendar\.tsx$|^src\/components\/calendar\/CalendarPostDialog\.tsx$/, "Lien calendrier → générateur"],
];

/** Zones de docs/creation-contenu/CARTE.md, section 4. */
export const RED = new Set(["cors", "plan-limiter", "rate-limiter", "anthropic", "workspace-guard", "socle", "angle-families",
  "input-validators", "user-context", "audience-address", "parse-ai-json", "copywriting-prompts", "base-prompts"]);
export const ORANGE = new Set(["carousel-editorial-review", "redac-gate", "correction-pass", "carousel-model",
  "text-structure-guard", "content-clarity", "audience-address-pass"]);
// La zone se lit sur le premier segment : un sous-module (`redac-gate/numbers`,
// nom donné par carte-impact.mjs) hérite de la zone de son module d'origine.
export const zoneOf = (mod) => {
  const root = mod.split("/")[0];
  return RED.has(root) ? "rouge" : ORANGE.has(root) ? "orange" : "verte";
};
const ZONE_ICON = { rouge: "🔴", orange: "🟠", verte: "🟢" };

const isTest = (p) => /_test\.ts$|\.test\.tsx?$|\.spec\.ts$|__snapshots__\//.test(p);

/**
 * Formats et modules partagés touchés par une liste de fichiers modifiés.
 * @param {string[]} files chemins relatifs à la racine du dépôt
 * @param {Map<string, Set<string>>} usage résultat de sharedUsage()
 */
export function analyzeImpact(files, usage) {
  const formats = new Map(); // libellé → Set(raisons)
  const shared = []; // { module, zone, functions, content }
  const add = (label, reason) => {
    if (!formats.has(label)) formats.set(label, new Set());
    formats.get(label).add(reason);
  };
  for (const file of files) {
    if (isTest(file)) continue;
    let m = file.match(/^supabase\/functions\/_shared\/(.+)\.ts$/);
    if (m) {
      const mod = m[1];
      const fns = [...(usage.get(mod) ?? [])].sort();
      const content = fns.filter((f) => FUNCTION_LABELS[f]);
      const zone = zoneOf(mod);
      shared.push({ module: mod, zone, functions: fns, content });
      // Brief d'un format : seulement ce format, pas tous ceux de creative-flow.
      if (FORMAT_BRIEF_FILES[mod]) {
        for (const label of FORMAT_BRIEF_FILES[mod]) add(label, `via \`_shared/${mod}.ts\``);
        continue;
      }
      // Zone rouge : une seule ligne plutôt que la liste de tous les générateurs.
      if (zone === "rouge" && content.length) add(ALL_GENERATORS, `via \`_shared/${mod}.ts\`, zone rouge`);
      else for (const f of content) add(FUNCTION_LABELS[f], `via \`_shared/${mod}.ts\``);
      continue;
    }
    m = file.match(/^supabase\/functions\/creative-flow\/(.+)$/);
    if (m) {
      add(CREATIVE_FLOW_FILES[m[1]] ?? CREATIVE_FLOW_ALL, `\`creative-flow/${m[1]}\` modifié`);
      continue;
    }
    m = file.match(/^supabase\/functions\/([^/]+)\//);
    if (m && FUNCTION_LABELS[m[1]]) {
      add(FUNCTION_LABELS[m[1]], `\`${m[1]}/\` modifié`);
      continue;
    }
    for (const [re, label] of FRONT_FILES) {
      const fm = file.match(re);
      if (fm) {
        add(typeof label === "function" ? label(fm) : label, `\`${file}\` modifié`);
        break;
      }
    }
  }
  return { formats, shared };
}

/** Entrées d'un fichier .snap de Deno : nom → contenu. */
export function parseSnapshots(text) {
  const out = new Map();
  if (!text) return out;
  const re = /^snapshot\[`((?:[^`\\]|\\.)*)`\] = `([\s\S]*?)`;\n/gm;
  for (const m of text.matchAll(re)) out.set(m[1].replace(/ \d+$/, ""), m[2]);
  return out;
}

/** Entrées ajoutées, supprimées et modifiées entre deux versions d'un .snap. */
export function diffSnapshots(before, after) {
  const a = parseSnapshots(before);
  const b = parseSnapshots(after);
  const added = [...b.keys()].filter((k) => !a.has(k));
  const removed = [...a.keys()].filter((k) => !b.has(k));
  const changed = [...b.keys()].filter((k) => a.has(k) && a.get(k) !== b.get(k));
  return { added, removed, changed };
}

export function formatReport({ formats, shared }, snapshots) {
  const lines = ["### Création de contenu : ce que cette modification peut toucher", ""];
  const promptChanges = snapshots.filter((s) => s.added.length || s.removed.length || s.changed.length);
  if (formats.size === 0 && promptChanges.length === 0) {
    lines.push("Aucun générateur de contenu touché.");
    return lines.join("\n") + "\n";
  }
  if (formats.size) {
    lines.push("**Formats concernés**", "");
    for (const [label, reasons] of [...formats.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
      lines.push(`- ${label} (${[...reasons].join(", ")})`);
    }
    lines.push("");
  }
  if (shared.length) {
    lines.push("**Fichiers partagés modifiés**", "");
    for (const s of shared.sort((x, y) => y.functions.length - x.functions.length)) {
      lines.push(`- ${ZONE_ICON[s.zone]} \`_shared/${s.module}.ts\` (zone ${s.zone}) : ${s.functions.length} fonction(s), dont ${s.content.length} générateur(s) de contenu`);
    }
    lines.push("", "> Zone rouge ou orange : la modification change plusieurs formats à la fois. Vérifie que c'était voulu (voir docs/creation-contenu/CARTE.md, section 4).", "");
  }
  if (promptChanges.length) {
    lines.push("**Prompts et réponses figés qui changent** (snapshots)", "");
    for (const s of promptChanges) {
      for (const name of s.changed) lines.push(`- modifié : \`${s.file}\` › ${name}`);
      for (const name of s.removed) lines.push(`- supprimé : \`${s.file}\` › ${name}`);
      if (s.added.length) lines.push(`- ${s.added.length} cas ajouté(s) au filet dans \`${s.file}\``);
    }
    lines.push("", "> Si un prompt de cette liste ne devait pas changer, c'est une régression : corrige le code, pas le snapshot.", "");
  }
  return lines.join("\n") + "\n";
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
}
function showOrEmpty(ref, file) {
  try {
    return git(["show", `${ref}:${file}`]);
  } catch {
    return "";
  }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function main() {
  const base = arg("--base");
  const head = arg("--head", "HEAD");
  const summary = arg("--summary");
  let report;
  try {
    if (!base || /^0+$/.test(base)) throw new Error("pas de base");
    git(["rev-parse", "--verify", `${base}^{commit}`]);
    const files = git(["diff", "--name-only", base, head]).split("\n").filter(Boolean);
    const impact = analyzeImpact(files, sharedUsage());
    const snapshots = files
      .filter((f) => f.endsWith(".snap"))
      .map((f) => ({ file: f.replace(/^supabase\/functions\//, ""), ...diffSnapshots(showOrEmpty(base, f), showOrEmpty(head, f)) }));
    report = formatReport(impact, snapshots);
  } catch (e) {
    report = `### Création de contenu : rapport d'impact indisponible\n\nBase de comparaison introuvable (${base || "aucune"}) : ${e.message}\n`;
  }
  console.log(report);
  if (summary) fs.appendFileSync(summary, report);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
