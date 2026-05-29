/**
 * Perplexity Sonar — sourcing d'actus chaudes pour le newsjacking.
 *
 * Modèle : `sonar-pro` (multi-step search, meilleure discrimination de fraîcheur
 * que `sonar` light, indispensable pour ne pas remonter des pages evergreen).
 *
 * Garde-fous fraîcheur :
 *   - `search_after_date_filter` (date plancher hard)
 *   - prompt qui rappelle la date du jour
 *   - validation `date_publication` côté code
 *   - filtre mots-clés evergreen (webinaire passé, replay, etc.)
 *   - retry serré (-5j) si trop peu d'actus survivent
 *   - exclusion des URLs déjà vues dans la session
 *
 * Doc : https://docs.perplexity.ai/
 */

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

export interface PerplexityActu {
  titre: string;
  resume: string;
  source: string;
  source_url?: string;
  date_publication?: string; // ISO YYYY-MM-DD
}

export interface PerplexityResult {
  actus: PerplexityActu[];
  citations: string[];
  raw_response?: string;
}

// Mots/phrases qui signalent un contenu evergreen ou un événement
// (passé OU à venir) plutôt qu'une vraie actu chaude.
export const EVERGREEN_PATTERNS: RegExp[] = [
  /\bwebinaires?\b/i,
  /\bwebinars?\b/i,
  /\breplays?\b/i,
  /\binscription[s]?\s+(ouverte|gratuite|en\s+ligne)/i,
  /\bs[''']inscrire\b/i,
  /\bsave\s+the\s+date\b/i,
  /\blive\s+le\s+\d/i,
  /\bconf[ée]rence\b/i,
  /\bmasterclass\b/i,
  /\bsalon\s+(du|de\s+la|professionnel)/i,
  /\bcolloque\b/i,
  /\bs[ée]minaire\b/i,
  /\bbillets?\s+(en\s+vente|disponibles)/i,
  /\b[ée]v[ée]nement\s+(\dème|annuel|de\s+l|du)/i,
  /\borganise\s+(un|une|le|la)\s+(webinaire|conf|masterclass|colloque|s[ée]minaire|[ée]v[ée]nement|table)/i,
  /\bjourn[ée]es?\s+(nationales?|d['ée]tude|professionnelles?)/i,
  /\btable\s+ronde\b/i,
  /\bpalmar[èe]s\s+(annuel|\d{4})/i,
  /\bbarom[èe]tre\s+\d{4}/i,
];

function formatDateUS(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}/${d.getFullYear()}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isFreshEnough(dateStr: string | undefined, maxAgeDays: number): boolean {
  if (!dateStr) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return false;
  const pub = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  if (isNaN(pub.getTime())) return false;
  const now = Date.now();
  const ageDays = (now - pub.getTime()) / 86_400_000;
  return ageDays >= -1 && ageDays <= maxAgeDays; // tolère +1j de décalage tz
}

// Patterns evergreen retirés en mode scoop : conférence/masterclass/colloque/
// table ronde/événement/journées nationales sont autorisés car beaucoup
// d'actus chocs viennent de prises de parole publiques.
const SCOOP_EVERGREEN_WHITELIST = new Set<RegExp>([
  /\bconf[ée]rence\b/i,
  /\bmasterclass\b/i,
  /\bcolloque\b/i,
  /\bs[ée]minaire\b/i,
  /\btable\s+ronde\b/i,
  /\bjourn[ée]es?\s+(nationales?|d['ée]tude|professionnelles?)/i,
  /\b[ée]v[ée]nement\s+(\dème|annuel|de\s+l|du)/i,
  /\borganise\s+(un|une|le|la)\s+(webinaire|conf|masterclass|colloque|s[ée]minaire|[ée]v[ée]nement|table)/i,
  /\bsalon\s+(du|de\s+la|professionnel)/i,
]);

function looksEvergreen(a: PerplexityActu, mode: "default" | "scoop" = "default"): boolean {
  const blob = `${a.titre} ${a.resume}`;
  const patterns = mode === "scoop"
    ? EVERGREEN_PATTERNS.filter((rx) => !SCOOP_EVERGREEN_WHITELIST.has(rx))
    : EVERGREEN_PATTERNS;
  return patterns.some((rx) => rx.test(blob));
}


async function callSonar(opts: {
  niche?: string;
  universKeywords: string[];
  excludedUrls: string[];
  recency: "day" | "week" | "month";
  afterDate: Date;
  todayLabel: string;
  apiKey: string;
  signal?: AbortSignal;
  mode?: "default" | "scoop";
}): Promise<{ actus: PerplexityActu[]; citations: string[]; raw: string }> {
  const { niche, universKeywords, excludedUrls, recency, afterDate, todayLabel, apiKey, signal, mode = "default" } = opts;

  const universLine = universKeywords.length
    ? `Centres d'intérêt de cette personne (pour aiguiller la sélection, pas pour restreindre) : ${universKeywords.slice(0, 6).join(", ")}.`
    : "";

  const excludedLine = excludedUrls.length
    ? `\n\n⚠️ NE PROPOSE PAS ces URLs (déjà vues, à exclure) :\n${excludedUrls.slice(0, 30).map((u) => `- ${u}`).join("\n")}`
    : "";

  const afterLabel = afterDate.toISOString().slice(0, 10);

  const userPrompt = mode === "scoop"
    ? `📅 DATE DU JOUR : ${todayLabel}.

Quelles sont les 4 à 6 actualités CHOC de cette semaine en France qui font RÉAGIR le grand public — sur lesquelles n'importe quelle créatrice de contenu aurait envie de rebondir publiquement ?

🎯 ON CHERCHE DU NEWSJACKING : polémique virale en cours, chiffre choc révélé, déclaration publique qui fait débat, affaire qui éclate, fuite/exposé, retournement d'enquête, sortie culturelle qui fait parler, dérive systémique nommée, classement/baromètre qui dérange, prise de parole d'une perso publique/marque/institution qui scandalise ou interpelle.

🚨 FRAÎCHEUR :
- Cible des actus PUBLIÉES depuis le ${afterLabel}.
- Si la date de publication est incertaine mais que le sujet fait clairement débat CETTE semaine sur les réseaux/médias français, garde-le quand même et mets une date approximative.

🚫 INTERDIT STRICT :
- Faits divers tragiques (accidents, meurtres, violences personnelles, drames intimes)
- Politique partisane (élections, partis nommés, attaques entre partis)
- Pages d'inscription/replay de webinaires, save the date, billets en vente
- Marketing pur, communiqués de presse promotionnels
- Marronniers annuels sans actu nouvelle ("tendances 2026" générique)

✅ AUTORISÉ (et recherché) : déclarations publiques, polémiques de prise de parole, conférences/colloques avec déclarations qui font débat, sorties médiatiques.

${niche ? `Profil de la personne qui va potentiellement réagir : ${niche}. Mais ne te restreins pas à son secteur — on cherche des actus GRAND PUBLIC.` : ""}
${universLine}${excludedLine}

Pour CHAQUE actu :
- titre court (max 90 caractères) qui doit déjà faire "oh wow"
- résumé en 2 phrases : ce qui s'est passé + pourquoi ça fait réagir
- nom du média source
- URL de l'article (obligatoire)
- date_publication YYYY-MM-DD (mets ta meilleure estimation si tu n'es pas sûre)

Réponds UNIQUEMENT avec ce JSON, sans markdown :
{
  "actus": [
    { "titre": "...", "resume": "...", "source": "...", "source_url": "https://...", "date_publication": "YYYY-MM-DD" }
  ]
}`
    : `📅 DATE DU JOUR : ${todayLabel}.

Quelles sont les 2-3 actualités CHAUDES de cette ${recency === "day" ? "journée" : recency === "week" ? "semaine" : "période"} en France qui font le plus DÉBAT, dont les gens parlent vraiment sur les réseaux ou en discussion ?

🚨 RÈGLE FRAÎCHEUR ABSOLUE :
- Tu ne renvoies QUE des actus PUBLIÉES entre le ${afterLabel} et ${todayLabel}.
- Si tu n'es pas SÛRE de la date de publication réelle (date affichée sur l'article, pas date de crawl), JETTE le sujet.
- Si la "date" trouvée est en réalité la date d'un événement passé ou à venir, JETTE.

🚫 INTERDIT (toujours) :
- Webinaires, conférences, masterclass, lives, événements (passés OU à venir) — même s'ils sont récents
- Pages de "replay" ou d'inscription, pages institutionnelles evergreen (Bpifrance, ministères, syndicats)
- Marronniers (palmarès annuels, baromètres récurrents, "tendances 2026")
- Faits divers tragiques (accidents, meurtres, violences personnelles)
- Propagande partisane (élections, partis nommés)
- Résultats sportifs purs, communiqués marketing

✅ INCLURE : polémiques publiques fraîches, déclarations virales, sorties marquantes (film, livre, série, album) de la fenêtre, phénomènes culturels qui montent CETTE SEMAINE, débats société qui ressortent CETTE SEMAINE, mouvements sociaux discutés CETTE SEMAINE.

${niche ? `Profil de la personne qui va potentiellement réagir à ces actus : ${niche}.` : ""}
${universLine}${excludedLine}

Pour CHAQUE actu, fournis OBLIGATOIREMENT :
- titre court (max 90 caractères)
- résumé factuel en 2 phrases (ce qui s'est passé + pourquoi ça fait débat)
- nom du média source principal
- URL de l'article source (obligatoire)
- date_publication au format ISO strict YYYY-MM-DD (obligatoire — c'est la date affichée sur l'article, PAS la date du jour, PAS la date d'un événement annoncé)

Réponds UNIQUEMENT avec ce JSON, sans markdown, sans backticks :
{
  "actus": [
    {
      "titre": "...",
      "resume": "...",
      "source": "...",
      "source_url": "https://...",
      "date_publication": "YYYY-MM-DD"
    }
  ]
}`;

  const systemContent = mode === "scoop"
    ? "Tu es une assistante de veille newsjacking pour créateur·ices. Tu cherches des actus CHOC, virales, qui font réagir le grand public français cette semaine — celles dont tout le monde parle. Tu réponds en JSON strict. Tu acceptes les sujets même si la date exacte est floue, du moment qu'ils font clairement débat en ce moment."
    : "Tu es une assistante de veille pour créateur·ices de contenu. Tu cherches des actus FRAÎCHES qui alimentent la discussion publique cette semaine, pas des marronniers, pas des événements/webinaires/replays. Tu réponds en JSON strict. Si une source n'a pas de date de publication claire, tu ne la cites pas.";

  // Note : Perplexity refuse `search_recency_filter` + `search_after_date_filter`
  // ensemble (erreur 400 invalid_date_filter_combination). On garde uniquement
  // `search_after_date_filter`.
  const body = {
    model: "sonar-pro",
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userPrompt },
    ],
    search_after_date_filter: formatDateUS(afterDate),
    temperature: mode === "scoop" ? 0.4 : 0.2,
    max_tokens: mode === "scoop" ? 2200 : 1500,
  };


  const response = await fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Perplexity error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const content: string = data?.choices?.[0]?.message?.content || "";
  const citations: string[] = Array.isArray(data?.citations) ? data.citations : [];

  let parsed: { actus?: PerplexityActu[] } = {};
  try {
    parsed = JSON.parse(content.trim());
  } catch {
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(content.slice(firstBrace, lastBrace + 1));
      } catch (e) {
        console.warn("[perplexity] JSON parse failed:", (e as Error).message);
      }
    }
  }

  const actus = Array.isArray(parsed.actus) ? parsed.actus : [];
  const enriched = actus.map((a, i) => {
    if (!a.source_url && citations[i]) return { ...a, source_url: citations[i] };
    return a;
  });

  return { actus: enriched, citations, raw: content };
}

/**
 * Cherche 2-5 actus chaudes qui font débat sur la semaine.
 * Applique une double validation (date + mots-clés evergreen) et retente
 * avec une fenêtre plus serrée si trop peu d'actus survivent.
 */
export async function fetchHotNews(opts: {
  niche?: string;
  universKeywords?: string[];
  recency?: "day" | "week" | "month";
  excludedUrls?: string[];
  apiKey: string;
  signal?: AbortSignal;
  mode?: "default" | "scoop";
}): Promise<PerplexityResult> {
  const { niche, universKeywords = [], recency = "week", excludedUrls = [], apiKey, signal, mode = "default" } = opts;

  const today = new Date();
  const todayLabel = todayISO();

  // En mode scoop, on évite "day" (trop étroit) et on prend une fenêtre plus
  // large pour ne pas étrangler Perplexity ; le filtre côté code reste serré.
  const effectiveRecency: "day" | "week" | "month" =
    mode === "scoop" ? (recency === "day" ? "week" : recency) : recency;
  const firstWindowDays = mode === "scoop" ? 14 : 10;
  const firstAfter = new Date(today.getTime() - firstWindowDays * 86_400_000);

  // Premier appel
  const first = await callSonar({
    niche,
    universKeywords,
    excludedUrls,
    recency: effectiveRecency,
    afterDate: firstAfter,
    todayLabel,
    apiKey,
    signal,
    mode,
  });

  const excludedSet = new Set(excludedUrls.map((u) => u.trim().toLowerCase()));

  const filterPipeline = (list: PerplexityActu[], maxAgeDays: number): PerplexityActu[] => {
    return list.filter((a) => {
      if (!a.titre || !a.resume) return false;
      if (a.source_url && excludedSet.has(a.source_url.trim().toLowerCase())) return false;
      // En mode scoop : tolère date manquante/illisible si on a une URL source.
      const dateOk = isFreshEnough(a.date_publication, maxAgeDays);
      if (!dateOk) {
        if (mode === "scoop" && a.source_url) {
          console.log(`[perplexity:scoop] kept (date floue): "${a.titre?.slice(0, 60)}" → ${a.date_publication ?? "none"}`);
        } else {
          console.log(`[perplexity] dropped (date): "${a.titre?.slice(0, 60)}" → ${a.date_publication}`);
          return false;
        }
      }
      if (looksEvergreen(a, mode)) {
        console.log(`[perplexity${mode === "scoop" ? ":scoop" : ""}] dropped (evergreen): "${a.titre?.slice(0, 60)}"`);
        return false;
      }
      return true;
    });
  };

  let kept = filterPipeline(first.actus, mode === "scoop" ? 21 : 14);

  // Retry si trop peu d'actus survivent
  if (kept.length < 2) {
    const retryDays = mode === "scoop" ? 21 : 5;
    const retryRecency: "day" | "week" | "month" = mode === "scoop" ? "month" : "week";
    console.log(`[perplexity${mode === "scoop" ? ":scoop" : ""}] only ${kept.length} actu(s) après filtre, retry élargi (-${retryDays}j, ${retryRecency})`);
    try {
      const retryAfter = new Date(today.getTime() - retryDays * 86_400_000);
      const second = await callSonar({
        niche,
        universKeywords,
        excludedUrls,
        recency: retryRecency,
        afterDate: retryAfter,
        todayLabel,
        apiKey,
        signal,
        mode,
      });
      const keptSecond = filterPipeline(second.actus, mode === "scoop" ? 28 : 10);
      const urls = new Set(kept.map((a) => (a.source_url || "").toLowerCase()));
      for (const a of keptSecond) {
        const u = (a.source_url || "").toLowerCase();
        if (!u || !urls.has(u)) {
          kept.push(a);
          urls.add(u);
        }
      }
    } catch (e) {
      console.warn("[perplexity] retry failed (non-blocking):", (e as Error).message);
    }
  }

  return {
    actus: kept,
    citations: first.citations,
    raw_response: first.raw,
  };
}

