import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brandWantsInclusiveWriting } from "@/lib/inclusive-writing";

/**
 * La fiche de marque demande-t-elle l'écriture inclusive ? (choix du 13/11/2026)
 * Lecture légère des seuls champs de ton et de voix, dans le même espace que la
 * sauvegarde du contenu. En cas d'échec : « non », la question n'est pas posée.
 */
export function useBrandWantsInclusiveWriting(userId: string | undefined, workspaceId: string | undefined): boolean {
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    if (!userId || !workspaceId) { setWanted(false); return; }
    let active = true;
    (async () => {
      try {
        const query = (supabase.from("brand_profile") as any)
          .select("tone_description,tone_style,tone_register,tone_do,tone_dont,voice_description,key_expressions,things_to_avoid,tone_keywords");
        const { data } = await (workspaceId !== userId ? query.eq("workspace_id", workspaceId) : query.eq("user_id", userId)).maybeSingle();
        if (active) setWanted(brandWantsInclusiveWriting(data));
      } catch { if (active) setWanted(false); }
    })();
    return () => { active = false; };
  }, [userId, workspaceId]);
  return wanted;
}
