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
const EVERGREEN_PATTERNS: RegExp[] = [
  /\bwebinaires?\b/i,
  /\bwebinars?\b/i,
  /\breplays?\b/i,
  /\binscription[s]?\s+(ouverte|gratuite)/i,
  /\bs[''']inscrire\b/i,
  /\bsave\s+the\s+date\b/i,
  /\blive\s+le\s+\d/i,
  /\bconf[ée]rence\s+du\s+\d/i,
  /\bmasterclass\s+(du|le)\s+\d/i,
  /\bbillets?\s+(en\s+vente|disponibles)/i,
  /\b[ée]v[ée]nement\s+(\dème|annuel|de\s+l)/i,
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

function looksEvergreen(a: PerplexityActu): boolean {
  const blob = `${a.titre} ${a.resume}`;
  return EVERGREEN_PATTERNS.some((rx) => rx.test(blob));
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
}): Promise<{ actus: PerplexityActu[]; citations: string[]; raw: string }> {
  const { niche, universKeywords, excludedUrls, recency, afterDate, todayLabel, apiKey, signal } = opts;

  const universLine = universKeywords.length
    ? `Centres d'intérêt de cette personne (pour aiguiller la sélection, pas pour restreindre) : ${universKeywords.slice(0, 6).join(", ")}.`
    : "";

  const excludedLine = excludedUrls.length
    ? `\n\n⚠️ NE PROPOSE PAS ces URLs (déjà vues, à exclure) :\n${excludedUrls.slice(0, 30).map((u) => `- ${u}`).join("\n")}`
    : "";

  const afterLabel = afterDate.toISOString().slice(0, 10);

  const userPrompt = `📅 DATE DU JOUR : ${todayLabel}.

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

  const body = {
    model: "sonar-pro",
    messages: [
      {
        role: "system",
        content:
          "Tu es une assistante de veille pour créateur·ices de contenu. Tu cherches des actus FRAÎCHES qui alimentent la discussion publique cette semaine, pas des marronniers, pas des événements/webinaires/replays. Tu réponds en JSON strict. Si une source n'a pas de date de publication claire, tu ne la cites pas.",
      },
      { role: "user", content: userPrompt },
    ],
    search_recency_filter: recency,
    search_after_date_filter: formatDateUS(afterDate),
    temperature: 0.2,
    max_tokens: 1500,
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
}): Promise<PerplexityResult> {
  const { niche, universKeywords = [], recency = "week", excludedUrls = [], apiKey, signal } = opts;

  const today = new Date();
  const todayLabel = todayISO();
  const after10 = new Date(today.getTime() - 10 * 86_400_000);

  // Premier appel — fenêtre 10 j
  const first = await callSonar({
    niche,
    universKeywords,
    excludedUrls,
    recency,
    afterDate: after10,
    todayLabel,
    apiKey,
    signal,
  });

  const excludedSet = new Set(excludedUrls.map((u) => u.trim().toLowerCase()));

  const filterPipeline = (list: PerplexityActu[], maxAgeDays: number): PerplexityActu[] => {
    return list.filter((a) => {
      if (!a.titre || !a.resume) return false;
      if (a.source_url && excludedSet.has(a.source_url.trim().toLowerCase())) return false;
      if (!isFreshEnough(a.date_publication, maxAgeDays)) {
        console.log(`[perplexity] dropped (date): "${a.titre?.slice(0, 60)}" → ${a.date_publication}`);
        return false;
      }
      if (looksEvergreen(a)) {
        console.log(`[perplexity] dropped (evergreen): "${a.titre?.slice(0, 60)}"`);
        return false;
      }
      return true;
    });
  };

  let kept = filterPipeline(first.actus, 14);

  // Si trop peu, on retente avec une fenêtre serrée à 5 j
  if (kept.length < 2) {
    console.log(`[perplexity] only ${kept.length} actu(s) après filtre, retry serré -5j`);
    try {
      const after5 = new Date(today.getTime() - 5 * 86_400_000);
      const second = await callSonar({
        niche,
        universKeywords,
        excludedUrls,
        recency: "week",
        afterDate: after5,
        todayLabel,
        apiKey,
        signal,
      });
      const keptSecond = filterPipeline(second.actus, 10);
      // dédoublonne par URL
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
