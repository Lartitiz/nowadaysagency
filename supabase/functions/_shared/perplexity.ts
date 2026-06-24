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
// On compare par `.source` (pas par référence d'objet) : un littéral regex
// recopié ici est un OBJET différent de celui de EVERGREEN_PATTERNS, donc un
// Set<RegExp> + .has(rx) ne matcherait jamais (whitelist morte → scoop filtrait
// encore conférences/masterclass). La source textuelle, elle, est identique.
const SCOOP_EVERGREEN_WHITELIST = new Set<string>([
  /\bconf[ée]rence\b/i,
  /\bmasterclass\b/i,
  /\bcolloque\b/i,
  /\bs[ée]minaire\b/i,
  /\btable\s+ronde\b/i,
  /\bjourn[ée]es?\s+(nationales?|d['ée]tude|professionnelles?)/i,
  /\b[ée]v[ée]nement\s+(\dème|annuel|de\s+l|du)/i,
  /\borganise\s+(un|une|le|la)\s+(webinaire|conf|masterclass|colloque|s[ée]minaire|[ée]v[ée]nement|table)/i,
  /\bsalon\s+(du|de\s+la|professionnel)/i,
].map((rx) => rx.source));

function looksEvergreen(a: PerplexityActu, mode: "default" | "scoop" = "default"): boolean {
  const blob = `${a.titre} ${a.resume}`;
  const patterns = mode === "scoop"
    ? EVERGREEN_PATTERNS.filter((rx) => !SCOOP_EVERGREEN_WHITELIST.has(rx.source))
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

  // Prompts épurés : règles stables dans le system, requête de recherche dans le user.
  // Sonar utilise le user message comme base de sa requête web → on le garde court.
  const userPrompt = mode === "scoop"
    ? `Date du jour : ${todayLabel}. Actus actives depuis le ${afterLabel}.

Trouve 6 actus CHOC de la semaine en France qui font débat grand public — celles dont tout le monde parle en ce moment (dîners, réseaux, médias).

Couvre AU MOINS 4 des 6 catégories suivantes (1 par catégorie idéalement, jamais 3 du même registre) :
  (a) Scandale / accusation visant une personnalité publique connue (MeToo nommé, mise en examen médiatisée, témoignage de victimes)
  (b) Événement culturel en cours ou qui vient de s'achever (festival type Cannes/Avignon, cérémonie, sortie marquante film/série/album, polémique tapis rouge)
  (c) Polémique société / débat viral qui clive
  (d) Chiffre / rapport / enquête qui choque
  (e) Déclaration publique virale (interview, plateau TV, post)
  (f) Affaire judiciaire / économique / institutionnelle médiatisée
${universLine ? `\n${universLine}` : ""}${excludedLine}`
    : `Date du jour : ${todayLabel}. Actus publiées entre le ${afterLabel} et aujourd'hui.

Trouve 2-3 actualités françaises de cette ${recency === "day" ? "journée" : recency === "week" ? "semaine" : "période"} qui font vraiment débat sur les réseaux ou en discussion publique : polémiques fraîches, déclarations virales, sorties marquantes (film, livre, série, album), phénomènes culturels qui montent, mouvements sociaux.
${niche ? `\nProfil de la personne qui va potentiellement réagir : ${niche}.` : ""}${universLine ? `\n${universLine}` : ""}${excludedLine}`;

  // Systems riches et stables (cachables côté Perplexity).
  const systemContent = mode === "scoop"
    ? `Tu es une assistante de veille newsjacking pour créateur·ices francophones, focus France.

Mission : remonter les actus CHOC grand public de la semaine — celles dont tout le monde parle.

Règles de tri permanentes :
- AUTORISÉ et recherché : accusations publiques nommant des personnalités connues (MeToo, mises en cause médiatisées, témoignages de victimes contre figures publiques), festivals/cérémonies/sorties culturelles, polémiques tapis rouge, déclarations en interview/plateau/post qui font réagir, affaires judiciaires impliquant personnalités/marques/institutions, débats société viraux, chiffres/rapports qui dérangent.
- INTERDIT : faits divers locaux anonymes (accident de la route, drame familial sans portée publique), propagande partisane (élections en cours, attaques entre partis nommés), pages d'inscription/replay de webinaires, save the date, billets en vente, communiqués marketing purs, marronniers annuels sans actu nouvelle ("tendances 2026" générique).
- Tu acceptes les sujets même si la date exacte est floue, du moment qu'ils font clairement débat cette semaine et que tu as une URL source.

Pour chaque actu : titre court (<90 caractères) qui déjà fait "oh wow", résumé en 2 phrases (ce qui s'est passé + pourquoi ça fait réagir), nom du média, URL de l'article (obligatoire), date_publication YYYY-MM-DD (meilleure estimation si floue).`
    : `Tu es une assistante de veille pour créateur·ices de contenu francophones.

Mission : remonter les actus FRAÎCHES qui alimentent la discussion publique cette semaine — pas des marronniers, pas des événements/webinaires/replays.

Règles de tri permanentes :
- AUTORISÉ : polémiques publiques fraîches, déclarations virales, sorties marquantes (film, livre, série, album), phénomènes culturels qui montent, débats société qui ressortent cette semaine, mouvements sociaux discutés.
- INTERDIT : webinaires, conférences, masterclass, lives, événements (passés ou à venir) — même récents ; pages de replay ou d'inscription ; pages institutionnelles evergreen ; marronniers (palmarès annuels, baromètres récurrents, "tendances 2026") ; faits divers tragiques anonymes ; propagande partisane ; résultats sportifs purs ; communiqués marketing.
- Si tu n'es pas sûre de la date réelle de publication, ne cite pas la source.

Pour chaque actu : titre court (<90 caractères), résumé factuel en 2 phrases, nom du média source principal, URL de l'article (obligatoire), date_publication YYYY-MM-DD (date affichée sur l'article, pas date du jour, pas date d'un événement annoncé).`;

  // Schéma JSON strict pour fiabiliser le parsing (remplace "réponds en JSON" en prose).
  const responseFormat = {
    type: "json_schema",
    json_schema: {
      schema: {
        type: "object",
        properties: {
          actus: {
            type: "array",
            items: {
              type: "object",
              properties: {
                titre: { type: "string" },
                resume: { type: "string" },
                source: { type: "string" },
                source_url: { type: "string" },
                date_publication: { type: "string" },
              },
              required: ["titre", "resume", "source", "source_url"],
            },
          },
        },
        required: ["actus"],
      },
    },
  };

  // Note : Perplexity refuse `search_recency_filter` + `search_after_date_filter`
  // ensemble (erreur 400 invalid_date_filter_combination). On garde uniquement
  // `search_after_date_filter`.
  const body: Record<string, unknown> = {
    model: "sonar-pro",
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userPrompt },
    ],
    search_after_date_filter: formatDateUS(afterDate),
    temperature: mode === "scoop" ? 0.4 : 0.2,
    max_tokens: mode === "scoop" ? 2000 : 1000,
    response_format: responseFormat,
  };

  if (mode === "scoop") {
    body.web_search_options = { search_context_size: "high" };
  }



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

