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
export async function loadImportLinks(column: string, value: string): Promise<ImportLinks> {
  try {
    const scoped = (table: string, fields: string) => {
      let q = (supabase.from(table as any) as any).select(fields).eq(column, value);
      if (column === "user_id" && table !== "profiles") q = q.is("workspace_id", null);
      return q;
    };
    const [autofill, profile] = await Promise.all([
      scoped("branding_autofill", "website_url, instagram_handle, linkedin_url").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      scoped("profiles", "website_url, instagram_url, instagram_username, linkedin_url").limit(1).maybeSingle(),
    ]);
    const a = autofill.data || {};
    const p = profile.data || {};
    const savedInstagram = cleanInstagramLink(a.instagram_handle);
    const handle = p.instagram_username ? `@${String(p.instagram_username).replace(/^@/, "")}` : "";
    return {
      website: a.website_url || p.website_url || "",
      instagram: savedInstagram || p.instagram_url || handle || "",
      linkedin: a.linkedin_url || p.linkedin_url || "",
    };
  } catch {
    return EMPTY;
  }
}
