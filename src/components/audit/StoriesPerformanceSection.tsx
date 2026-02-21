import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X } from "lucide-react";

const STORY_TYPES = ["Storytime", "Éducation", "Vente", "Coulisses", "FAQ", "Amplification"];
const STICKER_OPTIONS = ["Sondage", "Question ouverte", "Quiz", "Slider emoji", "Compte à rebours", "Lien"];

export interface StoryPerformanceEntry {
  type: string;
  completion_rate: string;
  dm_replies: string;
  sticker_used: string;
  why_worked: string;
  screenshot_url?: string;
}

interface Props {
  entries: StoryPerformanceEntry[];
  onChange: (entries: StoryPerformanceEntry[]) => void;
  files: File[];
  previews: string[];
  onFiles: (fl: FileList | null) => void;
  onRemoveFile: (i: number) => void;
}

function defaultEntry(): StoryPerformanceEntry {
  return { type: "", completion_rate: "", dm_replies: "", sticker_used: "", why_worked: "" };
}

export default function StoriesPerformanceSection({ entries, onChange, files, previews, onFiles, onRemoveFile }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const addEntry = () => onChange([...entries, defaultEntry()]);
  const updateEntry = (i: number, field: keyof StoryPerformanceEntry, value: string) => {
    onChange(entries.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));
  };
  const removeEntry = (i: number) => onChange(entries.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-foreground">📱 Stories qui ont marché</h2>
      <p className="text-sm text-muted-foreground">
        Upload tes stats stories (Insights → Stories) pour enrichir l'analyse.
      </p>

      {/* File upload zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
        className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
      >
        <Upload className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
        <p className="text-xs text-muted-foreground">Glisse tes screenshots stories stats ici</p>
        <p className="text-[10px] text-muted-foreground">Max 5 fichiers · 10 Mo/fichier</p>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />

      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previews.map((p, i) => (
            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border">
              <img src={p} alt="" className="w-full h-full object-cover" />
              <button onClick={() => onRemoveFile(i)} className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Story entries */}
      {entries.map((entry, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">Story performante {i + 1}</p>
            <button onClick={() => removeEntry(i)} className="text-xs text-destructive hover:underline">Supprimer</button>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Type de séquence</label>
            <div className="flex flex-wrap gap-1.5">
              {STORY_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => updateEntry(i, "type", t)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    entry.type === t ? "border-primary bg-rose-pale text-primary font-medium" : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Taux de complétion (%)</label>
              <Input
                type="number"
                value={entry.completion_rate}
                onChange={(e) => updateEntry(i, "completion_rate", e.target.value)}
                className="h-8 text-xs"
                placeholder="89"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Réponses DM</label>
              <Input
                type="number"
                value={entry.dm_replies}
                onChange={(e) => updateEntry(i, "dm_replies", e.target.value)}
                className="h-8 text-xs"
                placeholder="12"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Sticker utilisé</label>
            <div className="flex flex-wrap gap-1.5">
              {STICKER_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => updateEntry(i, "sticker_used", s)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    entry.sticker_used === s ? "border-primary bg-rose-pale text-primary font-medium" : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Pourquoi ça a marché selon toi ?</label>
            <Textarea
              value={entry.why_worked}
              onChange={(e) => updateEntry(i, "why_worked", e.target.value)}
              placeholder="J'ai raconté un truc perso, les gens se sont identifiés..."
              className="min-h-[60px] text-xs"
            />
          </div>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addEntry} className="rounded-full text-xs">
        + Ajouter une story performante
      </Button>
    </div>
  );
}
