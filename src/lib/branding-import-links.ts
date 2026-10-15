import { supabase } from "@/integrations/supabase/client";

export interface ImportLinks {
  website: string;
  instagram: string;
  linkedin: string;
}

/** handleReanalyzeWithBio colle « [BIO: …] » au compte Instagram : jamais à afficher. */
export function cleanInstagramLink(value?: string | null): string {
  return String(value || "").replace(/\s*\[BIO:[\s\S]*$/, "").trim();
}

const EMPTY: ImportLinks = { website: "", instagram: "", linkedin: "" };

/**
 * Liens proposés d'office dans « Remplir mon identité à partir de mes liens » :
 * ceux du dernier import de cet espace, sinon ceux du profil (saisis à
 * l'inscription ou dans Mon profil). La personne n'a pas à les retaper.
 * Lecture seule ; en cas d'erreur, champs vides (l'import reste utilisable).
 */
export async function loadImportLinks(
  column: string,
  value: string,
  profile: { column: string; value: string },
): Promise<ImportLinks> {
  try {
    let autofillQuery = (supabase.from("branding_autofill") as any)
      .select("website_url, instagram_handle, linkedin_url").eq(column, value);
    if (column === "user_id") autofillQuery = autofillQuery.is("workspace_id", null);
    // Le profil a son propre filtre (propriétaire de l'espace) : filtrer
    // profiles par workspace_id ne trouvait rien (vu en réel le 15/10/2026).
    const [autofill, prof] = await Promise.all([
      autofillQuery.order("created_at", { ascending: false }).limit(5),
      profile.value
        ? (supabase.from("profiles") as any).select("website_url, instagram_url, instagram_username, linkedin_url").eq(profile.column, profile.value).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    // Dernier lien NON VIDE des imports récents : un import fait avec un
    // document seul laisse des liens vides qui masquaient les précédents.
    const rows: any[] = Array.isArray(autofill.data) ? autofill.data : [];
    const latest = (pick: (r: any) => string) => rows.map(pick).find(Boolean) || "";
    const p = prof.data || {};
    const handle = p.instagram_username ? `@${String(p.instagram_username).replace(/^@/, "")}` : "";
    return {
      website: latest(r => r.website_url) || p.website_url || "",
      instagram: latest(r => cleanInstagramLink(r.instagram_handle)) || p.instagram_url || handle || "",
      linkedin: latest(r => r.linkedin_url) || p.linkedin_url || "",
    };
  } catch {
    return EMPTY;
  }
}
