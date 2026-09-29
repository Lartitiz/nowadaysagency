import { supabase } from "@/integrations/supabase/client";
import { buildFirstContentUrl } from "@/lib/first-content-url";
import { sellsProducts as profileSellsProducts } from "@/lib/product-or-service";

/* ── Destination « mon premier contenu » ──────────────────────────────────
   Partagé entre la fin d'onboarding (use-onboarding), la sortie de l'écran de
   validation de marque (BrandingPage) et l'écran de bienvenue (WelcomePage).
   Source UNIQUE de la règle : sans ça, chaque écran réinventait sa destination
   et deux d'entre eux envoyaient encore sur un « post ».

   La règle elle-même (carrousel toujours, photo si produits) vit dans
   first-content-url.ts — module pur, verrouillé par des tests.        ── */

export async function resolveFirstContentDestination(params: {
  column: string;
  value: string;
  userId?: string;
}): Promise<string> {
  const { column, value, userId } = params;
  let sujet: string | null = null;
  let sellsProducts = false;
  try {
    const { data } = await (supabase.from("saved_ideas") as any)
      .select("titre, format")
      .eq(column, value)
      .eq("source_module", "diagnostic")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.titre) sujet = data.titre;
  } catch { /* idée perso pas encore prête (enrichment async) → générique */ }

  // Produits / services : réponse donnée à l'étape 2 de l'onboarding,
  // enregistrée séparément du secteur type_activite.
  // Une lecture qui échoue ne doit jamais bloquer la création : on garde le
  // choix local de cette session si la base n'a pas pu le conserver.
  if (userId) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("product_or_service, type_activite")
        .eq("user_id", userId)
        .maybeSingle();
      sellsProducts = profileSellsProducts(profile, userId);
    } catch { sellsProducts = profileSellsProducts(null, userId); }
  }

  localStorage.setItem("lac_welcome_seen", "true");
  if (userId) {
    (supabase.from("user_plan_config") as any)
      .update({ welcome_seen: true })
      .eq("user_id", userId)
      .then(({ error }: any) => { if (error) console.error("welcome_seen update failed:", error); });
  }
  return buildFirstContentUrl({ sellsProducts, subject: sujet });
}
