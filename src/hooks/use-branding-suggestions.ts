import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { toast } from "sonner";
import type { Suggestion } from "@/components/branding/BrandingSuggestionsCard";

const STRUCTURAL_FIELDS = [
  "positioning", "mission", "values", "tone_keywords",
  "value_prop_sentence", "content_pillars", "voice_description",
  "combat_cause", "combat_fights", "pillar_major", "creative_concept",
  "version_final", "version_one_liner", "step_1_frustrations",
  "step_2_transformation", "offer",
];

const DEMO_SUGGESTIONS: Suggestion[] = [
  {
    section: "instagram_bio",
    icon: "📱",
    title: "Ta bio Instagram",
    reason: "Ne reflète pas ton nouveau positionnement",
    current_value: "Photographe portrait · Studio Lyon",
    suggested_value: "Photographe portrait & personal branding · Studio Lyon · Je capture ta confiance ✨",
    link: "/instagram/profil/bio",
    impact: "fort",
  },
  {
    section: "value_proposition",
    icon: "❤️",
    title: "Ta proposition de valeur",
    reason: "Pourrait intégrer ton nouveau positionnement",
    current_value: "Je capture la confiance.",
    suggested_value: "Je capture la confiance et l'identité de marque des entrepreneures.",
    link: "/branding?section=value_proposition",
    impact: "fort",
  },
  {
    section: "content_pillars",
    icon: "🍒",
    title: "Tes piliers de contenu",
    reason: "Pas de pilier lié au personal branding",
    suggested_value: "Ajouter 'Personal branding authentique' comme pilier mineur",
    link: "/branding?section=content_strategy",
    impact: "moyen",
  },
];

export function useBrandingSuggestions(workspaceId?: string) {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionId, setSuggestionId] = useState<string>();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Load pending suggestions from database on mount
  useEffect(() => {
    if (isDemoMode || !user) return;
    const loadPending = async () => {
      const filterCol = workspaceId ? "workspace_id" : "user_id";
      const filterVal = workspaceId || user.id;
      const { data } = await (supabase.from("branding_suggestions") as any)
        .select("id, suggestions")
        .eq(filterCol, filterVal)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setSuggestions(data.suggestions as Suggestion[]);
        setSuggestionId(data.id);
        setShowSuggestions(true);
      }
    };
    loadPending();
  }, [user?.id, isDemoMode, workspaceId]);

  const checkImpact = useCallback(async (field: string, oldValue: string | null, newValue: string) => {
    // Skip non-structural fields or first-time filling
    if (!STRUCTURAL_FIELDS.includes(field) || !oldValue || oldValue === newValue) return;

    if (isDemoMode) {
      setSuggestions(DEMO_SUGGESTIONS);
      setShowSuggestions(true);
      toast("💡 Ce changement impacte 3 autres sections", {
        action: { label: "Voir", onClick: () => setShowSuggestions(true) },
        duration: 6000,
      });
      return;
    }

    if (!user) return;
    setIsAnalyzing(true);

    try {
      const { data, error } = await invokeWithTimeout("analyze-branding-impact", {
        body: { changed_field: field, old_value: oldValue, new_value: newValue, workspace_id: workspaceId },
      }, 90000);

      if (error) throw new Error(error.message);

      if (data?.suggestions?.length > 0) {
        setSuggestions(data.suggestions);
        setSuggestionId(data.suggestionId);
        setShowSuggestions(true);
        toast(`💡 Ce changement impacte ${data.suggestions.length} autre${data.suggestions.length > 1 ? "s" : ""} section${data.suggestions.length > 1 ? "s" : ""}`, {
          action: { label: "Voir", onClick: () => setShowSuggestions(true) },
          duration: 6000,
        });
      } else {
        toast("✅ Tout est cohérent, aucune mise à jour nécessaire.", { duration: 3000 });
      }
    } catch (e) {
      console.error("Impact analysis failed:", e);
    }
    setIsAnalyzing(false);
  }, [user, isDemoMode, workspaceId]);

  const dismissSuggestions = useCallback(() => {
    setShowSuggestions(false);
  }, []);

  return {
    suggestions,
    suggestionId,
    showSuggestions,
    isAnalyzing,
    checkImpact,
    dismissSuggestions,
    setShowSuggestions,
  };
}
