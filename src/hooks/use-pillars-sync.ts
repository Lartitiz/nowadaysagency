import { useMemo, useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useBrandStrategy, useEditorialLine } from "@/hooks/use-branding";
import { useWorkspaceId } from "@/hooks/use-workspace-query";

export interface EditoPillar {
  name: string;
  description?: string;
  percentage?: number;
  is_major?: boolean;
}

export interface PillarsSyncDiff {
  renamed: { old: string; new: string; index: number }[];
  added: string[];
  removed: string[];
}

export interface PillarsSyncResult {
  isOutOfSync: boolean;
  isDismissed: boolean;
  brandingPillars: string[];
  editoPillars: EditoPillar[];
  diffs: PillarsSyncDiff;
  resync: (mode: "rename_only" | "full_replace") => Promise<void>;
  dismiss: () => void;
  loading: boolean;
}

const DEFAULT_PERCENTAGES = [40, 25, 20, 15];

function hashStrings(items: string[]): string {
  // Lightweight stable hash for dismiss key
  return items.join("§").toLowerCase();
}

function buildBrandingPillars(strategy: any): string[] {
  if (!strategy) return [];
  const arr = [
    strategy.pillar_major,
    strategy.pillar_minor_1,
    strategy.pillar_minor_2,
    strategy.pillar_minor_3,
  ].map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean);
  return arr;
}

function computeDiff(branding: string[], edito: EditoPillar[]): PillarsSyncDiff {
  const renamed: PillarsSyncDiff["renamed"] = [];
  const added: string[] = [];
  const removed: string[] = [];

  const minLen = Math.min(branding.length, edito.length);
  for (let i = 0; i < minLen; i++) {
    const b = branding[i].trim();
    const e = (edito[i]?.name || "").trim();
    if (b !== e) renamed.push({ old: e, new: b, index: i });
  }
  if (branding.length > edito.length) {
    added.push(...branding.slice(edito.length));
  }
  if (edito.length > branding.length) {
    removed.push(...edito.slice(branding.length).map((p) => p.name).filter(Boolean));
  }
  return { renamed, added, removed };
}

export function usePillarsSync(): PillarsSyncResult {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  const { data: strategy, isLoading: strategyLoading } = useBrandStrategy();
  const { data: edito, isLoading: editoLoading } = useEditorialLine();

  const brandingPillars = useMemo(() => buildBrandingPillars(strategy), [strategy]);
  const editoPillars: EditoPillar[] = useMemo(() => {
    const raw = (edito as any)?.pillars;
    return Array.isArray(raw) ? raw : [];
  }, [edito]);

  const diffs = useMemo(
    () => computeDiff(brandingPillars, editoPillars),
    [brandingPillars, editoPillars]
  );

  // Only flag out-of-sync when both sides have data; if Edito has no pillars yet, do nothing.
  const isOutOfSync =
    !strategyLoading &&
    !editoLoading &&
    brandingPillars.length > 0 &&
    editoPillars.length > 0 &&
    (diffs.renamed.length > 0 || diffs.added.length > 0 || diffs.removed.length > 0);

  const dismissKey = useMemo(
    () => `pillars_sync_dismissed_${workspaceId || "self"}_${hashStrings(brandingPillars)}`,
    [workspaceId, brandingPillars]
  );

  const [isDismissed, setIsDismissed] = useState(false);
  useEffect(() => {
    try {
      setIsDismissed(localStorage.getItem(dismissKey) === "1");
    } catch {
      setIsDismissed(false);
    }
  }, [dismissKey]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(dismissKey, "1");
    } catch {/* ignore */}
    setIsDismissed(true);
  }, [dismissKey]);

  const resync = useCallback(
    async (mode: "rename_only" | "full_replace") => {
      const editoId = (edito as any)?.id;
      if (!editoId) return;

      let newPillars: EditoPillar[];
      if (mode === "rename_only") {
        // Replace names by position, preserve other fields. Add new ones with defaults. Remove extras.
        newPillars = brandingPillars.map((name, i) => {
          const existing = editoPillars[i];
          if (existing) {
            return { ...existing, name };
          }
          return {
            name,
            description: "",
            percentage: DEFAULT_PERCENTAGES[i] ?? 0,
            is_major: i === 0,
          };
        });
      } else {
        // full_replace: regenerate from scratch with default percentages
        newPillars = brandingPillars.map((name, i) => ({
          name,
          description: "",
          percentage: DEFAULT_PERCENTAGES[i] ?? 0,
          is_major: i === 0,
        }));
      }

      await (supabase.from("instagram_editorial_line") as any)
        .update({ pillars: newPillars })
        .eq("id", editoId);

      // Clear dismiss flag for this hash since data is now in sync (key includes branding hash)
      try { localStorage.removeItem(dismissKey); } catch {/* ignore */}

      await queryClient.invalidateQueries({ queryKey: ["editorial-line"] });
    },
    [brandingPillars, editoPillars, edito, queryClient, dismissKey]
  );

  return {
    isOutOfSync,
    isDismissed,
    brandingPillars,
    editoPillars,
    diffs,
    resync,
    dismiss,
    loading: strategyLoading || editoLoading,
  };
}
