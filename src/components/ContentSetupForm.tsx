import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { ArrowRight } from "lucide-react";
import {
  OBJECTIFS, FORMATS, CANAUX,
  getRecommendedFormats, formatIdToGuideKey,
  RECO_EXPLAIN,
} from "@/lib/atelier-data";
import { getInstagramFormatReco } from "@/lib/production-guides";

interface ContentSetupFormProps {
  initialCanal?: string;
  initialObjectif?: string | null;
  initialFormat?: string | null;
  initialSujet?: string;
  onSubmit: (setup: {
    canal: string;
    objectif: string | null;
    format: string | null;
    formatLabel: string;
    sujet: string;
  }) => void;
  submitLabel?: string;
  compact?: boolean;
}

export default function ContentSetupForm({
  initialCanal,
  initialObjectif,
  initialFormat,
  initialSujet,
  onSubmit,
  submitLabel = "Créer ce contenu →",
  compact = false,
}: ContentSetupFormProps) {
  const [canal, setCanal] = useState(initialCanal || "instagram");
  const [objectif, setObjectif] = useState<string | null>(initialObjectif ?? null);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(initialFormat ?? null);
  const [sujetLibre, setSujetLibre] = useState(initialSujet || "");

  useEffect(() => {
    if (initialCanal) setCanal(initialCanal);
  }, [initialCanal]);

  useEffect(() => {
    if (initialObjectif !== undefined) setObjectif(initialObjectif ?? null);
  }, [initialObjectif]);

  useEffect(() => {
    if (initialFormat !== undefined) setSelectedFormat(initialFormat ?? null);
  }, [initialFormat]);

  useEffect(() => {
    if (initialSujet !== undefined) setSujetLibre(initialSujet || "");
  }, [initialSujet]);

  const { recommended, others } = getRecommendedFormats(objectif);

  const selectedFormatLabel = FORMATS.find((f) => f.id === selectedFormat)?.label || "";

  const guideKey = selectedFormat ? formatIdToGuideKey(selectedFormat) : null;
  const formatReco = guideKey ? getInstagramFormatReco(guideKey) : null;

  const mb = compact ? "mb-4" : "mb-6";

  const handleSubmit = () => {
    onSubmit({
      canal,
      objectif,
      format: selectedFormat,
      formatLabel: selectedFormatLabel,
      sujet: sujetLibre,
    });
  };

  return (
    <div>
      {/* ── Canal selector ── */}
      <div className={mb}>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Canal</label>
        <div className="flex flex-wrap gap-2">
          {CANAUX.map((c) => (
            <button
              key={c.id}
              disabled={!c.enabled}
              onClick={() => c.enabled && setCanal(c.id)}
              className={`rounded-pill px-4 py-2 text-sm font-medium border transition-all ${
                canal === c.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : c.enabled
                    ? "bg-card text-foreground border-border hover:border-primary/40"
                    : "bg-muted text-muted-foreground border-border opacity-50 cursor-not-allowed"
              }`}
            >
              {c.label}
              {!c.enabled && <span className="ml-1 text-[10px]">(Bientôt)</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Objectif selector ── */}
      <div className={mb}>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
          Tu veux quoi avec ce contenu ?
        </label>
        <div className="flex flex-wrap gap-2">
          {OBJECTIFS.map((o) => (
            <button
              key={o.id}
              onClick={() => setObjectif(objectif === o.id ? null : o.id)}
              className={`rounded-pill px-4 py-2 text-sm font-medium border transition-all ${
                objectif === o.id
                  ? o.color + " border-current"
                  : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              {o.emoji} {o.label}
              {!compact && (
                <span className="ml-1 text-[10px] text-muted-foreground hidden sm:inline">({o.desc})</span>
              )}
            </button>
          ))}
        </div>
        {objectif && RECO_EXPLAIN[objectif] && !compact && (
          <p className="mt-2 text-xs text-muted-foreground italic animate-fade-in">
            💡 {RECO_EXPLAIN[objectif]}
          </p>
        )}
      </div>

      {/* ── Format selector ── */}
      <div className={mb}>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
          Format / angle
        </label>
        <div className="flex flex-wrap gap-2">
          {recommended.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFormat(selectedFormat === f.id ? null : f.id)}
              className={`rounded-pill px-3 py-1.5 text-sm font-medium border transition-all ${
                selectedFormat === f.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              {f.label}
              <span className="ml-1.5 text-[9px] font-bold bg-accent text-accent-foreground px-1.5 py-0.5 rounded-md">
                Recommandé
              </span>
            </button>
          ))}
          {others.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFormat(selectedFormat === f.id ? null : f.id)}
              className={`rounded-pill px-3 py-1.5 text-sm font-medium border transition-all ${
                selectedFormat === f.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {formatReco && canal === "instagram" && !compact && (
          <p className="mt-2 text-xs text-muted-foreground animate-fade-in">
            📐 {formatReco}
          </p>
        )}
      </div>

      {/* ── Sujet libre ── */}
      <div className={mb}>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
          Sujet libre (optionnel)
        </label>
        <Input
          value={sujetLibre}
          onChange={(e) => setSujetLibre(e.target.value)}
          placeholder="Un mot-clé, un thème, une question..."
        />
      </div>

      {/* ── Submit ── */}
      <Button
        onClick={handleSubmit}
        disabled={!selectedFormat}
        className="w-full rounded-full gap-2"
        size="lg"
      >
        <ArrowRight className="h-4 w-4" />
        {submitLabel}
      </Button>
    </div>
  );
}
