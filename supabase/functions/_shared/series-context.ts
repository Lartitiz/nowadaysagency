/**
 * Builds a "CONTEXTE SÉRIE" prompt block for the AI generators.
 * Reads the target series + its 3-5 most recent produced episodes,
 * and formats them as a concise system-prompt insert.
 *
 * Returns null when no series is provided or the series cannot be found —
 * generators should treat null as "no series context, generate normally".
 */

const CADENCE_LABELS: Record<string, string> = {
  weekly: "hebdomadaire",
  biweekly: "bimensuelle",
  monthly: "mensuelle",
  irregular: "irrégulière",
};

const CHANNEL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  newsletter: "Newsletter",
  blog: "Blog",
};

function summarizeEpisode(post: any): string {
  const accroche = (post.accroche || "").trim();
  if (accroche) return accroche.length > 200 ? accroche.slice(0, 197) + "…" : accroche;
  const draft = (post.content_draft || "").trim();
  if (draft) {
    const oneLine = draft.replace(/\s+/g, " ");
    return oneLine.length > 200 ? oneLine.slice(0, 197) + "…" : oneLine;
  }
  return "(pas de résumé)";
}

export interface SeriesContextResult {
  block: string;
  episodeNumber: number;
  seriesName: string;
}

export async function buildSeriesContext(
  supabase: any,
  seriesId: string | null | undefined,
  episodeNumber?: number | null,
  channel?: string | null,
): Promise<SeriesContextResult | null> {
  if (!seriesId) return null;

  // 1. Fetch series metadata (RLS scoped via authed client)
  const { data: series, error: seriesError } = await supabase
    .from("series")
    .select("id, name, promise, format_template, signature_description, cadence, channels, status")
    .eq("id", seriesId)
    .maybeSingle();

  if (seriesError || !series) {
    console.warn("[series-context] series not found", seriesId, seriesError?.message);
    return null;
  }

  // 2. Fetch up to 5 most recent episodes for this series
  const { data: episodes } = await supabase
    .from("calendar_posts")
    .select("episode_number, theme, accroche, content_draft, date")
    .eq("series_id", seriesId)
    .order("episode_number", { ascending: false, nullsFirst: false })
    .order("date", { ascending: false })
    .limit(5);

  const eps = Array.isArray(episodes) ? episodes : [];

  // 3. Resolve current episode number
  let currentEpisode = episodeNumber ?? null;
  if (!currentEpisode || currentEpisode < 1) {
    const maxNum = eps.reduce((max, e) => {
      const n = typeof e.episode_number === "number" ? e.episode_number : 0;
      return n > max ? n : max;
    }, 0);
    currentEpisode = maxNum + 1;
  }

  // 4. Filter episodes that come strictly BEFORE the current one
  const previous = eps
    .filter((e) => typeof e.episode_number === "number" && (e.episode_number as number) < (currentEpisode as number))
    .slice(0, 5);

  // 5. Channel mismatch note
  const seriesChannels: string[] = Array.isArray(series.channels) ? series.channels : [];
  let channelNote = "";
  if (channel && seriesChannels.length > 0 && !seriesChannels.includes(channel)) {
    const labels = seriesChannels.map((c) => CHANNEL_LABELS[c] || c).join(", ");
    channelNote = ` (série prévue pour ${labels}, adaptation au canal ${CHANNEL_LABELS[channel] || channel})`;
  }

  // 6. Format the block
  const previousLines = previous.length
    ? previous
        .map((e) => `- #${e.episode_number} : ${e.theme || "(sans thème)"} — ${summarizeEpisode(e)}`)
        .join("\n")
    : "- (aucun épisode précédent — c'est le premier)";

  const cadenceLabel = series.cadence ? CADENCE_LABELS[series.cadence] || series.cadence : "non définie";

  const block = `══ CONTEXTE SÉRIE ══
Série : ${series.name} (épisode #${currentEpisode})${channelNote}
Promesse : ${series.promise || "(non définie)"}
${series.format_template ? `Format fixe : ${series.format_template}\n` : ""}${series.signature_description ? `Signature : ${series.signature_description}\n` : ""}Cadence : ${cadenceLabel}

Derniers épisodes produits :
${previousLines}

CONSIGNES SÉRIE :
- Cet épisode doit tenir la promesse de la série
- Respecte le format fixe et la signature visuelle/structurelle
- Évite de répéter exactement les angles des derniers épisodes (varie l'angle, pas la promesse)
- Numérote l'épisode dans le contenu si pertinent (ex : "Épisode #${currentEpisode} —")
`;

  return {
    block,
    episodeNumber: currentEpisode as number,
    seriesName: series.name,
  };
}
