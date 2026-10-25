// Carte de fin de la relecture de marque : cartes restantes (et « à revoir »),
// photos en onboarding, premier contenu. Sorti de BrandingReview.tsx à
// l'identique (fiche 14 de docs/robustesse/gros-fichiers.md, lot 5).
import { CheckCircle2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { BrandPhotosPicker } from "@/components/photos/BrandPhotosPicker";
import { SECTIONS, type SectionKey } from "./types";

interface ReviewEndCardProps {
  validated: Set<SectionKey>;
  toReview: Set<SectionKey>;
  goTo: (index: number) => void;
  mandatory: boolean;
  setProductPhotosReady: (ready: boolean) => void;
  completeReview: () => void;
  canComplete: boolean;
  productPhotosReady: boolean;
  handleValidateAll: () => void;
  validatingAll: boolean;
  savingSection: SectionKey | null;
  /** Carte vide : elle ne bloque pas la fin, on la rappelle « à remplir plus tard ». */
  isEmptyCard?: (key: SectionKey) => boolean;
  /** Reprise d'onboarding qui a remplacé la fiche : les connecteurs intelligents
      ne sont pas passés, on invite à relire le reste (décision du 15/10/2026). */
  recheckHint?: boolean;
}

export function ReviewEndCard({ validated, toReview, goTo, mandatory, setProductPhotosReady, completeReview, canComplete, productPhotosReady, handleValidateAll, validatingAll, savingSection, isEmptyCard, recheckHint = false }: ReviewEndCardProps) {
  const pending = SECTIONS.filter((s) => !validated.has(s.key) && !isEmptyCard?.(s.key));
  const later = SECTIONS.filter((s) => !validated.has(s.key) && isEmptyCard?.(s.key));
  const done = pending.length === 0;
  // Toutes les cartes laissées vides : rien n'est enregistré, donc ni 🎉 ni
  // « Tes choix sont enregistrés » (vu en ligne le 24/10/2026 sur une fiche vide).
  const nothingSaved = done && validated.size === 0;
  return (
    <div className="bg-card rounded-[20px] shadow-card border border-border p-6 sm:p-8 text-center animate-in fade-in duration-300">
      <div className="text-3xl mb-2">{done && !nothingSaved ? "🎉" : "📝"}</div>
      <h2 className="font-display text-2xl text-foreground mb-2" style={{ fontWeight: 400 }}>
        {nothingSaved ? "Ta fiche reste à remplir" : done ? "Ta relecture est terminée" : "Il reste des cartes à valider"}
      </h2>
      <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto leading-relaxed">
        {nothingSaved
          ? "Je n'ai rien trouvé à enregistrer pour l'instant. Tu rempliras ces cartes quand tu veux, depuis Mon identité."
          : done
          ? "Tes choix sont enregistrés. Les informations manquantes restent à compléter quand tu en as besoin depuis Mon identité."
          // Ces cartes sont remplies, pas vides : « attendent encore ta réponse »
          // se lisait comme 6 questions à remplir (vu le 25/10/2026).
          : `Tu n'as pas encore dit si ${pending.length > 1 ? `ces ${pending.length} cartes sont justes` : "cette carte est juste"}. Reprends-${pending.length > 1 ? "les" : "la"} une par une, ou valide tout d'un coup si ça te convient.`}
      </p>

      {done && later.length > 0 && (
        <div className="mb-5">
          <p className="text-sm text-foreground mb-2">À remplir plus tard dans Mon identité :</p>
          <div className="flex flex-wrap justify-center gap-2">
            {later.map((s) => (
              <button key={s.key} onClick={() => goTo(SECTIONS.findIndex((x) => x.key === s.key))} className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:border-primary transition-colors">
                <span>{s.emoji}</span> {s.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {done && recheckHint && (
        <p className="text-sm text-foreground bg-rose-pale rounded-[12px] px-4 py-3 mb-5 max-w-md mx-auto leading-relaxed">
          💡 Ta fiche a été mise à jour avec tes nouvelles réponses. Quand tu as un moment, relis tes offres, ton ton et ta stratégie dans Mon identité pour vérifier qu'ils collent toujours.
        </p>
      )}

      {!done && (
        <div className="flex flex-wrap justify-center gap-2 mb-5">
          {pending.map((s) => (
            <button
              key={s.key}
              onClick={() => goTo(SECTIONS.findIndex((x) => x.key === s.key))}
              className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:border-primary transition-colors"
            >
              <span>{s.emoji}</span> {s.title}
              {toReview.has(s.key) && <span className="text-2xs text-muted-foreground font-medium">plus tard</span>}
            </button>
          ))}
        </div>
      )}

      {/* Fin de relecture pendant l'onboarding : la marque est posée, on
          propose ses photos (site / Instagram connecté) avant le 1er contenu. */}
      {done && mandatory && <BrandPhotosPicker placement="brand_review" className="mb-5" onReadyChange={setProductPhotosReady} />}

      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        {done ? (
          <button onClick={completeReview} disabled={!canComplete} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-6 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:cursor-wait">
            {mandatory && !productPhotosReady ? "Un instant…" : mandatory ? "Créer mon premier contenu →" : "Voir mon identité complète →"}
          </button>
        ) : (
          <>
            <button onClick={handleValidateAll} disabled={validatingAll || !!savingSection} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-6 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50">
              {validatingAll ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle2 className="h-4 w-4" />}
              Valider tout le reste
            </button>
            <button onClick={() => goTo(SECTIONS.findIndex((s) => !validated.has(s.key)))} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-primary text-primary rounded-[12px] px-5 py-2.5 text-sm font-semibold hover:bg-rose-pale transition-all">
              Reprendre les cartes
            </button>
          </>
        )}
      </div>
    </div>
  );
}
