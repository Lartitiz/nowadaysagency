// Helper partagé : récupère les 2-3 derniers briefs de l'utilisatrice
// pour enrichir le prompt de génération de questions et éviter la répétition.

export interface RecentBrief {
  subject: string;
  format?: string | null;
  editorial_angle?: string | null;
  created_at?: string;
}

/**
 * Récupère les N derniers briefs et formatte un bloc TRÈS COURT
 * (sujets / format / angle uniquement) à injecter dans le prompt système.
 *
 * On NE PASSE PLUS les "réponses marquantes" : trop longues, trop dominantes
 * dans le prompt, l'IA finit par mélanger les contextes et fabriquer des
 * questions hors-sujet (ex : Beaux-Arts qui n'a rien à voir avec le sujet courant).
 *
 * Objectif : permettre à l'IA d'éviter de re-poser la même question, sans
 * lui injecter de matière narrative qui pollue le sujet courant.
 */
export async function getRecentBriefsContext(
  supabase: any,
  userId: string,
  workspaceId?: string | null,
  limit = 3
): Promise<string> {
  try {
    let query = supabase
      .from("content_briefs")
      .select("subject, format, editorial_angle, created_at")
      .order("created_at", { ascending: false })
      .limit(limit + 5); // marge pour filtrer les sujets vides

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    } else {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) return "";

    const briefs: RecentBrief[] = data
      .filter((b: any) => typeof b.subject === "string" && b.subject.trim().length > 0)
      .slice(0, limit)
      .map((b: any) => ({
        subject: b.subject.trim(),
        format: b.format,
        editorial_angle: b.editorial_angle,
        created_at: b.created_at,
      }));

    if (briefs.length === 0) return "";

    const lines = briefs.map((b, i) => {
      // Sujet tronqué à 120 chars : juste assez pour comparer, pas de matière narrative.
      const subj = b.subject.length > 120 ? b.subject.slice(0, 117) + "..." : b.subject;
      const parts = [`Brief #${i + 1} — sujet : "${subj}"`];
      if (b.format) parts.push(`format : ${b.format}`);
      if (b.editorial_angle) parts.push(`angle : ${b.editorial_angle}`);
      return parts.join(" · ");
    });

    let result = `\n══ HISTORIQUE RÉCENT (${briefs.length} brief${briefs.length > 1 ? "s" : ""}, à titre indicatif) ══
${lines.join("\n")}

USAGE STRICT : ne re-pose pas une question déjà posée pour ces sujets passés. Ces briefs sont une référence ANTI-RÉPÉTITION uniquement — ils ne décrivent PAS le sujet courant. Ne mélange jamais leur contenu avec le sujet courant.
`;
    // Cap dur conservateur (était 5800)
    const MAX = 1500;
    if (result.length > MAX) {
      result = result.slice(0, MAX - 20) + "\n... (tronqué)\n";
    }
    return result;
  } catch (e) {
    console.error("[getRecentBriefsContext] error:", e);
    return "";
  }
}
