import { supabase } from "@/integrations/supabase/client";

/* ── Destination « Générer mon premier contenu » ──────────────────────────
   Partagé entre la fin d'onboarding (use-onboarding) et la sortie de l'écran
   de validation de marque (BrandingPage, après onDone de BrandingReview).
   On réutilise la 1re idée perso du diagnostic si elle est déjà prête
   (enrichment async → sinon sujet générique), et on pose welcome_seen pour
   que le login suivant ne renvoie pas de force sur /welcome (AuthContext). ── */

export async function resolveFirstContentDestination(params: {
  column: string;
  value: string;
  userId?: string;
}): Promise<string> {
  const { column, value, userId } = params;
  let sujet = "3 erreurs fréquentes dans mon domaine (et comment les éviter)";
  let format = "post";
  try {
    const { data } = await (supabase.from("saved_ideas") as any)
      .select("titre, format")
      .eq(column, value)
      .eq("source_module", "diagnostic")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.titre) {
      sujet = data.titre;
      format = data.format === "carousel" ? "carousel" : "post";
    }
  } catch { /* idée perso pas encore prête (enrichment async) → générique */ }
  localStorage.setItem("lac_welcome_seen", "true");
  if (userId) {
    (supabase.from("user_plan_config") as any)
      .update({ welcome_seen: true })
      .eq("user_id", userId)
      .then(({ error }: any) => { if (error) console.error("welcome_seen update failed:", error); });
  }
  return `/creer?sujet=${encodeURIComponent(sujet)}&format=${format}&auto=1`;
}
