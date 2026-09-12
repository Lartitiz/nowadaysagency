import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate, Json } from "@/integrations/supabase/types";

export function objectionsText(value: unknown): string {
  return Array.isArray(value) ? value.map(o => typeof o === "string" ? o : o?.objection || "").join("\n") : typeof value === "string" ? value : "";
}

/** Preserve legacy representations and every structured property unless the text was edited. */
export function reconcileObjections(text: string, previous: unknown): Json {
  if (text === objectionsText(previous)) return (previous ?? []) as Json;
  const available = Array.isArray(previous) ? [...previous] : [];
  return text.split("\n").filter(o => o.trim()).map(objection => {
    const index = available.findIndex(o => (typeof o === "string" ? o : o?.objection) === objection);
    return index < 0 ? { objection, response: "" } : available.splice(index, 1)[0];
  });
}

const OFFER_FIELDS = {
  offer_name: "name", offer_price: "price_text", offer_target: "target_ideal",
  offer_promise: "promise", offer_includes: "features",
  name: "name", description: "description_short", description_short: "description_short", benefits: "benefits",
} as const;

export function mapOfferInsights(insights: Record<string, unknown>): TablesUpdate<"offers"> {
  const result: Record<string, Json> = {};
  for (const [key, value] of Object.entries(insights)) {
    const field = OFFER_FIELDS[key as keyof typeof OFFER_FIELDS];
    if (!field || value === undefined) throw new Error(`Champ d'offre non reconnu : ${key}`);
    if (typeof value !== "string" && !((field === "features" || field === "benefits") && Array.isArray(value))) {
      throw new Error(`Valeur d'offre invalide : ${key}`);
    }
    if (field in result && result[field] !== value) throw new Error(`Propositions contradictoires : ${field}`);
    // These are list columns consumed by the workshop. Keep each line verbatim;
    // do not infer bullets or split prose on punctuation.
    result[field] = (field === "features" || field === "benefits") && typeof value === "string"
      ? value.split("\n").filter(line => line.trim()) : value as Json;
  }
  return result;
}

export async function saveOfferInsights(insights: Record<string, unknown>, ctx: { column: string; value: string }, offerId?: string) {
  if (!offerId) throw new Error("Choisis l'offre à modifier.");
  const updates = mapOfferInsights(insights);
  const { data, error } = await supabase.from("offers").select("id").eq("id", offerId).eq(ctx.column as "workspace_id" | "user_id", ctx.value).single();
  if (error) throw error;
  if (!data) throw new Error("Offre introuvable dans cet espace.");
  const { error: writeError } = await supabase.from("offers").update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", offerId).eq(ctx.column as "workspace_id" | "user_id", ctx.value).select("id").single();
  if (writeError) throw writeError;
}
