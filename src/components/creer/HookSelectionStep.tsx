import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ArrowRight,
  Heart,
  Shuffle,
  MessageCircleQuestion,
  HelpCircle,
  Hash,
  Clapperboard,
  Sparkles,
  RefreshCw,
  Loader2,
} from "lucide-react";

// Lot 7 reels : l'utilisatrice choisit son angle d'attaque AVANT la génération
// complète. La forme de ReelHook = celle du `selected_hook` que reelBrief
// consomme côté edge (format-briefs.ts) : le choix repart tel quel au generate.
export interface ReelHook {
  type: string;
  type_label: string;
  text: string;
  text_overlay: string;
  format_recommande: string;
  format_label: string;
  duree_cible: string;
}

interface Props {
  hooks: ReelHook[];
  loading: boolean;
  refreshing?: boolean;
  error?: string | null;
  onSelect: (hook: ReelHook) => void;
  onSkip: () => void;
  onRefresh: () => void;
  onBack: () => void;
}

const TYPE_ICONS: Record<string, typeof Heart> = {
  vecu_perso: Heart,
  contre_intuition: Shuffle,
  objection_retournee: MessageCircleQuestion,
  question_choc: HelpCircle,
  fait_brut: Hash,
  scene_coupee: Clapperboard,
};

const HOOKS_LOADING_MESSAGES = [
  "Je cherche l'angle qui arrête le scroll…",
  "Je teste plusieurs façons d'ouvrir ton reel…",
  "Je m'assure que chaque angle te ressemble…",
];

function HooksLoading() {
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % HOOKS_LOADING_MESSAGES.length), 3500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="py-12 text-center space-y-3 animate-fade-in">
      <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
      <p className="text-sm font-medium text-foreground">{HOOKS_LOADING_MESSAGES[msgIdx]}</p>
      <p className="text-xs text-muted-foreground">Les 3 premières secondes décident de tout.</p>
    </div>
  );
}

export default function HookSelectionStep({
  hooks,
  loading,
  refreshing,
  error,
  onSelect,
  onSkip,
  onRefresh,
  onBack,
}: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Un refresh remplace les cartes : la sélection précédente n'a plus de sens.
  useEffect(() => {
    setSelectedIdx(null);
  }, [hooks]);

  if (loading) return <HooksLoading />;

  if (error || hooks.length === 0) {
    // Jamais bloquant : sans hooks, le parcours historique (hook auto) continue.
    return (
      <div className="py-12 text-center space-y-4 animate-fade-in">
        <p className="text-sm text-muted-foreground">
          {error || "Je n'ai pas réussi à préparer les angles d'attaque."}
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Réessayer
          </Button>
          <Button size="sm" onClick={onSkip}>
            Continuer sans choisir
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <p className="text-xs text-muted-foreground mb-1">Gratuit : cette étape ne consomme pas de crédit</p>
        <h2 className="text-lg font-semibold text-foreground">Choisis ton angle d'attaque</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Les 3 premières secondes décident de tout. Trois façons d'ouvrir ce reel : choisis celle qui te ressemble.
        </p>
      </div>

      <div className="space-y-2.5" role="radiogroup" aria-label="Angles d'attaque proposés">
        {hooks.map((hook, i) => {
          const Icon = TYPE_ICONS[hook.type] || Sparkles;
          const selected = selectedIdx === i;
          return (
            <button
              key={`${hook.text}-${i}`}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setSelectedIdx(i)}
              className={`w-full text-left rounded-xl border bg-card p-4 transition-colors ${
                selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <Badge className="bg-primary/10 text-primary border-primary/20 gap-1 font-normal">
                  <Icon className="h-3 w-3" />
                  {hook.type_label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {hook.format_label} · {hook.duree_cible}
                </span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">« {hook.text} »</p>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="text-2xs uppercase tracking-wide text-muted-foreground">Écran muet</span>
                <Badge variant="secondary" className="text-2xs font-normal">📝 {hook.text_overlay}</Badge>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            3 autres angles
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onSkip} disabled={refreshing}>
            Laisser l'IA choisir
          </Button>
        </div>
        <Button
          size="sm"
          disabled={selectedIdx === null || refreshing}
          onClick={() => selectedIdx !== null && onSelect(hooks[selectedIdx])}
        >
          Écrire le script complet
          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </div>

      <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
        <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
        Revenir aux questions
      </Button>
    </div>
  );
}
