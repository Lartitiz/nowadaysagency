import { useState, useEffect } from "react";
import { toLocalDateStr } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Pencil, X } from "lucide-react";

interface DayMix {
  day: string;
  emoji: string;
  label: string;
  objective: string;
}

const CRUISE_MIX: DayMix[] = [
  { day: "Lun", emoji: "💛", label: "Connexion (journal de bord + sondage)", objective: "connexion" },
  { day: "Mar", emoji: "📚", label: "Éducation (problème→solution)", objective: "education" },
  { day: "Mer", emoji: "📣", label: "Amplification (repartage du post feed)", objective: "amplification" },
  { day: "Jeu", emoji: "💬", label: "Engagement + 💰 mention douce offre", objective: "engagement" },
  { day: "Ven", emoji: "💛", label: "Connexion (storytime ou build in public)", objective: "connexion" },
];

const LAUNCH_MIX: DayMix[] = [
  { day: "Lun", emoji: "💛", label: "Connexion + teasing", objective: "connexion" },
  { day: "Mar", emoji: "💰", label: "Séquence vente (problème→offre)", objective: "vente" },
  { day: "Mer", emoji: "📣", label: "Amplification + témoignage", objective: "amplification" },
  { day: "Jeu", emoji: "💰", label: "FAQ + preuve sociale", objective: "vente" },
  { day: "Ven", emoji: "💰", label: "Last call + urgence douce", objective: "vente" },
];

/** Get ISO week key like "2026-W09" */
function getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

interface Props {
  weekDays: Date[];
  isLaunchWeek?: boolean;
}

export function StoriesMixBanner({ weekDays, isLaunchWeek = false }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const [hidden, setHidden] = useState(true); // hidden by default until we check
  const mix = isLaunchWeek ? LAUNCH_MIX : CRUISE_MIX;
  const weekKey = weekDays.length > 0 ? getWeekKey(weekDays[0]) : "";

  useEffect(() => {
    if (!user || !weekKey) return;
      (supabase.from("dismissed_suggestions" as any) as any)
        .select("id")
        .eq(column, value)
      .eq("suggestion_type", "stories_week")
      .eq("context_key", weekKey)
      .maybeSingle()
      .then(({ data }) => {
        setHidden(!!data);
      });
  }, [user?.id, weekKey]);

  const handleDismiss = async () => {
    setHidden(true);
    if (!user || !weekKey) return;
    await (supabase.from("dismissed_suggestions" as any) as any).upsert(
      { user_id: user.id, suggestion_type: "stories_week", context_key: weekKey },
      { onConflict: "user_id,suggestion_type,context_key" }
    );
  };

  if (hidden) return null;

  const handleGenerateAll = () => {
    navigate("/instagram/stories", {
      state: {
        fromCalendarMix: true,
        weekDays: weekDays.map((d) => toLocalDateStr(d)),
        mix,
      },
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 mb-4 relative">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <h3 className="font-display text-sm font-bold text-foreground mb-1">
        📱 Suggestion stories de la semaine
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Basé sur ta ligne éditoriale et ton rythme :
      </p>

      <div className="space-y-1.5 mb-4">
        {mix.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="font-medium text-foreground w-8 shrink-0">{item.day}</span>
            <span>:</span>
            <span className="text-muted-foreground">
              {item.emoji} {item.label}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="rounded-full gap-1.5 text-xs" onClick={handleGenerateAll}>
          <Sparkles className="h-3.5 w-3.5" />
          Générer les 5 séquences
        </Button>
        <Button size="sm" variant="outline" className="rounded-full gap-1.5 text-xs" onClick={handleGenerateAll}>
          <Pencil className="h-3.5 w-3.5" />
          Personnaliser
        </Button>
      </div>
    </div>
  );
}
