import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceFilter } from "./use-workspace-query";

/**
 * Réinitialise COMPLÈTEMENT le branding du workspace actif : efface toutes les
 * tables d'identité de marque (storytelling, persona, proposition, ton/voix,
 * stratégie, charte, offres, audits, coaching, voice profile, mirror) puis
 * remet l'autofill à zéro.
 *
 * Passe par l'edge `reset-onboarding` (mode brandingOnly, service role) : les
 * policies DELETE de branding_coaching_sessions / branding_mirror_results sont
 * scopées `auth.uid() = user_id`, donc un DELETE côté client par un·e manager
 * sur l'espace d'une cliente laissait silencieusement les lignes écrites par
 * la cliente (0 ligne matchée). L'edge vérifie le membership et supprime par
 * workspace_id. On ne touche PAS à l'onboarding.
 */

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

    // SÉCURITÉ : ne JAMAIS supprimer par `user_id`. `useWorkspaceFilter` bascule
    // sur `column: "user_id"` quand l'espace actif n'est pas encore chargé ; un
    // DELETE par user_id effacerait le branding de TOUS les espaces sous ce
    // user_id (dont ceux des clientes gérées par un compte agence — les policies
    // RLS l'autorisent car ce sont ses lignes). On exige un espace actif scopé.
    if (column !== "workspace_id") {
      return {
        ok: false,
        errors: ["Espace actif introuvable — réinitialisation annulée par sécurité. Recharge la page puis réessaie."],
      };
    }

    setIsResetting(true);
    const errors: string[] = [];
    try {
      const { data, error } = await invokeWithTimeout(
        "reset-onboarding",
        { body: { workspaceId: value, brandingOnly: true } },
        30000,
      );
      if (error || !data?.success) {
        errors.push(error?.message || (data?.errors || ["Réinitialisation incomplète."]).join(" ; "));
      }

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
