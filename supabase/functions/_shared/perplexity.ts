/**
 * Perplexity Sonar — sourcing d'actus chaudes pour le newsjacking.
 *
 * Usage : recherche grand public ciblée sur la presse FR généraliste,
 * avec filtre de récence natif et citations URLs.
 *
 * Doc : https://docs.perplexity.ai/
 */

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

export interface PerplexityActu {
  titre: string;
  resume: string;
  source: string;
  source_url?: string;
  date_publication?: string; // ISO si disponible
}

export interface PerplexityResult {
  actus: PerplexityActu[];
  citations: string[];
  raw_response?: string; // utile pour debug/parsing fallback
}

/**
 * Cherche 2-3 actus chaudes qui font débat sur la semaine.
 *
 * @param niche  Description courte du métier de l'utilisatrice (ex : "coach lingerie")
 * @param universKeywords  Mots-clés issus du brand_universe pour orienter la recherche
 * @param recency  'day' | 'week' | 'month'
 * @returns liste d'actus + citations brutes
 */
export async function fetchHotNews(opts: {
  niche?: string;
  universKeywords?: string[];
  recency?: "day" | "week" | "month";
  apiKey: string;
  signal?: AbortSignal;
}): Promise<PerplexityResult> {
  const { niche, universKeywords = [], recency = "week", apiKey, signal } = opts;

  const universLine = universKeywords.length
    ? `Centres d'intérêt de cette personne (pour aiguiller la sélection, pas pour restreindre) : ${universKeywords.slice(0, 6).join(", ")}.`
    : "";

  const userPrompt = `Quelles sont les 2-3 actualités CHAUDES de cette ${recency === "day" ? "journée" : recency === "week" ? "semaine" : "période"} en France qui font le plus DÉBAT, dont les gens parlent vraiment sur les réseaux ou en discussion ?

Inclure : polémiques publiques, déclarations virales, sorties marquantes (film, livre, série, album), phénomènes culturels qui montent, débats société qui ressortent, mouvements sociaux discutés.

EXCLURE : faits divers tragiques (accidents, meurtres, violences personnelles), propagande partisane explicite (élections, partis politiques nommés), résultats sportifs purs, communiqués marketing.

${niche ? `Profil de la personne qui va potentiellement réagir à ces actus : ${niche}.` : ""}
${universLine}

Pour CHAQUE actu, fournis :
- titre court (max 90 caractères)
- résumé factuel en 2 phrases (ce qui s'est passé + pourquoi ça fait débat)
- nom du média source principal
- URL de l'article source
- date de publication (format YYYY-MM-DD si possible)

Réponds UNIQUEMENT avec ce JSON, sans markdown, sans backticks :
{
  "actus": [
    {
      "titre": "...",
      "resume": "...",
      "source": "...",
      "source_url": "https://...",
      "date_publication": "2026-XX-XX"
    }
  ]
}`;

  const body = {
    model: "sonar",
    messages: [
      {
        role: "system",
        content:
          "Tu es une assistante de veille pour créateur·ices de contenu. Tu cherches des actus qui ALIMENTENT la discussion publique, pas des marronniers. Tu réponds en JSON strict.",
      },
      { role: "user", content: userPrompt },
    ],
    search_recency_filter: recency,
    temperature: 0.3,
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

  // Parse JSON content
  let parsed: { actus?: PerplexityActu[] } = {};
  try {
    parsed = JSON.parse(content.trim());
  } catch {
    // Try to extract first {...} block
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

  // If source_url is missing on an actu, try to backfill from citations array
  // (citations are usually in order of relevance from Perplexity)
  const enriched = actus.map((a, i) => {
    if (!a.source_url && citations[i]) {
      return { ...a, source_url: citations[i] };
    }
    return a;
  });

  return {
    actus: enriched,
    citations,
    raw_response: content,
  };
}
