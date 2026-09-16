import { supabase } from "@/integrations/supabase/client";
import type { BrandingRawData } from "@/lib/branding-completion";

type IdentityRow = Record<string, any>;
export interface IdentityOverview extends BrandingRawData {
  publics: IdentityRow[];
}

/** Overview only: lists stay lists; no arbitrary public or story becomes a write target. */
export async function loadIdentityOverview(column: string, value: string): Promise<IdentityOverview> {
  if (!value) throw new Error("Espace indisponible");
  const read = async (table: string) => {
    let query = (supabase.from(table as any) as any).select("*").eq(column, value);
    if (column === "user_id") query = query.is("workspace_id", null);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as IdentityRow[];
  };
  const [stories, publics, propositions, profiles, strategies, offers, charters] = await Promise.all(
    ["storytelling", "persona", "brand_proposition", "brand_profile", "brand_strategy", "offers", "brand_charter"].map(read),
  );
  const single = (rows: IdentityRow[]) => {
    if (rows.length > 1) throw new Error("Plusieurs fiches de référence existent");
    return rows[0] || null;
  };
  return {
    storytellingList: stories, publics, persona: referencePublic(publics),
    proposition: single(propositions), brandProfile: single(profiles),
    // Historical strategy versions are already ordered by updated_at in the existing overview.
    strategy: [...strategies].sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))[0] || null,
    offersList: offers, charter: single(charters),
  };
}

export function referencePublic(publics: IdentityRow[]): IdentityRow | null {
  if (publics.length === 1) return publics[0];
  const primary = publics.filter(p => p.is_primary === true);
  return primary.length === 1 ? primary[0] : null;
}

export function identityPresentation(data: IdentityOverview) {
  const p = data.proposition;
  const audience = referencePublic(data.publics);
  const recap = p?.recap_summary;
  return {
    activity: p?.version_final || p?.version_complete || p?.version_pitch_naturel || p?.version_bio || p?.version_short || p?.step_1_what || "",
    audience: audience?.description || audience?.pitch_short || p?.step_3_for_whom || data.brandProfile?.target_description || "",
    difference: typeof recap?.differentiator === "string" ? recap.differentiator : p?.step_2a_process || p?.step_2b_values || "",
    needsPublicChoice: data.publics.length > 1 && !audience,
  };
}
