import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchBrandingData,
  calculateBrandingCompletion,
  type BrandingCompletion,
} from "@/lib/branding-completion";
import { DEMO_DATA } from "@/lib/demo-data";

export type BrandingView = "loading" | "import" | "review" | "identity";

export interface BrandingState {
  view: BrandingView;
  completion: BrandingCompletion;
  filledSections: number;
  autofillStatus: "none" | "pending_review" | "completed";
  pendingAutofill: any | null;
  preFilledSections: Set<string>;
  loading: boolean;
  reloadCompletion: () => Promise<void>;
  transitionTo: (view: BrandingView) => void;
}

const EMPTY_COMPLETION: BrandingCompletion = {
  storytelling: 0, persona: 0, proposition: 0, tone: 0, strategy: 0, charter: 0, total: 0,
};

export function useBrandingState(): BrandingState {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();

  const [completion, setCompletion] = useState<BrandingCompletion>(EMPTY_COMPLETION);
  const [autofillStatus, setAutofillStatus] = useState<"none" | "pending_review" | "completed">("none");
  const [pendingAutofill, setPendingAutofill] = useState<any>(null);
  const [preFilledSections, setPreFilledSections] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [manualView, setManualView] = useState<BrandingView | null>(null);

  const reloadCompletion = useCallback(async () => {
    if (!user && !isDemoMode) return;
    const data = await fetchBrandingData({ column, value });
    const comp = calculateBrandingCompletion(data);
    setCompletion(comp);

    const filled = new Set<string>();
    if (comp.storytelling > 0) filled.add("story");
    if (comp.persona > 0) filled.add("persona");
    if (comp.proposition > 0) filled.add("value_proposition");
    if (comp.tone > 0) filled.add("tone_style");
    if (comp.strategy > 0) filled.add("content_strategy");
    setPreFilledSections(filled);
  }, [user, isDemoMode, column, value]);

  useEffect(() => {
    if (isDemoMode) {
      setCompletion({
        storytelling: 100, persona: 100, proposition: 100,
        tone: 80, strategy: 70, charter: 0, total: DEMO_DATA.branding.completion,
      });
      setAutofillStatus("none");
      setLoading(false);
      return;
    }
    if (!user) return;

    const load = async () => {
      const data = await fetchBrandingData({ column, value });
      const comp = calculateBrandingCompletion(data);
      setCompletion(comp);

      // Detect pre-filled sections
      const filled = new Set<string>();
      if (comp.storytelling > 0) filled.add("story");
      if (comp.persona > 0) filled.add("persona");
      if (comp.proposition > 0) filled.add("value_proposition");
      if (comp.tone > 0) filled.add("tone_style");
      if (comp.strategy > 0) filled.add("content_strategy");
      setPreFilledSections(filled);

      // Check autofill status
      const { data: af } = await (supabase.from("branding_autofill") as any)
        .select("analysis_result, sources_used, sources_failed, website_url, instagram_handle, linkedin_url, autofill_status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (af?.autofill_status === "pending_review" && af.analysis_result) {
        setAutofillStatus("pending_review");
        setPendingAutofill(af);
      } else if (af?.autofill_status === "completed") {
        setAutofillStatus("completed");
      }

      setLoading(false);
    };
    load();
  }, [user?.id, isDemoMode, column, value]);

  // Compute the derived view
  const filledSections = (["storytelling", "persona", "proposition", "tone", "strategy", "charter"] as const)
    .filter((k) => completion[k] > 0).length;

  let derivedView: BrandingView;
  if (loading) {
    derivedView = "loading";
  } else if (autofillStatus === "pending_review") {
    derivedView = "review";
  } else if (filledSections >= 2 || autofillStatus === "completed") {
    derivedView = "identity";
  } else {
    // Check if user has skipped import
    const skipped = (() => {
      try { return localStorage.getItem("branding_skip_import") === "true"; } catch { return false; }
    })();
    derivedView = skipped ? "identity" : "import";
  }

  const view = manualView ?? derivedView;

  const transitionTo = useCallback((v: BrandingView) => {
    setManualView(v);
  }, []);

  return {
    view,
    completion,
    filledSections,
    autofillStatus,
    pendingAutofill,
    preFilledSections,
    loading,
    reloadCompletion,
    transitionTo,
  };
}
