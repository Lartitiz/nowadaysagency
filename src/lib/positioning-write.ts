import { supabase } from "@/integrations/supabase/client";

/**
 * Écrit une valeur de « positionnement / proposition de valeur » dans la
 * SOURCE DE VÉRITÉ UNIQUE : brand_proposition.version_final — le seul champ
 * lu par la génération (user-context.ts) ET par le Coach (chat-guide).
 * brand_profile.positioning n'est lu par aucune IA et ne doit plus être écrit
 * (cf. PR #207 « brand_proposition = source de vérité unique »).
 *
 * Sémantique « pré-remplissage » : n'écrase PAS une version_final déjà remplie.
 * Crée la ligne brand_proposition si elle n'existe pas encore.
 *
 * @param filterCol  "workspace_id" en mode workspace, sinon "user_id"
 * @param filterVal  l'id correspondant
 * @param ownerUserId user_id du propriétaire (pour l'insert d'une ligne neuve)
 * @param value      la valeur de positionnement détectée
 */
export async function applyPositioningToProposition(
  filterCol: string,
  filterVal: string,
  ownerUserId: string,
  value: string,
): Promise<void> {
  if (!value?.trim()) return;

  const { data: existing } = await (supabase.from("brand_proposition") as any)
    .select("id, version_final")
    .eq(filterCol, filterVal)
    .maybeSingle();

  if (existing) {
    const cur = existing.version_final;
    const isEmpty = cur === null || cur === undefined || (typeof cur === "string" && cur.trim() === "");
    if (isEmpty) {
      await (supabase.from("brand_proposition") as any)
        .update({ version_final: value })
        .eq("id", existing.id);
    }
  } else {
    await (supabase.from("brand_proposition") as any).insert({
      user_id: ownerUserId,
      workspace_id: filterCol === "workspace_id" ? filterVal : null,
      version_final: value,
    });
  }
}
