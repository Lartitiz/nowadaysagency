// Barre fixe du bas de la relecture de marque : « x/7 validées », « Je valide
// tout », « Finir plus tard » et progression. Sorti de BrandingReview.tsx à
// l'identique (fiche 14 de docs/robustesse/gros-fichiers.md, lot 5).
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { SectionKey } from "./types";

interface ReviewStickyBarProps {
  allDone: boolean;
  validatedCount: number;
  /** Cartes vides laissées pour plus tard (elles ne bloquent pas la fin). */
  emptyLeft?: number;
  total: number;
  completeReview: () => void;
  waitingForPhotos: boolean;
  mandatory: boolean;
  finished: boolean;
  handleValidateAll: () => void;
  validatingAll: boolean;
  savingSection: SectionKey | null;
  onDone: (complete?: boolean) => void;
}

export function ReviewStickyBar({ allDone, validatedCount, emptyLeft = 0, total, completeReview, waitingForPhotos, mandatory, finished, handleValidateAll, validatingAll, savingSection, onDone }: ReviewStickyBarProps) {
  return (
    <div className="fixed bottom-14 md:bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-sm border-t border-border px-4 py-3">
      <div className="mx-auto max-w-[900px] flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="text-sm font-semibold text-foreground">
              {allDone && emptyLeft === 0 ? "Fiche validée ! 🎉" : allDone ? `${validatedCount}/${total} validées · ${emptyLeft} à remplir plus tard` : `${validatedCount}/${total} validées`}
            </span>
            <div className="flex items-center gap-3 shrink-0">
              {allDone ? (
                <button onClick={completeReview} disabled={waitingForPhotos} className="text-sm font-semibold text-primary-text hover:underline whitespace-nowrap disabled:opacity-50 disabled:cursor-wait">
                  {mandatory ? finished ? waitingForPhotos ? "Un instant…" : "Créer mon premier contenu →" : "Voir la suite →" : "Voir mon identité complète →"}
                </button>
              ) : (
                <>
                  {/* Le raccourci demandé : tout valider d'un coup, sans parcourir les 7 cartes. */}
                  <button
                    onClick={handleValidateAll}
                    disabled={validatingAll || !!savingSection}
                    className="inline-flex items-center gap-1.5 bg-primary text-white rounded-pill px-4 py-1.5 text-xs font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 whitespace-nowrap"
                  >
                    {validatingAll ? <Spinner className="h-3.5 w-3.5 text-white" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Je valide tout
                  </button>
                  {/* Hors onboarding, la porte de sortie reste : sans elle, la
                      review remplacerait /branding à chaque visite. Dans
                      l'onboarding (mandatory), valider sa fiche EST l'étape. */}
                  {!mandatory && (
                    <button
                      onClick={() => onDone(false)}
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 whitespace-nowrap"
                      title="Les cartes validées sont gardées ; tu pourras finir le reste depuis Mon identité."
                    >
                      Finir plus tard
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="h-[6px] rounded-full bg-rose-pale overflow-hidden">
            {/* `initial` explicite : sans lui, framer-motion part de la largeur
                mesurée (= 100 %) et la barre s'affiche PLEINE une fraction de
                seconde alors que rien n'est validé. */}
            <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, #ffa7c6, #fb3d80)" }} initial={{ width: 0 }} animate={{ width: `${(validatedCount / total) * 100}%` }} transition={{ type: "spring", stiffness: 60, damping: 20 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
