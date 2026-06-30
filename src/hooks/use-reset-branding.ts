import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "./use-workspace-query";

/**
 * Réinitialise COMPLÈTEMENT le branding du workspace actif : efface toutes les
 * tables d'identité de marque (storytelling, persona, proposition, ton/voix,
 * stratégie, charte, offres, audits, coaching, voice profile, mirror) puis
 * remet l'autofill à zéro.
 *
 * 100% côté client : le filtre `workspace_id` (ou `user_id` en fallback) passe
 * par les policies RLS `workspace_delete_*` / `auth.uid() = user_id`. Chaque
 * table est traitée indépendamment et les erreurs sont remontées telles quelles
 * (pas de faux succès silencieux). On ne touche PAS à l'onboarding.
 */

// Tables supprimées (toutes ont une policy DELETE par workspace_id ou user_id).
const BRANDING_TABLES = [
  "storytelling",
  "persona",
  "brand_proposition",
  "brand_profile",
  "brand_strategy",
  "brand_charter",
  "offers",
  "branding_audits",
  "branding_coaching_sessions",
  "voice_profile",
  "branding_mirror_results",
] as const;

// Clés react-query à invalider pour que /branding se rafraîchisse vide.
const BRANDING_QUERY_KEYS = [
  "branding-data",
  "branding-completion",
  "brand-profile",
  "brand-proposition",
  "brand-strategy",
  "brand-charter",
  "persona",
  "storytelling-list",
  "storytelling-primary",
  "editorial-line",
  "offers",
  "profile",
];

// Caches localStorage liés au branding/import à purger.
function clearBrandingLocalStorage() {
  try {
    localStorage.removeItem("branding_skip_import");
    localStorage.removeItem("lac_branding_cache_refreshed");
    localStorage.removeItem("lac_onboarding_branding");
    // Clés scopées par workspace : `branding_skip_import_<id>`, etc.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith("branding_skip_import_")) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // localStorage indisponible (mode privé strict) — non bloquant.
  }
}

export function useResetBranding() {
  const { column, value } = useWorkspaceFilter();
  const queryClient = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);

  const resetBranding = useCallback(async (): Promise<{ ok: boolean; errors: string[] }> => {
    if (!value) return { ok: false, errors: ["Aucun espace de travail actif."] };

    setIsResetting(true);
    const errors: string[] = [];
    try {
      for (const table of BRANDING_TABLES) {
        const { error } = await (supabase.from(table as any) as any)
          .delete()
          .eq(column, value);
        if (error) errors.push(`${table}: ${error.message}`);
      }

      // branding_autofill n'a pas de policy DELETE → on remet son statut à zéro.
      const { error: autofillError } = await (supabase.from("branding_autofill" as any) as any)
        .update({ autofill_status: "idle", autofill_pending_review: false })
        .eq(column, value);
      if (autofillError) errors.push(`branding_autofill: ${autofillError.message}`);

      clearBrandingLocalStorage();

      await Promise.all(
        BRANDING_QUERY_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] }))
      );

      return { ok: errors.length === 0, errors };
    } finally {
      setIsResetting(false);
    }
  }, [column, value, queryClient]);

  return { resetBranding, isResetting };
}
