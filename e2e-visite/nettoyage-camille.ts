/**
 * NETTOYAGE CIBLÉ du compte test de référence (« Camille »).
 *
 * Pourquoi ce fichier existe — le smoke à froid (cold-smoke.spec.ts) peut se
 * permettre de SUPPRIMER son compte jetable en afterAll. Ici c'est impossible :
 * Camille est le compte de RÉFÉRENCE, son historique et ses réglages sont
 * précisément ce qui en fait un compte « mûr ». Il faut donc supprimer les
 * LIGNES créées par le run, et rien d'autre.
 *
 * Constat qui a déclenché ce nettoyage (visite du 22/08/2026) : le dashboard de
 * Camille affichait « 25 contenus prêts, jamais publiés », dont 5 lignes
 * strictement identiques (même titre, même date 2026-08-15 posée en dur par
 * fonctionnel-t1). L'alerte « brouillons oubliés » ne signalait plus un oubli
 * de Laetitia : elle comptait les passages de la routine. Le regard UX
 * quotidien jugeait un écran pollué par la routine elle-même, et la page
 * ralentissait à mesure (dashboard-complet mobile : 5,2 s le 20/08 → 12,0 s le
 * 22/08, au-dessus du plancher d'alerte de 8 s).
 *
 * Principe : on ne DEVINE rien. On écoute les INSERT REST du run — les seuls
 * ids que ce run a réellement créés — et on ne supprime que ceux-là. Filtrer
 * par titre serait dangereux : un vrai contenu de Laetitia portant le même nom
 * partirait avec (et le titre de T1 est une phrase parfaitement plausible).
 *
 * Le nettoyage ne jette JAMAIS : un teardown est une assertion qu'on LIT, pas
 * de la vaisselle. Il imprime `🧹 … : OK` / `KO <raison>` et laisse le verdict
 * du test intact.
 */
import type { BrowserContext, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type LigneCreee = { table: string; id: string };

/**
 * Liste BLANCHE des tables que le nettoyage a le droit de supprimer — tout ce
 * que le parcours /creer peut poser sur le compte. Une liste blanche (et pas
 * « tout ce qui passe ») pour que l'ajout d'une écriture ailleurs ne devienne
 * jamais une suppression surprise.
 *
 * ⚠️ `ai_usage` en est VOLONTAIREMENT absente : c'est le journal de
 * facturation, on ne le réécrit pas (et Camille est de toute façon bypassée
 * côté serveur, cf. QA_TEST_USER_IDS dans _shared/plan-limiter.ts — elle
 * n'y écrit aucune ligne).
 */
const TABLES_NETTOYABLES = new Set([
  "calendar_posts",
  "content_briefs",
  "generated_carousels",
  "saved_ideas",
  "stories_sequences",
]);

// Parse un fichier .env sans dépendance dotenv (même logique que
// playwright.visite.config.ts et auth.setup.ts).
function readEnvFile(file: string): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!fs.existsSync(file)) return vars;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return vars;
}

/** URL + clé anon du projet Supabase (process.env, sinon le .env du repo). */
export function configSupabase(): { url: string; anon: string } {
  const repoEnv = readEnvFile(path.join(__dirname, "..", ".env"));
  return {
    url: process.env.VITE_SUPABASE_URL || repoEnv.VITE_SUPABASE_URL || "",
    anon:
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      repoEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
      "",
  };
}

/**
 * Jeton d'accès de Camille par l'API (comme auth.setup.ts) — indépendant du
 * navigateur, donc utilisable dans un afterAll où la page est déjà fermée.
 * Ne loggue jamais le jeton ni le corps de réponse.
 */
export async function tokenCamille(): Promise<string | null> {
  const { url, anon } = configSupabase();
  const email = process.env.VISITE_EMAIL || "laetitiatest@nowadaysagency.com";
  const pwd = process.env.VISITE_PASSWORD;
  if (!url || !anon || !pwd) return null;
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "content-type": "application/json" },
    body: JSON.stringify({ email, password: pwd }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  return (await res.json())?.access_token ?? null;
}

export interface TraceurCreations {
  /**
   * À brancher AVANT toute navigation, sur la page ou sur le contexte entier
   * (toutes les pages et fenêtres du test : c'est ce que fait test-propre.ts).
   */
  branche(cible: Page | BrowserContext): void;
  /** Filet : l'app redirige vers `/calendrier?date=…&post=<id>` après la pose. */
  ajouteDepuisUrl(url: string): void;
  /** Lignes créées, dédoublonnées (attend les lectures de corps en cours). */
  collectees(): Promise<LigneCreee[]>;
}

/**
 * Écoute les INSERT REST et mémorise les ids créés.
 *
 * supabase-js chaîne `.select()` sur ses inserts (cf. use-calendar-save.ts :
 * `.insert({…}).select("id").single()`), donc PostgREST renvoie la ligne créée
 * avec son id : c'est notre source de vérité, sans requête supplémentaire.
 *
 * 🔑 La lecture du corps est lancée DANS le handler, pendant que la page est
 * encore vivante : appelée après la fin du test, `response.json()` n'a plus de
 * contexte pour répondre.
 */
