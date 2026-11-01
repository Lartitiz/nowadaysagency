import { supabase } from "@/integrations/supabase/client";
import { buildFirstContentUrl, chooseFirstContentChannel, pickFirstContentIdea } from "@/lib/first-content-url";
import { sellsProducts as profileSellsProducts } from "@/lib/product-or-service";

/* ── Destination « mon premier contenu » ──────────────────────────────────
   Partagé entre la fin d'onboarding (use-onboarding), la sortie de l'écran de
   validation de marque (BrandingPage) et l'écran de bienvenue (WelcomePage).
   Source UNIQUE de la règle : sans ça, chaque écran réinventait sa destination
   et deux d'entre eux envoyaient encore sur un « post ».

   La règle elle-même (carrousel, photo si produits, canal) vit dans
   first-content-url.ts — module pur, verrouillé par des tests.        ── */

export async function resolveFirstContentDestination(params: {
  column: string;
  value: string;
  userId?: string;
}): Promise<string> {
  const { column, value, userId } = params;
  let ideas: { id: string; titre: string; canal?: string | null }[] = [];
  let canaux: unknown = null;
  let sellsProducts = false;
  try {
    const { data } = await (supabase.from("saved_ideas") as any)
      .select("id, titre, format, canal")
      .eq(column, value)
      .eq("source_module", "diagnostic")
      // Idée encore intacte : une idée déjà commencée ou posée au calendrier
      // n'est pas reproposée (et ne recevrait pas un second carrousel).
      .eq("status", "to_explore")
      .is("calendar_post_id", null)
      .is("content_data", null)
      .order("created_at", { ascending: true })
      .limit(10);
    ideas = (data ?? []).filter((idea: any) => idea?.titre);
  } catch { /* idée perso pas encore prête (enrichment async) → générique */ }

  // Produits / services : réponse donnée à l'étape 2 de l'onboarding,
  // enregistrée séparément du secteur type_activite.
  // Une lecture qui échoue ne doit jamais bloquer la création : on garde le
  // choix local de cette session si la base n'a pas pu le conserver.
  if (userId) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("product_or_service, type_activite, canaux")
        .eq("user_id", userId)
        .maybeSingle();
      sellsProducts = profileSellsProducts(profile, userId);
      canaux = profile?.canaux;
    } catch { sellsProducts = profileSellsProducts(null, userId); }
  }

  localStorage.setItem("lac_welcome_seen", "true");
  if (userId) {
    (supabase.from("user_plan_config") as any)
      .update({ welcome_seen: true })
      .eq("user_id", userId)
      .then(({ error }: any) => { if (error) console.error("welcome_seen update failed:", error); });
  }
  const channel = chooseFirstContentChannel(canaux, ideas[0]?.canal);
  const idea = pickFirstContentIdea(ideas, channel);
  return buildFirstContentUrl({ sellsProducts, subject: idea?.titre, ideaId: idea?.id, channel });
}
