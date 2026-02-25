import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Star, Hash, Trash2, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { PersonaSummary } from "@/hooks/use-personas";

const AVAILABLE_CHANNELS = [
  { id: "instagram", label: "Instagram", emoji: "📸" },
  { id: "linkedin", label: "LinkedIn", emoji: "💼" },
  { id: "facebook", label: "Facebook", emoji: "📘" },
  { id: "newsletter", label: "Newsletter", emoji: "📧" },
  { id: "pinterest", label: "Pinterest", emoji: "📌" },
  { id: "tiktok", label: "TikTok", emoji: "🎵" },
];

interface PersonaListProps {
  personas: PersonaSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSetPrimary: (id: string) => void;
  onUpdateChannels: (id: string, channels: string[]) => void;
  onDelete: (id: string) => void;
  onCreateNew: () => void;
}

export default function PersonaList({
  personas,
  selectedId,
  onSelect,
  onSetPrimary,
  onUpdateChannels,
  onDelete,
  onCreateNew,
}: PersonaListProps) {
  const [channelPopoverId, setChannelPopoverId] = useState<string | null>(null);

  if (personas.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-border p-6 text-center mb-6">
        <p className="text-sm text-muted-foreground mb-3">
          Tu n'as pas encore de persona. Crée ton premier client·e idéal·e !
        </p>
        <Button onClick={onCreateNew} className="rounded-full gap-2">
          <Plus className="h-4 w-4" /> Créer mon premier persona
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 mb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          👤 Mes personas ({personas.length})
        </h2>
        <Button variant="outline" size="sm" onClick={onCreateNew} className="rounded-full gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" /> Nouveau persona
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {personas.map((p) => {
          const label = p.label || p.portrait_prenom || "Persona sans nom";
          const isSelected = p.id === selectedId;

          return (
            <div
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={cn(
                "rounded-xl border-2 p-3 cursor-pointer transition-all relative group",
                isSelected
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border hover:border-primary/40"
              )}
            >
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold",
                  p.is_primary ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {(p.portrait_prenom || label).slice(0, 1).toUpperCase()}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{label}</span>
                    {p.is_primary && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                        <Crown className="h-2.5 w-2.5" /> Principal
                      </span>
                    )}
                  </div>
                  {/* Channel badges */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.channels && p.channels.length > 0 ? (
                      p.channels.map((ch) => {
                        const chan = AVAILABLE_CHANNELS.find((c) => c.id === ch);
                        return (
                          <span key={ch} className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                            {chan?.emoji} {chan?.label || ch}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">Tous les canaux</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  {!p.is_primary && (
                    <button
                      onClick={() => onSetPrimary(p.id)}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                      title="Définir comme principal"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <Popover
                    open={channelPopoverId === p.id}
                    onOpenChange={(open) => setChannelPopoverId(open ? p.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Associer des canaux"
                      >
                        <Hash className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-2" align="end">
                      <p className="text-xs font-medium text-foreground mb-2">Canaux cibles</p>
                      {AVAILABLE_CHANNELS.map((ch) => {
                        const checked = p.channels?.includes(ch.id) || false;
                        return (
                          <label
                            key={ch.id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const current = p.channels || [];
                                const next = checked
                                  ? current.filter((c) => c !== ch.id)
                                  : [...current, ch.id];
                                onUpdateChannels(p.id, next);
                              }}
                              className="rounded border-border"
                            />
                            <span>{ch.emoji} {ch.label}</span>
                          </label>
                        );
                      })}
                    </PopoverContent>
                  </Popover>

                  {!p.is_primary && personas.length > 1 && (
                    <button
                      onClick={() => {
                        if (confirm("Supprimer ce persona ?")) onDelete(p.id);
                      }}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
