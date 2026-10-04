/**
 * Tu ou vous : comment la marque s'adresse à son public (décision de Laetitia,
 * 04/10/2026). Stocké dans brand_profile.tone_register. Même lecture que
 * supabase/functions/_shared/audience-address.ts (parseAudienceAddress) : les
 * générateurs en font une règle ferme et la contrôlent après rédaction.
 */
export type AudienceAddress = "tu" | "vous";

/** Valeurs écrites par l'écran (lues aussi par l'analyse de marque). */
export const AUDIENCE_ADDRESS_VALUES: Record<AudienceAddress, string> = { tu: "tutoiement", vous: "vouvoiement" };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** « tutoiement », « Vous », « je vouvoie »… ; « tu/vous », « familier » ou vide → null. */
export function parseAudienceAddress(raw: unknown): AudienceAddress | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = fold(raw);
  const vous = /vouvoi|vouvoy|(^|[^a-z])vous([^a-z]|$)/.test(s);
  const tu = /tutoi|tutoy|(^|[^a-z])tu([^a-z]|$)/.test(s);
  if (vous === tu) return null;
  return vous ? "vous" : "tu";
}

/**
 * Nouvelle valeur de tone_register pour un choix, en gardant ce que l'ancien
 * texte libre disait d'autre (« premium », « punchy » servent encore au
 * visuel, cf. _shared/pptx-invariants.ts). Seuls les morceaux qui parlent de
 * tu/vous sont remplacés.
 */
export function withAudienceAddress(raw: string | null | undefined, choice: AudienceAddress | null): string {
  const rest = (raw || "")
    .split(/\s*[·,;|/]\s*/)
    .map((part) => part.trim())
    .filter((part) => part && !/tutoi|tutoy|vouvoi|vouvoy/i.test(part) && !/^(tu|vous)$/i.test(part));
  return [choice ? AUDIENCE_ADDRESS_VALUES[choice] : "", ...rest].filter(Boolean).join(" · ");
}
