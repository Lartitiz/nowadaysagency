// En-tête de la relecture de marque : le titre, une phrase qui dit quoi faire,
// et la bulle qui compte les cartes remplies. Allégé le 24/10/2026 (chantier 4
// de plan-onboarding-comprehension.md) : plus d'encadré « informations
// conservées », de pastilles de sources ni de « Je valide tout » en double
// (celui de la barre du bas reste). L'encadré « Coller ma bio Instagram » est
// retiré : la bio collée partait derrière le @ et n'était jamais lue.
import { motion } from "framer-motion";
import { SECTIONS, type AnalysisResult } from "./types";

interface ReviewHeaderProps {
  analysis: AnalysisResult;
  sourcesFailed: string[];
  /** Cartes où il y a vraiment quelque chose à relire. */
  filledCount: number;
}

export function ReviewHeader({ analysis, sourcesFailed, filledCount }: ReviewHeaderProps) {
  const total = SECTIONS.length;
  // Le @ seul n'est jamais lu (décision du 17/10, #1731) : on le dit en une
  // ligne, sans proposer de coller une bio que l'analyse ne lit pas.
  const instagramFailed = sourcesFailed.includes("instagram") || (analysis.sources_failed || []).includes("instagram");

  // Compté sur les cartes, pas lu dans `overall_confidence` : en onboarding,
  // le serveur l'écrit « medium » d'office, d'où un « Bonne base » affiché
  // au-dessus de 7 cartes vides (vu le 22/10/2026).
  const confMsg = filledCount >= total
    ? { emoji: "🎯", text: `J'ai rempli les ${total} cartes.` }
    : filledCount === 0
      ? { emoji: "🌱", text: "Je n'ai presque rien trouvé : une question courte par carte, ou « Plus tard »." }
      : { emoji: "🌱", text: `J'ai rempli ${filledCount} carte${filledCount > 1 ? "s" : ""} sur ${total}. Pour les autres, une question courte suffit.` };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-6">
      <h1 className="font-display text-3xl sm:text-4xl text-foreground mb-2" style={{ fontWeight: 400 }}>
        Voici ce que j'ai compris de ton projet
      </h1>
      <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
        {total} cartes à relire. Pour chacune : c'est juste, ou tu corriges.
        {instagramFailed && " Je n'ai pas pu lire ton Instagram : il bloque la lecture automatique."}
      </p>
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-sm">
        <span>{confMsg.emoji}</span>
        <span className="text-foreground">{confMsg.text}</span>
      </div>
    </motion.div>
  );
}
