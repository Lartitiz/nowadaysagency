// Tour de conversation du Studio : contexte de marque envoyé à Claude.
// Lit la charte, le profil, la proposition de valeur, la stratégie, le
// catalogue de photos (récentes + recherche par mots de la demande) et la
// mémoire de la marque, toutes limitées à l'espace actif. Le brandContext
// est figé avec la proposition : une charte modifiée ensuite ne réécrit pas
// l'histoire d'une image déjà créée.
// Déplacé tel quel depuis index.ts (fiche 5, lot 5, docs/robustesse/gros-fichiers.md).
import { searchTerms } from "../competencies.ts";
import { readMemory } from "../memory.ts";
import type { StudioContext } from "../actions/context.ts";

/** `message` : la demande, déjà vérifiée non vide par index.ts. */
export async function loadBrandContext(ctx: StudioContext, message: string) {
  const { sb, p } = ctx;
  // Read only brand fields useful for visual direction, scoped to the active workspace.
  const [charter, profile, proposition, strategy, recentCatalogue] =
    await Promise.all([
      sb
        .from("brand_charter")
        .select(
          "color_primary,color_secondary,color_accent,color_background,color_text,font_title,font_body,photo_style,mood_keywords,visual_donts,moodboard_description,mood_board_urls,visual_direction",
        )
        .eq("workspace_id", p.workspace_id)
        .maybeSingle(),
      sb
        .from("brand_profile")
        .select(
          "mission,offer,target_description,voice_description,things_to_avoid",
        )
        .eq("workspace_id", p.workspace_id)
        .maybeSingle(),
      sb
        .from("brand_proposition")
        .select("version_final,version_one_liner")
        .eq("workspace_id", p.workspace_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb
        .from("brand_strategy")
        .select(
          "creative_concept,pillar_major,pillar_minor_1,pillar_minor_2",
        )
        .eq("workspace_id", p.workspace_id)
        .maybeSingle(),
      sb
        .from("user_photos")
        .select("id,name,kind,description")
        .eq("workspace_id", p.workspace_id)
        .eq("status", "ready")
        .is("removed_from_library_at", null)
        .order("created_at", { ascending: false })
        .limit(60),
    ]);
  for (
    const result of [
      charter,
      profile,
      proposition,
      strategy,
      recentCatalogue,
    ]
  ) {
    if (result.error) throw result.error;
  }
  const memory = await readMemory(sb, p.workspace_id);
  // Keep the exact brand context supplied to the interpreter with the
  // resulting version. Later edits to the charter must not rewrite the
  // history of an image that was already generated.
  const brandContext = {
    captured_at: new Date().toISOString(),
    charter: charter.data,
    identity: profile.data,
    proposition: proposition.data,
    strategy: strategy.data,
    memory: memory.map((item) => ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      note: item.note,
      revision: item.revision,
    })),
  };
  const terms = searchTerms(message);
  let catalogue = recentCatalogue;
  if (terms.length) {
    const matches = await sb.from("user_photos").select(
      "id,name,kind,description",
    )
      .eq("workspace_id", p.workspace_id).eq("status", "ready").is(
        "removed_from_library_at",
        null,
      )
      .or(
        terms.flatMap(
          (t) => [`name.ilike.%${t}%`, `description.ilike.%${t}%`],
        ).join(","),
      )
      .order("created_at", { ascending: false }).limit(40);
    if (matches.error) throw matches.error;
    const seen = new Set<string>();
    catalogue = {
      ...recentCatalogue,
      error: null,
      data: [...(matches.data || []), ...(recentCatalogue.data || [])]
        .filter((row) => {
          if (seen.has(row.id)) return false;
          seen.add(row.id);
          return true;
        }).slice(0, 80),
    };
  }
  return { memory, brandContext, catalogue };
}
