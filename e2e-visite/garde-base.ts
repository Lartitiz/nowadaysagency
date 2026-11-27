import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Garde-fou de lancement (27/11/2026). Les tests en direct tournent sur la base
// des clientes, qui est petite : ce jour-là deux batteries lancées en même
// temps l'ont saturée (une lecture d'une ligne : 2 à 37 s au lieu de 0,2 s),
// l'outil est devenu inutilisable pendant un essai de Laetitia, et la lenteur
// a fait échouer les tests, relancés aussitôt en entier. Avant de démarrer :
//   1. une autre batterie tourne déjà sur cette machine → on ne démarre pas ;
//   2. la base met plus de 1,5 s (médiane de 3 lectures) → on ne démarre pas.
// VISITE_FORCE=1 passe outre (à réserver à un essai voulu sur base lente).

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SEUIL_BASE_LENTE_MS = 1500;
const DELAI_MAX_LECTURE_MS = 20_000;
// Aussi `node …/@playwright/test/cli.js test` (lancement conseillé dans un worktree),
// invisible avant le 27/11/2026.
const BATTERIE_EN_DIRECT = /(?:playwright(?:\.js)?|playwright\/cli\.js|@playwright\/test\/cli\.js)\s+test\b.*playwright\.(visite|cold)\.config/;
// Un shell n'est jamais une batterie : sa ligne recopie le script qu'il exécute,
// donc aussi la boucle d'ATTENTE d'une autre session (« tant qu'une batterie
// tourne, dormir »). Le 27/11/2026, trois sessions qui attendaient leur tour se
// sont bloquées entre elles sans qu'aucun test ne tourne. Une vraie batterie
// lancée depuis un shell a toujours son processus node (ou npm exec), compté.
const SHELL = /^(?:\S*\/)?-?(?:zsh|bash|sh|dash|fish)(?:\s|$)/;

export type Processus = { pid: number; ppid: number; commande: string };

export function lireProcessus(sortiePs: string): Processus[] {
  const out: Processus[] = [];
  for (const ligne of sortiePs.split("\n")) {
    const m = ligne.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (m) out.push({ pid: Number(m[1]), ppid: Number(m[2]), commande: m[3] });
  }
  return out;
}

/** Les autres batteries en direct : tout ce qui n'est ni ce processus, ni un de ses parents ou enfants. */
export function autresBatteries(processus: Processus[], monPid: number): Processus[] {
  const parPid = new Map(processus.map((p) => [p.pid, p]));
  const famille = new Set<number>();
  // Mes parents (npm exec, le shell qui m'a lancé : leur ligne contient la même commande)…
  for (let pid: number | undefined = monPid; pid && !famille.has(pid); pid = parPid.get(pid)?.ppid) famille.add(pid);
  // …et mes enfants.
  const descendants = new Set<number>([monPid]);
  for (let grandi = true; grandi; ) {
    grandi = false;
    for (const p of processus) {
      if (!descendants.has(p.pid) && descendants.has(p.ppid)) { descendants.add(p.pid); grandi = true; }
    }
  }
  for (const pid of descendants) famille.add(pid);
  return processus.filter((p) => !famille.has(p.pid) && !SHELL.test(p.commande) && BATTERIE_EN_DIRECT.test(p.commande));
}

export function mediane(valeurs: number[]): number {
  const tri = [...valeurs].sort((a, b) => a - b);
  return tri[Math.floor(tri.length / 2)];
}

/** Le texte du refus, ou null si la batterie peut démarrer. */
export function verdictGarde(entree: { autres: Processus[]; tempsMs: number[] | null; force: boolean }): string | null {
  if (entree.force) return null;
  if (entree.autres.length > 0) {
    const qui = entree.autres.map((p) => `  pid ${p.pid} : ${p.commande.slice(0, 140)}`).join("\n");
    return `🛑 Garde-fou : une autre batterie de tests en direct tourne déjà sur cette machine.\n${qui}\nDeux batteries en même temps saturent la base des clientes. Attendre sa fin, ou VISITE_FORCE=1 pour passer outre.`;
  }
  if (entree.tempsMs && entree.tempsMs.length > 0) {
    const med = mediane(entree.tempsMs);
    if (med > SEUIL_BASE_LENTE_MS) {
      return `🛑 Garde-fou : la base répond lentement (${entree.tempsMs.map((t) => (t / 1000).toFixed(1) + " s").join(", ")} pour lire une ligne, seuil ${SEUIL_BASE_LENTE_MS / 1000} s).\nDes tests lancés maintenant sortiraient en faux rouges et ralentiraient encore l'outil pour les clientes. Réessayer dans quelques minutes, ou VISITE_FORCE=1 pour passer outre.`;
    }
  }
  return null;
}

function lireEnv(): { url?: string; cle?: string } {
  const out: Record<string, string> = {};
  try {
    for (const ligne of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n")) {
      const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* pas de .env : la mesure est sautée */
  }
  return { url: process.env.VITE_SUPABASE_URL || out.VITE_SUPABASE_URL, cle: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || out.VITE_SUPABASE_PUBLISHABLE_KEY };
}

async function chronometrerBase(): Promise<number[] | null> {
  const { url, cle } = lireEnv();
  if (!url || !cle) return null;
  const temps: number[] = [];
  for (let i = 0; i < 3; i++) {
    const debut = Date.now();
    try {
      const rep = await fetch(`${url}/rest/v1/user_photos?select=id&limit=1`, {
        headers: { apikey: cle },
        signal: AbortSignal.timeout(DELAI_MAX_LECTURE_MS),
      });
      await rep.text();
      temps.push(rep.ok ? Date.now() - debut : DELAI_MAX_LECTURE_MS);
    } catch {
      temps.push(DELAI_MAX_LECTURE_MS);
    }
  }
  return temps;
}

export default async function gardeBase(): Promise<void> {
  let autres: Processus[] = [];
  try {
    autres = autresBatteries(lireProcessus(execFileSync("ps", ["-eo", "pid=,ppid=,command="], { encoding: "utf8" })), process.pid);
  } catch {
    /* `ps` indisponible : on ne bloque pas pour ça */
  }
  const force = !!process.env.VISITE_FORCE;
  const tempsMs = autres.length > 0 && !force ? null : await chronometrerBase();
  const refus = verdictGarde({ autres, tempsMs, force });
  if (tempsMs) console.log(`⏱️ Base avant lancement : ${tempsMs.map((t) => (t / 1000).toFixed(2) + " s").join(" · ")}${force ? " (VISITE_FORCE)" : ""}`);
  if (refus) throw new Error(refus);
}
