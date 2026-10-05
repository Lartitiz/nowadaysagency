// Table unique angle → famille (socle commun, étape 1). Le balayage lit les
// listes D'ANGLES DANS LE CODE (front et serveur) : un identifiant ajouté à
// l'une d'elles sans famille fait échouer ce test.
//
//   deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/angle-families_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ANGLE_FAMILIES,
  ANGLE_FAMILY_DEFAULTS,
  ANGLE_FAMILY_IDS,
  ANGLE_FAMILY_TABLE,
  ANGLE_SOURCES,
  angleFamily,
  angleFamilyConflicts,
  normalizeAngleId,
  type AngleSource,
} from "./angle-families.ts";

const ROOT = new URL("../../../", import.meta.url);
const read = (path: string) => Deno.readTextFileSync(new URL(path, ROOT));
function slice(text: string, start: string, end: string): string {
  const i = text.indexOf(start);
  assert(i >= 0, `repère introuvable : ${start}`);
  const j = text.indexOf(end, i + start.length);
  assert(j > i, `fin introuvable : ${end}`);
  return text.slice(i, j);
}
const all = (text: string, re: RegExp) => [...text.matchAll(re)].map((m) => m[1].trim());

/** Identifiants lus dans le code, liste par liste. */
function scan(): Record<Exclude<AngleSource, "photo_series" | "reprise">, string[]> {
  const cs = read("src/lib/content-structures.ts");
  const cp = read("supabase/functions/_shared/copywriting-prompts.ts");
  const fb = read("supabase/functions/_shared/format-briefs.ts");
  const idsAndLabels = (block: string) => [...all(block, /^\s{4}id: "([^"]+)"/gm), ...all(block, /^\s{4}label: "([^"]+)"/gm)];
  const coaching = slice(read("supabase/functions/calendar-coaching/index.ts"), "ANGLES ÉDITORIAUX NOWADAYS", "RÈGLES DE PROFONDEUR");
  const hooks = slice(read("supabase/functions/creative-flow/index.ts"), "const HOOKS_TOOL", "const FOLLOW_UP_TOOL");
  return {
    instagram_angles: idsAndLabels(slice(cs, "export const EDITORIAL_ANGLES", "export const LINKEDIN_EDITORIAL_ANGLES")),
    linkedin_angles: idsAndLabels(slice(cs, "export const LINKEDIN_EDITORIAL_ANGLES", "export const PINTEREST_EDITORIAL_ANGLES")),
    pinterest_angles: idsAndLabels(slice(cs, "export const PINTEREST_EDITORIAL_ANGLES", "export const CONTENT_STRUCTURES")),
    content_structures: all(slice(cs, "export const CONTENT_STRUCTURES", "export const CONTENT_TYPE_SPECS"), /^ {2}([a-z_]+): \{/gm),
    linkedin_templates: all(slice(cp, "export const LINKEDIN_TEMPLATES", "\n};"), /^ {2}([a-z_]+): `/gm),
    idea_lenses: all(slice(cp, "export const IDEA_LENSES", "\n];"), /id: "([^"]+)"/g),
    carousel_types: all(slice(read("supabase/functions/carousel-ai/writing-contract.ts"), "const guides", "\n  };"), /^ {4}([a-z_]+): "/gm),
    editorial_intent: (read("supabase/functions/_shared/carousel-editorial-contract.ts").match(/mode appartient à ([^.]+)\./)?.[1] || "").split(",").map((s) => s.trim()),
    newsjacking: all(read("supabase/functions/newsjacking-angles/index.ts").match(/"vehicule": ([^\n]+)/)?.[1] || "", /"([a-z_]+)"/g),
    weekly_suggestions: all(read("supabase/functions/generate-content/index.ts"), /^\s+- "([a-z_]+)" :/gm),
    calendar_quick: all(slice(read("src/lib/calendar-constants.ts"), "export const ANGLES", "];"), /"([^"]+)"/g),
    calendar_coaching: all(coaching, /^\d+\. (.+?) — /gm),
    stories_structures: all(slice(fb, "const structuresBlock", "return `FORMAT : SÉQUENCE STORIES"), /^- ([a-z_]+) : /gm),
    stories_narration: (fb.match(/"narrative_angle": "([^"]+)"/)?.[1] || "").split("|").map((s) => s.trim()),
    stories_vente: all(fb, /^ {4}([a-z]+): `SÉQUENCE /gm),
    reel_structures: all(slice(fb, "CHOIX DE STRUCTURE", "Ne choisis PAS"), /^- ([a-z_]+) :/gm),
    reel_hooks: (hooks.match(/type: \{ type: "string", description: "([^"]+)" \}/)?.[1] || "").split("|").map((s) => s.trim()),
    launch: all(slice(read("src/lib/launch-templates.ts"), "export const CONTENT_TYPES", "export const STORY_SEQUENCE_TEMPLATES"), /id: "([^"]+)"/g),
  };
}

Deno.test("balayage : chaque identifiant des listes du code a une famille dans sa liste", () => {
  const found = scan();
  const missing: string[] = [];
  for (const [source, ids] of Object.entries(found) as [AngleSource, string[]][]) {
    assert(ids.length > 0, `${source} : aucune entrée lue (le repère a changé ?)`);
    const table = new Set(Object.keys(ANGLE_SOURCES[source]).map(normalizeAngleId));
    for (const id of ids) if (!table.has(normalizeAngleId(id))) missing.push(`${source}:${id}`);
  }
  assertEquals(missing, [], "identifiants sans famille : ajoute-les à ANGLE_SOURCES (angle-families.ts)");
});

Deno.test("balayage : tailles attendues des listes (garde contre un repère qui ne lit plus rien)", () => {
  const n = Object.fromEntries(Object.entries(scan()).map(([k, v]) => [k, new Set(v.map(normalizeAngleId)).size]));
  assert(n.instagram_angles >= 14 * 2 - 6, `angles Instagram : ${n.instagram_angles}`);
  assertEquals(new Set(scan().instagram_angles.filter((x) => /^[a-z-]+$/.test(x))).size, 14);
  assertEquals(n.linkedin_templates, 8);
  assertEquals(n.idea_lenses, 14);
  assertEquals(n.carousel_types, 12);
  assertEquals(n.editorial_intent, 7);
  assertEquals(n.newsjacking, 5);
  assertEquals(n.weekly_suggestions, 11);
  assertEquals(n.calendar_quick, 10);
  assertEquals(n.calendar_coaching, 13);
  assertEquals(n.stories_structures, 8);
  assertEquals(n.stories_narration, 6);
  assertEquals(n.stories_vente, 5);
  assertEquals(n.reel_structures, 3);
  assertEquals(n.reel_hooks, 6);
  assertEquals(n.launch, 29);
});

Deno.test("seuls identifiants volontairement sans famille", () => {
  const nulls = Object.entries(ANGLE_FAMILY_TABLE).filter(([, v]) => v === null).map(([k]) => k);
  assertEquals(nulls, ["intersection_angles"]);
});

Deno.test("normalisation : tirets, soulignés, accents, casse, libellés", () => {
  assertEquals(normalizeAngleId("before-after"), "before_after");
  assertEquals(normalizeAngleId("Before / After"), "before_after");
  assertEquals(normalizeAngleId("  Enquête / Décryptage "), "enquete_decryptage");
  assertEquals(normalizeAngleId("Surf sur l'actu"), "surf_sur_l_actu");
  assertEquals(normalizeAngleId("🎬 COULISSES"), "coulisses");
  assertEquals(normalizeAngleId(null), "");
  assertEquals(angleFamily("coup-de-gueule"), "D");
  assertEquals(angleFamily("COUP_DE_GUEULE"), "D");
  assertEquals(angleFamily("Coup de gueule"), "D");
  assertEquals(angleFamily("histoire-cliente"), "B");
  assertEquals(angleFamily("Histoire cliente / Cas réel"), "B");
  assertEquals(angleFamily("Mise en valeur produit / création"), "G");
  assertEquals(angleFamily("epingle_inspiration"), "J");
  assertEquals(angleFamily("photo_dump"), "J");
  assertEquals(angleFamily("recyclage"), "K");
  assertEquals(angleFamily("5 erreurs de bio que je vois partout"), null);
  assertEquals(angleFamily(""), null);
  assertEquals(angleFamily(undefined), null);
  assertEquals(angleFamily(42), null);
});

Deno.test("une clé qui change de famille selon la liste : défaut sans source, liste avec source", () => {
  assertEquals(Object.keys(angleFamilyConflicts()).sort(), Object.keys(ANGLE_FAMILY_DEFAULTS).sort());
  assertEquals(angleFamily("recit_experience"), "A");
  assertEquals(angleFamily("recit_experience", "weekly_suggestions"), "A");
  assertEquals(angleFamily("recit_experience", "newsjacking"), "C");
  assertEquals(angleFamily("constat_decale"), "D");
  assertEquals(angleFamily("constat_decale", "newsjacking"), "C");
  // Une clé absente de la liste donnée est cherchée dans la table globale.
  assertEquals(angleFamily("storytelling", "newsjacking"), "A");
});

Deno.test("listes à clés génériques lues seulement avec leur source", () => {
  assertEquals(angleFamily("moyen"), null);
  assertEquals(angleFamily("premium", "stories_vente"), "G");
});

Deno.test("chaque famille est utilisée et décrite", () => {
  const used = new Set(Object.values(ANGLE_SOURCES).flatMap((t) => Object.values(t)).filter(Boolean));
  for (const fam of ANGLE_FAMILY_IDS) {
    assert(used.has(fam), `famille ${fam} jamais utilisée`);
    assert(ANGLE_FAMILIES[fam].nom && ANGLE_FAMILIES[fam].definition);
  }
});
