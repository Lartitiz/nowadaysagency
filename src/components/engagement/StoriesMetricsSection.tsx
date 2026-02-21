import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface StoriesMetricsData {
  sequences_published: number;
  completion_rate: number | null;
  dm_replies: number;
  best_story: string;
  stickers_used: string[];
}

interface StoriesMetricsSectionProps {
  data: StoriesMetricsData;
  onChange: (data: StoriesMetricsData) => void;
  onSave: () => void;
}

const RECOMMENDED_WEEKLY = 5;

const STICKER_OPTIONS = [
  { id: "sondage", label: "Sondage", emoji: "🗳️" },
  { id: "quiz", label: "Quiz", emoji: "📊" },
  { id: "question_ouverte", label: "Question ouverte", emoji: "❓" },
  { id: "slider_emoji", label: "Slider emoji", emoji: "📏" },
  { id: "compte_a_rebours", label: "Compte à rebours", emoji: "⏰" },
  { id: "lien", label: "Lien", emoji: "🔗" },
];

function getAlerts(data: StoriesMetricsData): string[] {
  const alerts: string[] = [];
  if (data.completion_rate !== null && data.completion_rate < 40) {
    alerts.push("⚠️ Ton taux de complétion est bas. Tes stories sont peut-être trop longues ou manquent de hook en story 1.");
  }
  if (!data.stickers_used.includes("question_ouverte")) {
    alerts.push("💡 Pense à utiliser le sticker Question. Les réponses en DM sont le signal algo le plus fort.");
  }
  if (data.sequences_published === 0) {
    alerts.push("⚠️ Pas de stories cette semaine ? La régularité quotidienne booste ta position dans la barre de +23%.");
  }
  return alerts;
}

export default function StoriesMetricsSection({ data, onChange, onSave }: StoriesMetricsSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const pct = Math.min(100, Math.round((data.sequences_published / RECOMMENDED_WEEKLY) * 100));
  const alerts = getAlerts(data);

  const completionLabel =
    data.completion_rate === null ? "—" :
    data.completion_rate >= 70 ? "✅ Bien !" :
    data.completion_rate >= 50 ? "🟡 Objectif 70%" :
    "🔴 À améliorer";

  const dmLabel = data.dm_replies >= 5 ? "✅ Bien !" : data.dm_replies > 0 ? "🟡 Continue" : "—";

  const stickersSummary = STICKER_OPTIONS.filter(s => data.stickers_used.includes(s.id));

  const toggleSticker = (id: string) => {
    const used = data.stickers_used.includes(id)
      ? data.stickers_used.filter(s => s !== id)
      : [...data.stickers_used, id];
    onChange({ ...data, stickers_used: used });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h2 className="font-display text-lg font-bold text-foreground">📱 Mes stories cette semaine</h2>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Séquences publiées : {data.sequences_published} / {RECOMMENDED_WEEKLY} recommandées</span>
          <span>{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-background p-3 text-center">
          <p className="text-xs text-muted-foreground">Taux complétion</p>
          <p className="font-display text-xl font-bold text-foreground">{data.completion_rate !== null ? `${data.completion_rate}%` : "—"}</p>
          <p className="text-[10px] text-muted-foreground">{completionLabel}</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3 text-center">
          <p className="text-xs text-muted-foreground">Réponses DM</p>
          <p className="font-display text-xl font-bold text-foreground">{data.dm_replies}</p>
          <p className="text-[10px] text-muted-foreground">{dmLabel}</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3 text-center">
          <p className="text-xs text-muted-foreground">Meilleure story</p>
          <p className="text-xs font-medium text-foreground mt-1 truncate">{data.best_story || "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3 text-center">
          <p className="text-xs text-muted-foreground">Stickers utilisés</p>
          <div className="mt-1 space-y-0.5">
            {stickersSummary.length > 0 ? stickersSummary.map(s => (
              <p key={s.id} className="text-[10px] text-muted-foreground">{s.emoji} {s.label}</p>
            )) : <p className="text-[10px] text-muted-foreground">—</p>}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.map((a, i) => (
        <p key={i} className="text-xs text-foreground bg-rose-pale rounded-lg p-2.5">{a}</p>
      ))}

      {/* Input dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="rounded-full text-xs">📝 Saisir mes stats stories</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">📱 Stats stories de la semaine</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium block mb-1">Séquences stories publiées</label>
              <Input
                type="number"
                value={data.sequences_published}
                onChange={e => onChange({ ...data, sequences_published: parseInt(e.target.value) || 0 })}
                className="w-24 h-8 text-sm text-center"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">Taux de complétion moyen (%) <span className="text-muted-foreground font-normal">— si tu le connais</span></label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={data.completion_rate ?? ""}
                  onChange={e => onChange({ ...data, completion_rate: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-24 h-8 text-sm text-center"
                  placeholder="—"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">💡 Insights Instagram → Story → Taux de complétion</p>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">Réponses DM via tes stories</label>
              <Input
                type="number"
                value={data.dm_replies}
                onChange={e => onChange({ ...data, dm_replies: parseInt(e.target.value) || 0 })}
                className="w-24 h-8 text-sm text-center"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">Ta meilleure story (la plus d'interactions)</label>
              <Input
                value={data.best_story}
                onChange={e => onChange({ ...data, best_story: e.target.value })}
                className="h-8 text-sm"
                placeholder="Mon storytime sur..."
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Stickers utilisés cette semaine</label>
              <div className="grid grid-cols-2 gap-2">
                {STICKER_OPTIONS.map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={data.stickers_used.includes(s.id)}
                      onCheckedChange={() => toggleSticker(s.id)}
                    />
                    <span>{s.emoji} {s.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button
              onClick={() => { onSave(); setDialogOpen(false); }}
              className="w-full rounded-full"
            >
              💾 Sauvegarder
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
