import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId, useWorkspaceFilter } from "@/hooks/use-workspace-query";

/* ─── Types ─── */
export type CoachingStep = 0 | 1 | 2 | 3 | 4 | 5;

interface ToneOption {
  emoji: string;
  label: string;
  keywords: string[];
}

export const TONE_OPTIONS: ToneOption[] = [
  { emoji: "🔥", label: "Passionnée et directe", keywords: ["passionnée", "directe", "franche", "engagée"] },
  { emoji: "🌸", label: "Douce et inspirante", keywords: ["douce", "inspirante", "poétique", "lumineuse"] },
  { emoji: "💪", label: "Experte et rassurante", keywords: ["experte", "rassurante", "pédagogue", "structurée"] },
  { emoji: "😄", label: "Fun et décomplexée", keywords: ["fun", "décomplexée", "spontanée", "accessible"] },
];

export interface CoachingFlowState {
  isActive: boolean;
  step: CoachingStep;
  completed: boolean;
  shouldActivate: boolean;
}

function lsKey(base: string, wsId: string): string {
  return wsId ? `${base}_${wsId}` : base;
}

function getStoredStep(wsId: string): CoachingStep {
  try {
    const v = parseInt(localStorage.getItem(lsKey("lac_coaching_step", wsId)) || "0", 10);
    return (v >= 0 && v <= 5 ? v : 0) as CoachingStep;
  } catch { return 0; }
}

function isCompleted(wsId: string): boolean {
  try { return localStorage.getItem(lsKey("lac_coaching_completed", wsId)) === "1"; } catch { return false; }
}

function wasStarted(wsId: string): boolean {
  try { return localStorage.getItem(lsKey("lac_coaching_started", wsId)) === "1"; } catch { return false; }
}

/**
 * Determines if the coaching flow should activate:
 * - phase = construction
 * - brandingTotal < 50
 * - not already completed
 */
export function shouldActivateCoaching(
  phase: string,
  brandingTotal: number,
  wsId: string = "",
): boolean {
  if (isCompleted(wsId)) return false;
  return phase === "construction" && brandingTotal < 50;
}

/**
 * Hook managing the post-onboarding coaching flow state and branding saves.
 */
export function useCoachingFlow(phase: string, brandingTotal: number) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const { column, value } = useWorkspaceFilter();

  const shouldActivate = shouldActivateCoaching(phase, brandingTotal, workspaceId);
  const [step, setStepState] = useState<CoachingStep>(() => getStoredStep(workspaceId));
  const [completed, setCompleted] = useState(() => isCompleted(workspaceId));
  const [isActive, setIsActive] = useState(shouldActivate && !isCompleted(workspaceId));
  const initialScoreRef = useRef(brandingTotal);

  // Persist step
  const setStep = useCallback((s: CoachingStep) => {
    setStepState(s);
    try { localStorage.setItem(lsKey("lac_coaching_step", workspaceId), String(s)); } catch {}
  }, [workspaceId]);

  // Mark coaching as started
  const markStarted = useCallback(() => {
    try { localStorage.setItem(lsKey("lac_coaching_started", workspaceId), "1"); } catch {}
  }, [workspaceId]);

  // Mark complete
  const markComplete = useCallback(() => {
    setCompleted(true);
    setIsActive(false);
    try {
      localStorage.setItem(lsKey("lac_coaching_completed", workspaceId), "1");
      localStorage.setItem(lsKey("lac_coaching_step", workspaceId), "5");
    } catch {}
  }, [workspaceId]);

  // Advance to next step
  const advance = useCallback(() => {
    const next = Math.min(step + 1, 5) as CoachingStep;
    setStep(next);
    if (next >= 5) markComplete();
  }, [step, setStep, markComplete]);

  // ─── Save handlers for each step ───

  /** Step 1: Save storytelling */
  const saveStory = useCallback(async (text: string) => {
    if (!user) return;
    // Upsert storytelling
    const { data: existing } = await (supabase.from("storytelling") as any)
      .select("id, story_origin")
      .eq(column, value)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await (supabase.from("storytelling") as any)
        .update({ story_origin: text, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      const row: any = { user_id: user.id, story_origin: text, is_primary: true };
      if (workspaceId && workspaceId !== user.id) row.workspace_id = workspaceId;
      await (supabase.from("storytelling") as any).insert(row);
    }
  }, [user, column, value, workspaceId]);

  /** Step 2: Save persona frustrations/transformation */
  const savePersona = useCallback(async (text: string) => {
    if (!user) return;
    const { data: existing } = await (supabase.from("persona") as any)
      .select("id")
      .eq(column, value)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await (supabase.from("persona") as any)
        .update({
          step_1_frustrations: text,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      const row: any = { user_id: user.id, step_1_frustrations: text };
      if (workspaceId && workspaceId !== user.id) row.workspace_id = workspaceId;
      await (supabase.from("persona") as any).insert(row);
    }
  }, [user, column, value, workspaceId]);

  /** Step 3: Save tone keywords */
  const saveTone = useCallback(async (keywords: string[]) => {
    if (!user) return;
    const { data: existing } = await (supabase.from("brand_profile") as any)
      .select("id")
      .eq(column, value)
      .maybeSingle();

    if (existing?.id) {
      await (supabase.from("brand_profile") as any)
        .update({ tone_keywords: keywords, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      const row: any = { user_id: user.id, tone_keywords: keywords };
      if (workspaceId && workspaceId !== user.id) row.workspace_id = workspaceId;
      await (supabase.from("brand_profile") as any).insert(row);
    }
  }, [user, column, value, workspaceId]);

  /** Step 4: Save main goal */
  const saveGoal = useCallback(async (text: string) => {
    if (!user) return;
    const { data: existing } = await (supabase.from("user_plan_config") as any)
      .select("id")
      .eq(column, value)
      .maybeSingle();

    if (existing?.id) {
      await (supabase.from("user_plan_config") as any)
        .update({ main_goal: text, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      const row: any = { user_id: user.id, main_goal: text };
      if (workspaceId && workspaceId !== user.id) row.workspace_id = workspaceId;
      await (supabase.from("user_plan_config") as any).insert(row);
    }
  }, [user, column, value, workspaceId]);

  /** Process a user answer for the current step */
  const processAnswer = useCallback(async (answer: string): Promise<void> => {
    switch (step) {
      case 1:
        await saveStory(answer);
        break;
      case 2:
        await savePersona(answer);
        break;
      case 3: {
        // Parse tone selection — answer is the label
        const selected = TONE_OPTIONS.find(t => answer.includes(t.label));
        if (selected) {
          await saveTone(selected.keywords);
        } else {
          // Freeform tone — split into keywords
          await saveTone(answer.split(/[,;]+/).map(s => s.trim()).filter(Boolean).slice(0, 4));
        }
        break;
      }
      case 4:
        await saveGoal(answer);
        break;
    }
    advance();
  }, [step, saveStory, savePersona, saveTone, saveGoal, advance]);

  return {
    isActive,
    step,
    completed,
    shouldActivate,
    initialScore: initialScoreRef.current,
    processAnswer,
    advance,
    markStarted,
    markComplete,
    setStep,
    setIsActive,
  };
}
