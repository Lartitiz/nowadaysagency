import type { Prospect } from "./ProspectionSection";
import InstagramLink, { cleanPseudo } from "@/components/InstagramLink";
import { ExternalLink, MessageCircle } from "lucide-react";

interface ProspectPipelineProps {
  prospects: Prospect[];
  stages: { key: string; label: string; color: string }[];
  onSelect: (p: Prospect) => void;
  onStageChange: (id: string, stage: string) => void;
  onWriteDm?: (p: Prospect) => void;
}

function daysSince(dateStr?: string | null) {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export default function ProspectPipeline({ prospects, stages, onSelect, onStageChange, onWriteDm }: ProspectPipelineProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-display text-sm font-bold text-foreground">📋 Pipeline</h3>
      {stages.map(stage => {
        const stageProspects = prospects.filter(p => p.stage === stage.key);
        if (stageProspects.length === 0) return null;

        return (
          <div key={stage.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{stage.label}</span>
              <span className="text-xs text-muted-foreground">({stageProspects.length})</span>
            </div>
            {stageProspects.map(p => {
              const stale = daysSince(p.last_interaction_at) > 14;
              return (
                <div
                  key={p.id}
                  className={`rounded-lg border p-3 cursor-pointer hover:border-primary/40 transition-colors ${
                    stale ? "border-amber-300 bg-amber-50/30" : "border-border bg-card"
                  }`}
                  onClick={() => onSelect(p)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-primary">
                          @{cleanPseudo(p.instagram_username)}
                        </span>
                        {p.activity && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {p.activity}
                          </span>
                        )}
                        {stale && <span className="text-[10px]">⚠️</span>}
                      </div>
                      {p.display_name && (
                        <p className="text-[11px] text-muted-foreground">{p.display_name}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {p.last_interaction_at
                          ? `Dernier contact : il y a ${daysSince(p.last_interaction_at)} jour${daysSince(p.last_interaction_at) > 1 ? "s" : ""}`
                          : "Dernier contact : jamais"}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => onWriteDm ? onWriteDm(p) : onSelect(p)}
                        className="h-7 px-2 text-[11px] rounded-md hover:bg-accent text-foreground inline-flex items-center gap-1"
                      >
                        <MessageCircle className="h-3 w-3" />
                        <span className="hidden sm:inline">DM</span>
                      </button>
                      <button
                        onClick={() => onSelect(p)}
                        className="h-7 px-2 text-[11px] rounded-md hover:bg-accent text-foreground inline-flex items-center gap-1"
                      >
                        📋
                      </button>
                      <InstagramLink
                        username={p.instagram_username}
                        className="h-7 px-2 text-[11px] rounded-md hover:bg-accent text-foreground inline-flex items-center gap-1"
                        showCopy
                      >
                        <ExternalLink className="h-3 w-3" />
                      </InstagramLink>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      {prospects.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6 italic">
          Aucun prospect pour l'instant. Ajoute ton premier prospect pour commencer 🌱
        </p>
      )}
    </div>
  );
}
