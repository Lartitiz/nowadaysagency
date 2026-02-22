import { useState } from "react";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";

interface MetricsData {
  followers?: number;
  avg_reach?: number;
  avg_likes?: number;
  avg_saves?: number;
  dm_received?: number;
  profile_visits?: number;
  link_clicks?: number;
  launch_signups?: number;
  launch_dm?: number;
  launch_link_clicks?: number;
  launch_story_views?: number;
}

interface PrevMetrics {
  followers?: number;
  avg_reach?: number;
  avg_likes?: number;
  avg_saves?: number;
  dm_received?: number;
  profile_visits?: number;
  link_clicks?: number;
}

interface MetricsSectionProps {
  weekLabel: string;
  metrics: MetricsData;
  prevMetrics?: PrevMetrics;
  history: MetricsData[];
  isLaunching: boolean;
  aiInsight?: string;
  onSave: (data: MetricsData) => void;
  onGenerateInsight: () => void;
  isGenerating: boolean;
  onChange: (field: string, value: number) => void;
}

function variation(current?: number, prev?: number) {
  if (current == null || prev == null || prev === 0) return null;
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct > 0) return { text: `↗️ +${pct}%`, positive: true };
  if (pct < 0) return { text: `↘️ ${pct}%`, positive: false };
  return { text: "→ stable", positive: true };
}

function diff(current?: number, prev?: number) {
  if (current == null || prev == null) return null;
  const d = current - prev;
  if (d > 0) return `+${d}`;
  if (d < 0) return `${d}`;
  return "=";
}

const FIELDS: { key: keyof MetricsData; label: string }[] = [
  { key: "followers", label: "Abonné·es" },
  { key: "avg_reach", label: "Reach moyen/post" },
  { key: "avg_likes", label: "Likes moyen/post" },
  { key: "avg_saves", label: "Saves moyen/post" },
  { key: "dm_received", label: "DM reçus" },
  { key: "profile_visits", label: "Visites profil" },
  { key: "link_clicks", label: "Clics lien bio" },
];

const LAUNCH_FIELDS: { key: keyof MetricsData; label: string }[] = [
  { key: "launch_signups", label: "Inscriptions" },
  { key: "launch_dm", label: "DM liés au lancement" },
  { key: "launch_link_clicks", label: "Clics lien vente" },
  { key: "launch_story_views", label: "Vues stories lancement" },
];

function MiniBar({ values, maxVal }: { values: (number | undefined)[]; maxVal: number }) {
  return (
    <div className="flex items-end gap-0.5 h-5">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-3 rounded-sm bg-primary/60"
          style={{ height: `${Math.max(4, ((v || 0) / (maxVal || 1)) * 20)}px` }}
        />
      ))}
    </div>
  );
}

export default function MetricsSection({
  weekLabel, metrics, prevMetrics, history, isLaunching,
  aiInsight, onSave, onGenerateInsight, isGenerating, onChange
}: MetricsSectionProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <h2 className="font-display text-lg font-bold text-foreground">📊 Mes métriques — {weekLabel}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map(({ key, label }) => {
          const v = variation(metrics[key], prevMetrics?.[key as keyof PrevMetrics]);
          return (
            <div key={key} className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground w-28 shrink-0">{label}</label>
              <Input
                type="number"
                value={metrics[key] ?? ""}
                onChange={e => onChange(key, parseInt(e.target.value) || 0)}
                className="w-24 h-8 text-sm text-center"
              />
              {v && <span className={`text-[10px] ${v.positive ? "text-green-600" : "text-red-500"}`}>{v.text}</span>}
              {diff(metrics[key], prevMetrics?.[key as keyof PrevMetrics]) && (
                <span className="text-[10px] text-muted-foreground">({diff(metrics[key], prevMetrics?.[key as keyof PrevMetrics])})</span>
              )}
            </div>
          );
        })}
      </div>

      {isLaunching && (
        <div className="pt-3 border-t border-border space-y-3">
          <p className="text-xs font-bold text-foreground">🚀 Métriques lancement</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {LAUNCH_FIELDS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground w-28 shrink-0">{label}</label>
                <Input
                  type="number"
                  value={metrics[key] ?? ""}
                  onChange={e => onChange(key, parseInt(e.target.value) || 0)}
                  className="w-24 h-8 text-sm text-center"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(metrics)}>💾 Sauvegarder</Button>
        <Button size="sm" variant="outline" onClick={onGenerateInsight} disabled={isGenerating}>
          {isGenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
          Analyser
        </Button>
      </div>

      {/* Trend bars */}
      {history.length > 1 && (
        <div className="pt-3 border-t border-border space-y-2">
          <p className="text-xs font-bold text-foreground">📈 Tendance sur {history.length} semaines</p>
          {(["avg_reach", "avg_saves", "dm_received"] as const).map(key => {
            const vals = history.map(h => h[key]);
            const max = Math.max(...vals.filter(Boolean).map(Number));
            const label = key === "avg_reach" ? "Reach" : key === "avg_saves" ? "Saves" : "DM";
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-12">{label}</span>
                <MiniBar values={vals} maxVal={max} />
              </div>
            );
          })}
        </div>
      )}

      {/* AI Insight */}
      {aiInsight && (
        <div className="rounded-lg bg-rose-pale p-3 text-sm text-foreground italic">
          💡 {aiInsight}
        </div>
      )}
    </div>
  );
}
