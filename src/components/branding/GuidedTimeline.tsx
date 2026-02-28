import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ClipboardList, Eye, Sparkles } from "lucide-react";
import { type BrandingCompletion } from "@/lib/branding-completion";

const GUIDED_STEPS = [
  { day: 1, emoji: "🌱", title: "Qui es-tu ?", subtitle: "Mon histoire", desc: "Raconte ton projet en quelques lignes. L'IA structure tout.", route: "/branding/simple/story", scoreKey: "storytelling" as const },
  { day: 2, emoji: "👩‍💻", title: "Pour qui ?", subtitle: "Client·e idéal·e", desc: "3 questions simples, l'IA crée ta fiche persona.", route: "/branding/simple/persona", scoreKey: "persona" as const },
  { day: 3, emoji: "❤️", title: "Pourquoi toi ?", subtitle: "Proposition de valeur", desc: "Dis ce que tu fais, l'IA formule ta proposition.", route: "/branding/simple/proposition", scoreKey: "proposition" as const },
  { day: 4, emoji: "🎨", title: "Comment tu parles ?", subtitle: "Ton & style", desc: "Choisis ta vibe, l'IA définit ton ton.", route: "/branding/simple/tone", scoreKey: "tone" as const },
  { day: 5, emoji: "🍒", title: "De quoi tu parles ?", subtitle: "Stratégie de contenu", desc: "Générée automatiquement à partir de ton branding.", route: "/branding/simple/strategy", scoreKey: "strategy" as const },
  { day: 6, emoji: "🎁", title: "Qu'est-ce que tu vends ?", subtitle: "Mes offres", desc: "Décris tes offres simplement, l'IA les structure.", route: "/branding/simple/offers", scoreKey: "offers" as const },
  { day: 7, emoji: "📋", title: "Synthèse", subtitle: "Générer la synthèse branding", desc: "Ton Brand Book est prêt !", route: null, scoreKey: null },
];

function getGuidedEncouragement(total: number): string {
  if (total === 0) return "C'est parti ! Commence par ton histoire.";
  if (total <= 30) return "Bien lancée ! Continue, tu avances bien.";
  if (total <= 60) return "Tu es à mi-chemin. Le plus dur est fait.";
  if (total < 100) return "Presque terminé ! Plus qu'un petit effort.";
  return "🎉 Bravo ! Ton branding est complet. Génère ta synthèse !";
}

export default function GuidedTimeline({ completion, navigate, onShowSynthesis }: { completion: BrandingCompletion; navigate: (path: string) => void; onShowSynthesis: () => void }) {
  return (
    <div className="space-y-6">
      {/* Encouragement */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-center">
        <p className="text-sm font-medium text-foreground">{getGuidedEncouragement(completion.total)}</p>
        <div className="flex items-center gap-2 mt-2 max-w-xs mx-auto">
          <Progress value={completion.total} className="h-2 flex-1" />
          <span className="font-mono-ui text-[11px] font-semibold text-muted-foreground">{completion.total}%</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {GUIDED_STEPS.map((step, idx) => {
          const isLast = idx === GUIDED_STEPS.length - 1;
          const pValue = step.scoreKey ? completion[step.scoreKey] : (isLast ? completion.total : 0);
          const isDone = step.scoreKey ? pValue === 100 : (isLast && completion.total >= 10);

          return (
            <div key={step.day} className="flex gap-4 relative">
              {/* Left: circle + line */}
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors z-10 ${
                    isDone
                      ? "bg-primary text-primary-foreground border-primary"
                      : pValue > 0
                        ? "bg-primary/10 text-primary border-primary/40"
                        : "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {isDone ? "✓" : step.day}
                </div>
                {!isLast && (
                  <div className={`w-0.5 flex-1 min-h-[24px] transition-colors ${isDone ? "bg-primary/40" : "bg-border"}`} />
                )}
              </div>

              {/* Right: card */}
              <div className={`rounded-2xl border bg-card p-5 flex-1 mb-4 transition-all ${isDone ? "border-primary/30" : "border-border"} hover:shadow-md`}>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{step.emoji}</span>
                    <div>
                      <h3 className="font-display text-base font-bold text-foreground leading-tight">{step.title}</h3>
                      <p className="text-[12px] text-muted-foreground">{step.subtitle}</p>
                    </div>
                  </div>
                  {isDone && <span className="shrink-0 text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">✅ Fait</span>}
                </div>
                <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">{step.desc}</p>

                {step.scoreKey && (
                  <div className="flex items-center gap-2 mb-3">
                    <Progress value={pValue} className="h-1.5 flex-1" />
                    <span className="font-mono-ui text-[10px] font-semibold text-muted-foreground">{pValue}%</span>
                  </div>
                )}

                {isLast ? (
                  completion.total >= 10 ? (
                    <Button size="sm" className="rounded-pill text-xs w-full" onClick={onShowSynthesis}>
                      <ClipboardList className="h-3.5 w-3.5 mr-1" /> Générer ma synthèse
                    </Button>
                  ) : (
                    <p className="text-[11px] text-muted-foreground text-center">Remplis au moins une section pour débloquer.</p>
                  )
                ) : step.route ? (
                  <Button
                    size="sm"
                    className="rounded-pill text-xs w-full"
                    variant={isDone ? "outline" : "default"}
                    onClick={() => navigate(step.route!)}
                  >
                    {isDone ? (
                      <><Eye className="h-3.5 w-3.5 mr-1" /> Revoir</>
                    ) : pValue > 0 ? (
                      <>Continuer →</>
                    ) : (
                      <><Sparkles className="h-3.5 w-3.5 mr-1" /> Commencer</>
                    )}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
