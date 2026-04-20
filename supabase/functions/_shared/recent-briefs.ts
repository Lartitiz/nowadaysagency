// Helper partagé : récupère les 2-3 derniers briefs de l'utilisatrice
// pour enrichir le prompt de génération de questions et éviter la répétition.

export interface RecentBrief {
  subject: string;
  format?: string | null;
  editorial_angle?: string | null;
  key_answer?: string | null;
  created_at?: string;
}

/**
 * Récupère les N derniers briefs de l'utilisatrice et formatte un bloc
 * texte court à injecter dans le prompt système.
 *
 * Objectif : permettre à l'IA d'éviter les angles déjà couverts et de
 * faire écho aux réflexions précédentes ("la dernière fois tu disais X").
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
      .select("subject, format, editorial_angle, answers, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    } else {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) return "";

    const briefs: RecentBrief[] = data.map((b: any) => {
      // Extract one key answer (longest non-trivial response)
      let keyAnswer: string | null = null;
      if (b.answers && typeof b.answers === "object") {
        const values = Object.values(b.answers as Record<string, string>)
          .filter((v): v is string => typeof v === "string" && v.trim().length > 20);
        if (values.length > 0) {
          // Pick the longest (likely the most substantive)
          keyAnswer = values.sort((a, b) => b.length - a.length)[0];
          // Truncate to 180 chars to keep the prompt lean
          if (keyAnswer.length > 180) keyAnswer = keyAnswer.slice(0, 177) + "...";
        }
      }
      return {
        subject: b.subject,
        format: b.format,
        editorial_angle: b.editorial_angle,
        key_answer: keyAnswer,
        created_at: b.created_at,
      };
    });

    const lines = briefs.map((b, i) => {
      const parts = [`Brief #${i + 1} — sujet : "${b.subject}"`];
      if (b.format) parts.push(`format : ${b.format}`);
      if (b.editorial_angle) parts.push(`angle : ${b.editorial_angle}`);
      let line = parts.join(" · ");
      if (b.key_answer) line += `\n  Réponse marquante : "${b.key_answer}"`;
      return line;
    });

    let result = `\n══ HISTORIQUE RÉCENT DE L'UTILISATRICE (${briefs.length} dernier${briefs.length > 1 ? "s" : ""} brief${briefs.length > 1 ? "s" : ""}) ══\n${lines.join("\n\n")}\n\nUTILISATION OBLIGATOIRE de cet historique :
- ÉVITE de poser des questions déjà couvertes par ces briefs (même angle, même type d'anecdote demandée).
- Si le sujet actuel résonne avec un brief passé, tu PEUX y faire écho discrètement dans une question (ex : "La dernière fois tu parlais de X, là c'est différent : qu'est-ce qui change ?").
- L'objectif : éviter la sensation de répétition après plusieurs créations.\n`;
    // Cap dur à 3800 chars pour rester sous la limite Zod (4000) côté creative-flow
    const MAX = 3800;
    if (result.length > MAX) {
      result = result.slice(0, MAX - 20) + "\n... (tronqué)\n";
    }
    return result;
  } catch (e) {
    console.error("[getRecentBriefsContext] error:", e);
    return "";
  }
}