export function traceurDeCreations(): TraceurCreations {
  const lignes: LigneCreee[] = [];
  const enCours: Promise<unknown>[] = [];

  const ajoute = (table: string, id: unknown) => {
    if (typeof id === "string" && id) lignes.push({ table, id });
  };

  return {
    branche(cible: Page | BrowserContext) {
      (cible as Page).on("response", (r) => {
        const req = r.request();
        if (req.method() !== "POST") return;
        if (r.status() < 200 || r.status() >= 300) return;
        const m = r.url().match(/\/rest\/v1\/([a-z_]+)(?:\?|$)/);
        if (!m || !TABLES_NETTOYABLES.has(m[1])) return;
        // Garde-fou : un POST « resolution=… » peut RÉÉCRIRE une ligne qui
        // existait avant le run. On ne trace que les créations franches.
        if (/resolution=/.test(req.headers()["prefer"] || "")) return;
        const table = m[1];
        // L'app fournit parfois l'id elle-même (brouillon de carrousel) et ne
        // demande pas toujours la ligne en retour : l'id envoyé par le run,
        // accepté par la base, vaut autant que l'id renvoyé.
        try {
          const envoye = JSON.parse(req.postData() || "null");
          for (const row of Array.isArray(envoye) ? envoye : [envoye]) ajoute(table, row?.id);
        } catch {
          /* corps illisible : on s'en tient à la réponse */
        }
        enCours.push(
          r
            .json()
            .then((body) => {
              // PostgREST renvoie un tableau, ou l'objet seul avec `.single()`.
              for (const row of Array.isArray(body) ? body : [body]) ajoute(table, row?.id);
            })
            .catch(() => {}),
        );
      });
    },

    ajouteDepuisUrl(url: string) {
      const m = url.match(/[?&]post=([0-9a-f-]{36})/i);
      if (m) ajoute("calendar_posts", m[1]);
    },

    async collectees() {
      await Promise.allSettled(enCours);
      const vues = new Set<string>();
      return lignes.filter((l) => {
        const cle = `${l.table}:${l.id}`;
        if (vues.has(cle)) return false;
        vues.add(cle);
        return true;
      });
    },
  };
}

/** Message d'erreur court et sûr (jamais de corps de réponse dans les logs). */
function motif(e: unknown): string {
  return String(e instanceof Error ? e.message : e).slice(0, 60);
}

/** `calendar_posts×1, content_briefs×2` — lisible d'un coup d'œil dans la sortie. */
function resume(lignes: LigneCreee[]): string {
  const parTable = new Map<string, number>();
  for (const l of lignes) parTable.set(l.table, (parTable.get(l.table) || 0) + 1);
  return [...parTable].map(([t, n]) => `${t}×${n}`).join(", ");
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Jeton gardé 20 min par processus : une visite fait une trentaine de ménages,
// inutile de reconnecter Camille à chaque fois.
let jetonGarde: { token: string; a: number } | null = null;

/**
 * Jeton de Camille, avec trois essais espacés. Le 27/11/2026, pendant une visite
 * où le serveur ramait, sept ménages ont échoué sur « login impossible (délai) »
 * au premier et unique essai : sept fiches laissées pour une lenteur passagère.
 */
async function jetonAvecEssais(): Promise<{ token: string | null; motif: string }> {
  if (jetonGarde && Date.now() - jetonGarde.a < 20 * 60_000) return { token: jetonGarde.token, motif: "" };
  let dernier = "login refusé";
  for (const attente of [0, 4_000, 10_000]) {
    if (attente) await pause(attente);
    try {
      const token = await tokenCamille();
      if (token) {
        jetonGarde = { token, a: Date.now() };
        return { token, motif: "" };
      }
      dernier = "login refusé";
    } catch (e) {
      dernier = `login impossible (${motif(e)})`;
    }
  }
  return { token: null, motif: dernier };
}

/** `saved_ideas 1a2b…, 3c4d…` : de quoi retirer plus tard exactement ces lignes-là. */
function identifiants(lignes: LigneCreee[]): string {
  return lignes.map((l) => `${l.table} ${l.id}`).join(", ");
}

/**
 * Supprime les lignes tracées et renvoie une PHRASE à logguer (ne jette
 * jamais : un nettoyage raté ne doit pas rougir un test vert, il doit se LIRE).
 *
 * Suppression en LIFO (dernière créée d'abord) : c'est l'idiome de teardown, et
 * ça retire le post calendrier avant les lignes créées plus tôt qui le
 * référencent (les FK sont en SET NULL / CASCADE, mais l'ordre reste le bon
 * réflexe).
 *
 * Chaque suppression a droit à un second essai. Ce qui reste malgré tout est
 * NOMMÉ par son identifiant dans la phrase, pour pouvoir le retirer à la main
 * sans jamais chercher par titre.
 */
export async function supprimeLignesCreees(lignes: LigneCreee[]): Promise<string> {
  if (lignes.length === 0) return "rien à supprimer (aucune ligne créée par ce run)";
  const { url, anon } = configSupabase();
  if (!url || !anon) return `KO config Supabase absente — laissées en base : ${identifiants(lignes)}`;

  const { token, motif: pourquoi } = await jetonAvecEssais();
  if (!token) return `KO ${pourquoi} — laissées en base : ${identifiants(lignes)}`;

  const echecs: string[] = [];
  const restees: LigneCreee[] = [];
  for (const l of [...lignes].reverse()) {
    let erreur = "";
    for (const attente of [0, 4_000]) {
      if (attente) await pause(attente);
      try {
        const res = await fetch(`${url}/rest/v1/${l.table}?id=eq.${l.id}`, {
          method: "DELETE",
          headers: { apikey: anon, Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(20_000),
        });
        erreur = res.ok ? "" : `${l.table} ${res.status}`;
        if (res.status === 401) jetonGarde = null; // jeton périmé : le prochain ménage se reconnecte
      } catch (e) {
        erreur = `${l.table} ${motif(e)}`;
      }
      if (!erreur) break;
    }
    if (erreur) {
      echecs.push(erreur);
      restees.push(l);
    }
  }

  return echecs.length === 0
    ? `OK (${lignes.length} ligne(s) : ${resume(lignes)})`
    : `KO ${echecs.length}/${lignes.length} échec(s) : ${echecs.slice(0, 4).join(" | ")} — laissées en base : ${identifiants(restees)}`;
}
