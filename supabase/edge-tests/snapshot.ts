// Snapshots des tests des edge functions, rangés HORS de supabase/functions/.
//
// Pourquoi (15/10/2026) : au déploiement, Lovable envoie pour chaque fonction
// TOUT son dossier + TOUT _shared/, tests et snapshots compris, avec un plafond
// d'environ 4,5 Mo par fonction. Les .snap (jusqu'à 2,1 Mo pièce) faisaient
// monter creative-flow à 7,0 Mo et carousel-ai à 6,6 Mo : Lovable refusait de
// les redéployer. Les .snap vivent donc dans supabase/edge-tests/snapshots/,
// avec la même arborescence que supabase/functions/ (sans le « __snapshots__ »).
//
// Même signature que assertSnapshot de std : seul l'emplacement du .snap change.
// Garde CI : scripts/poids-edges.mjs.
import {
  assertSnapshot as stdAssertSnapshot,
  type SnapshotOptions,
} from "https://deno.land/std@0.224.0/testing/snapshot.ts";

const FUNCTIONS_DIR = new URL("../functions/", import.meta.url);
const SNAPSHOTS_DIR = new URL("./snapshots/", import.meta.url);

/** Chemin du .snap d'un fichier de test (URL file:// de `t.origin`). */
export function snapshotPathFor(testOrigin: string): string {
  if (!testOrigin.startsWith(FUNCTIONS_DIR.href)) {
    throw new Error(`Test hors de supabase/functions/ : ${testOrigin}`);
  }
  const rel = testOrigin.slice(FUNCTIONS_DIR.href.length);
  return decodeURIComponent(new URL(`${rel}.snap`, SNAPSHOTS_DIR).pathname);
}

export function assertSnapshot<T>(
  context: Deno.TestContext,
  actual: T,
  options: SnapshotOptions<T> = {},
): Promise<void> {
  return stdAssertSnapshot(context, actual, {
    ...options,
    path: options.path ?? snapshotPathFor(context.origin),
  });
}
