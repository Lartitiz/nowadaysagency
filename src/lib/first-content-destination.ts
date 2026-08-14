import { supabase } from "@/integrations/supabase/client";
import { buildFirstContentUrl } from "@/lib/first-content-url";

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

  // Produits / services : réponse donnée à l'étape 2 de l'onboarding.
  // Une lecture qui échoue ne doit jamais bloquer la création → on retombe
  // sur le carrousel texte, qui marche pour tout le monde.
  if (userId) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("type_activite")
        .eq("user_id", userId)
        .maybeSingle();
      const type = (profile as any)?.type_activite;
      sellsProducts = type === "produits" || type === "les_deux";
    } catch { /* type d'activité illisible → carrousel texte */ }
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
