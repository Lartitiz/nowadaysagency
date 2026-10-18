// Actus vérifiables (18/10/2026) : une actu n'est renvoyée que si son lien est
// une page réellement trouvée par la recherche (web search de Claude ou
// Perplexity). Même règle que les faits du web des carrousels (#1723) : sans
// page trouvée, pas d'actu. Mesuré le 17/10 : 0 lien sur 6 actus, des chiffres
// sans source, des blogs de marque cités comme source.
//
// Contient aussi la normalisation des champs (sortie de index.ts, gelé par le
// cliquet anti-dette).

export interface PageTrouvee {
  url: string;
  date?: string; // AAAA-MM-JJ
}

const ALLOWED_AXES = new Set(["mot_qui_revient", "obsession_collective", "comportement_emergent", "debat_recurrent", "objet_culturel", "actu_connectable"]);
const ALLOWED_TONS = new Set(["confortable", "entre_deux", "decalant"]);
const ALLOWED_PONTS = new Set(["fort", "moyen", "fragile"]);
const ALLOWED_TYPES = new Set(["globale", "niche"]);

/** Clé de comparaison d'une adresse : hôte sans www, chemin sans / final, sans paramètres. */
export function cleUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const chemin = decodeURIComponent(u.pathname).replace(/\/+$/, "");
    return `${host}${chemin}`;
  } catch {
    return null;
  }
}

/** Date lisible par la machine (AAAA-MM-JJ) depuis une date ISO, « October 14, 2026 » ou « 3 days ago ». */
export function dateIso(valeur: unknown, maintenant = Date.now()): string | undefined {
  if (typeof valeur !== "string" || !valeur.trim()) return undefined;
  const v = valeur.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const rel = /^(\d+)\s+(minute|hour|day|week|month)s?\s+ago$/i.exec(v);
  if (rel) {
    const unite = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000 }[rel[2].toLowerCase() as "day"];
    return new Date(maintenant - Number(rel[1]) * unite).toISOString().slice(0, 10);
  }
  // « October 14, 2026 » est lu à minuit heure locale : on garde le jour local.
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Pages trouvées pendant la recherche : résultats du web search, citations, actus Perplexity. */
export function pagesTrouvees(
  contenu: any[],
  perplexity: { source_url?: string; date_publication?: string }[] = [],
): Map<string, PageTrouvee> {
  const pages = new Map<string, PageTrouvee>();
  const ajouter = (url: unknown, date?: unknown) => {
    const cle = cleUrl(url);
    if (!cle) return;
    const deja = pages.get(cle);
    pages.set(cle, { url: deja?.url ?? (url as string).trim(), date: deja?.date ?? dateIso(date) });
  };
  for (const bloc of contenu || []) {
    if (bloc?.type === "web_search_tool_result" && Array.isArray(bloc.content)) {
      for (const r of bloc.content) if (r?.type === "web_search_result") ajouter(r.url, r.page_age);
    }
    if (bloc?.type === "text" && Array.isArray(bloc.citations)) {
      for (const c of bloc.citations) ajouter(c?.url);
    }
  }
  for (const a of perplexity) ajouter(a.source_url, a.date_publication);
  return pages;
}

/** Garde seulement les actus dont le lien est une page trouvée ; ajoute la date si on la connaît. */
export function garderActusSourcees(actus: any[], pages: Map<string, PageTrouvee>): { gardees: any[]; retirees: string[] } {
  const gardees: any[] = [];
  const retirees: string[] = [];
  for (const a of actus) {
    const page = pages.get(cleUrl(a?.source_url) ?? "");
    if (!page) {
      retirees.push(String(a?.titre || "").slice(0, 80));
      continue;
    }
    const hote = new URL(page.url).hostname.replace(/^www\./, "");
    gardees.push({
      ...a,
      source_url: page.url,
      source: typeof a.source === "string" && a.source.trim() ? a.source : hote,
      date_publication: dateIso(a.date_publication) ?? page.date,
    });
  }
  return { gardees, retirees };
}

/** Normalisation des champs : valeurs connues seulement (sinon le badge ne s'affiche pas côté écran). */
export function normaliserActus(actus: any[], strip: (t: string) => string): any[] {
  return actus
    .filter((a: any) => a && typeof a === "object")
    .map((a: any) => ({
      ...a,
      titre: typeof a.titre === "string" ? strip(a.titre).slice(0, 140) : "Actu",
      resume: typeof a.resume === "string" ? strip(a.resume) : "",
      source: typeof a.source === "string" ? a.source : "",
      type: ALLOWED_TYPES.has(a.type) ? a.type : "globale",
      axe: ALLOWED_AXES.has(a.axe) ? a.axe : "actu_connectable",
      ton: ALLOWED_TONS.has(a.ton) ? a.ton : "entre_deux",
      force_pont: ALLOWED_PONTS.has(a.force_pont) ? a.force_pont : "moyen",
      pertinence: typeof a.pertinence === "string" ? strip(a.pertinence) : "",
      faits_cles: Array.isArray(a.faits_cles)
        ? a.faits_cles
            .filter((f: unknown): f is string => typeof f === "string")
            .map((f: string) => strip(f).slice(0, 200))
            .filter((f: string) => f.length > 0)
            .slice(0, 8)
        : [],
    }));
}
