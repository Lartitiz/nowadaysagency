/**
 * 🧹 « Idées laissées par la visite » — la ligne de contrôle du ménage.
 *
 * Constat du 27/11/2026 : Camille avait plus de 1000 fiches dans « Mes idées »,
 * presque toutes des brouillons posés par la visite elle-même (l'app range un
 * brouillon dès qu'on passe par /creer). Effets vus le même matin : la lecture
 * des idées coupée par la base sur téléphone (500, code 57014) et la même fiche
 * de test trois fois dans le panneau du calendrier.
 *
 * Chaque spec retire maintenant ses propres lignes (cf. test-propre.ts). Cette
 * ligne vérifie le résultat d'ensemble, sans rien supprimer : on note l'heure au
 * départ de la visite, et à la fin on compte les idées de Camille créées depuis
 * et encore là. 0 = ✅. N = 🟠, avec les titres pour retrouver la spec fautive.
 *
 * Lecture seule, zéro crédit. Ne jette jamais : la ligne se LIT.
 */
import { configSupabase, tokenCamille } from "./nettoyage-camille";

const CLE = "VISITE_DEBUT_ISO";

/** globalSetup : note l'heure de départ (même processus que le teardown). */
export function noteDebutVisite() {
  // 5 s de marge : l'horloge du Mac et celle de la base ne sont pas à la seconde.
  process.env[CLE] = new Date(Date.now() - 5_000).toISOString();
}

function userIdDuJeton(token: string): string | null {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"))?.sub ?? null;
  } catch {
    return null;
  }
}

/** globalTeardown : renvoie la ligne à imprimer. */
export async function ligneIdeesLaissees(): Promise<string> {
  const titre = "🧹 Idées laissées par la visite :";
  const debut = process.env[CLE];
  if (!debut) return `${titre} non mesuré (heure de départ absente)`;
  try {
    const { url, anon } = configSupabase();
    const token = await tokenCamille();
    const userId = token && userIdDuJeton(token);
    if (!url || !anon || !token || !userId) return `${titre} non mesuré (connexion de Camille impossible)`;
    const res = await fetch(
      `${url}/rest/v1/saved_ideas?select=titre,format&user_id=eq.${userId}&created_at=gte.${encodeURIComponent(debut)}&limit=1000`,
      { headers: { apikey: anon, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) },
    );
    if (!res.ok) return `${titre} non mesuré (lecture refusée, HTTP ${res.status})`;
    const lignes = (await res.json()) as { titre: string | null; format: string | null }[];
    if (lignes.length === 0) return `${titre} 0 ✅`;
    const parTitre = new Map<string, number>();
    for (const l of lignes) {
      const cle = `« ${(l.titre || "sans titre").slice(0, 50)} » (${l.format || "?"})`;
      parTitre.set(cle, (parTitre.get(cle) || 0) + 1);
    }
    const detail = [...parTitre]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([t, n]) => `${n}× ${t}`)
      .join(" · ");
    return `${titre} ${lignes.length} 🟠 — ${detail}`;
  } catch (e) {
    return `${titre} non mesuré (${String(e instanceof Error ? e.message : e).slice(0, 60)})`;
  }
}
