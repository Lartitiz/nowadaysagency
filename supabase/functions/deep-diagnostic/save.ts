// Enregistrement du diagnostic et de ses priorités (fiche 12, lot 5 : sorti
// d'index.ts à l'identique). Le crédit (usageLog) est ajouté à `fastSaves`
// DANS le handler, puis un seul Promise.allSettled.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

export async function saveDiagnostic(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: SupabaseClient<any, any, any, any, any>,
  { userId, workspaceId, analysisResult, sourcesUsed, sourcesFailed }: {
    userId: string;
    workspaceId: string | null;
    analysisResult: Record<string, unknown>;
    sourcesUsed: string[];
    sourcesFailed: string[];
  },
): Promise<{ savedDiagId: string | undefined; fastSaves: Promise<unknown>[] }> {
  // Non bloquant : le diagnostic vient d'être généré avec succès — un échec
  // de sauvegarde ne doit pas priver l'utilisatrice du résultat déjà obtenu
  // (savedDiag?.id reste undefined, la réponse est renvoyée quand même).
  const { data: savedDiag, error: diagInsertError } = await supabaseAdmin
    .from("diagnostic_results")
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      summary: (analysisResult as any).summary || null,
      strengths: (analysisResult as any).strengths || null,
      weaknesses: (analysisResult as any).weaknesses || null,
      scores: (analysisResult as any).scores || null,
      priorities: (analysisResult as any).priorities || null,
      branding_prefill: null, // sera rempli par phase 2
      sources_used: sourcesUsed,
      sources_failed: sourcesFailed,
      raw_analysis: analysisResult,
    })
    .select("id")
    .single();
  if (diagInsertError) console.error("deep-diagnostic: échec sauvegarde (non bloquant):", diagInsertError);

  // audit_recommendations + logUsage en parallèle
  const priorities = (analysisResult as any).priorities;
  const fastSaves: Promise<any>[] = [];

  if (priorities?.length > 0) {
    fastSaves.push(
      Promise.resolve(
        supabaseAdmin.from("audit_recommendations").insert(
          priorities.map((p: any, i: number) => ({
            user_id: userId, workspace_id: workspaceId,
            label: p.title, titre: p.title, module: "diagnostic",
            route: p.route || "/dashboard", detail: [p.why, p.first_step, p.example].filter(Boolean).join("\n") || null,
            temps_estime: p.time || null, priorite: p.impact || "medium",
            position: i + 1, completed: false,
          }))
        ).then(({ error }) => { if (error) console.error("Save recommendations failed:", error); })
      ).catch((e: unknown) => console.error("Save recommendations failed:", e))
    );
  }

  return { savedDiagId: savedDiag?.id, fastSaves };
}
