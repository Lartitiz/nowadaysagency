// En-tête de la relecture de marque : titre, « Je valide tout » du haut,
// sources analysées, confiance, aide « Coller ma bio Instagram ». Sorti de
// BrandingReview.tsx à l'identique (fiche 14 de docs/robustesse/gros-fichiers.md, lot 5).
import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Instagram } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SourceTag } from "./ReviewBits";
import type { AnalysisResult, SectionKey } from "./types";

interface ReviewHeaderProps {
  analysis: AnalysisResult;
  sourcesUsed: string[];
  sourcesFailed: string[];
  preFilledSections?: Set<string>;
  /** Cartes où il y a vraiment quelque chose à relire. */
  filledCount: number;
  allDone: boolean;
  validatingAll: boolean;
  savingSection: SectionKey | null;
  handleValidateAll: () => void;
  onReanalyzeWithBio?: (bio: string) => void;
}

export function ReviewHeader({ analysis, sourcesUsed, sourcesFailed, preFilledSections, filledCount, allDone, validatingAll, savingSection, handleValidateAll, onReanalyzeWithBio }: ReviewHeaderProps) {
  // Instagram bio fallback
  const instagramFailed = sourcesFailed.includes("instagram") || (analysis.sources_failed || []).includes("instagram");
  const [igBio, setIgBio] = useState("");
  const [showIgBioInput, setShowIgBioInput] = useState(false);

  // Compté sur les cartes, pas lu dans `overall_confidence` : en onboarding,
  // le serveur l'écrit « medium » d'office, d'où un « Bonne base » affiché
  // au-dessus de 7 cartes vides (vu le 22/10/2026).
  const confMsg = filledCount >= 7
    ? { emoji: "🎯", text: "J'ai rempli les 7 cartes : relis-les et corrige ce qui ne va pas." }
    : filledCount === 0
      ? { emoji: "🌱", text: "Je n'ai presque rien trouvé : une question courte par carte, ou « Plus tard »." }
      : { emoji: "🌱", text: `J'ai rempli ${filledCount} carte${filledCount > 1 ? "s" : ""} sur 7. Pour les autres, une question courte suffit.` };

  const allSources = [...new Set([...sourcesUsed, ...sourcesFailed])];
  if (allSources.length === 0 && analysis.sources_used) {
    allSources.push(...(analysis.sources_used || []));
    if (analysis.sources_failed) allSources.push(...analysis.sources_failed);
  }

  const sourceLabels = (analysis.sources_used || sourcesUsed || []).map(s => {
    const m: Record<string, string> = { website: "ton site", instagram: "ton Instagram", linkedin: "ton LinkedIn", documents: "tes documents" };
    return m[s] || s;
  });
  const subtitleSources = sourceLabels.length > 0 ? sourceLabels.join(", ") : "tes liens";

  const hasPreFilled = preFilledSections && preFilledSections.size > 0;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
        <h1 className="font-display text-3xl sm:text-4xl text-foreground" style={{ fontWeight: 400 }}>
          Voici ce que j'ai compris de ton projet
        </h1>
        {/* Même raccourci qu'en bas de page, remonté ici : une utilisatrice
            qui ne scrolle pas jusqu'à la barre sticky doit quand même le voir. */}
        {!allDone && (
          <button
            onClick={handleValidateAll}
            disabled={validatingAll || !!savingSection}
            className="inline-flex items-center justify-center gap-1.5 bg-primary text-white rounded-pill px-4 py-2 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 shrink-0 self-start"
          >
            {validatingAll ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle2 className="h-4 w-4" />}
            Je valide tout
          </button>
        )}
      </div>
      <p className="font-mono-ui text-sm text-muted-foreground mb-4 leading-relaxed">
        {sourceLabels.length > 0 ? `J’ai analysé ${subtitleSources}.` : 'Voici les informations à relire.'} Une carte par morceau de ta marque : tu valides, ou tu mets de côté pour y revenir.
      </p>

      {hasPreFilled && (
        <p className="font-mono-ui text-sm text-success bg-success-bg border border-success/30 rounded-[12px] px-3 py-2 mb-3">
          ✅ Tes informations existantes sont conservées. Les suggestions attendent ta validation.
        </p>
      )}

      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-sm mb-3">
        <span>{confMsg.emoji}</span>
        <span className="text-foreground">{confMsg.text}</span>
      </div>

      {allSources.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {allSources.map((s) => (
            <SourceTag key={s} name={s} ok={sourcesUsed.includes(s) || (analysis.sources_used || []).includes(s)} />
          ))}
        </div>
      )}

      {/* Instagram bio fallback */}
      {instagramFailed && (
        <div className="mt-4 bg-warning-bg border border-warning/30 rounded-[16px] p-4">
          <div className="flex items-start gap-2 mb-2">
            <Instagram className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <p className="text-sm text-warning">
              Je n'ai pas réussi à accéder à ton Instagram (c'est fréquent, Instagram bloque les analyses automatiques). Tu peux m'aider en copiant-collant ta bio ici.
            </p>
          </div>
          {!showIgBioInput ? (
            <button onClick={() => setShowIgBioInput(true)} className="text-sm font-semibold text-primary-text hover:underline">
              Coller ma bio Instagram →
            </button>
          ) : (
            <div className="space-y-2 mt-2">
              <Textarea
                value={igBio}
                onChange={(e) => setIgBio(e.target.value)}
                placeholder="Colle ta bio Instagram ici..."
                className="text-sm min-h-[80px]"
              />
              <Button
                size="sm"
                disabled={!igBio.trim()}
                onClick={() => onReanalyzeWithBio?.(igBio.trim())}
                className="bg-primary hover:bg-bordeaux text-white text-sm"
              >
                Réanalyser avec ma bio
              </Button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
