import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Save } from "lucide-react";

interface PatternItem {
  number: number;
  title: string;
  explanation: string;
  metric_highlight?: string;
  posts_concerned?: string[];
  alternative?: string;
}

interface DnaItem {
  type: string;
  emoji: string;
  rating: number;
  verdict: string;
}

interface EditorialRecommendations {
  recommended_mix?: Record<string, number>;
  best_format?: string;
  best_angle?: string;
  best_content_types?: string[];
  worst_content_types?: string[];
  reel_advice?: string;
  general_advice?: string;
}

interface ContentAnalysis {
  patterns_positifs?: PatternItem[];
  patterns_negatifs?: PatternItem[];
}

interface Props {
  contentAnalysis?: ContentAnalysis;
  contentDna?: DnaItem[];
  comboGagnant?: string;
  editorialRecommendations?: EditorialRecommendations;
  onSaveToEditorial?: () => void;
}

const VERDICT_LABELS: Record<string, { label: string; emoji: string }> = {
  ton_arme: { label: "Ton arme", emoji: "🔥" },
  continue: { label: "Continue", emoji: "✅" },
  a_ameliorer: { label: "À amél.", emoji: "⚠️" },
  eviter: { label: "Éviter", emoji: "❌" },
};

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-warning text-xs tracking-wide">
      {"⭐".repeat(Math.min(rating, 5))}
    </span>
  );
}

export default function ContentAnalysisResults({
  contentAnalysis,
  contentDna,
  comboGagnant,
  editorialRecommendations,
  onSaveToEditorial,
}: Props) {
  const positifs = contentAnalysis?.patterns_positifs || [];
  const negatifs = contentAnalysis?.patterns_negatifs || [];
  const hasDna = contentDna && contentDna.length > 0;
  const hasEditorial = editorialRecommendations && Object.keys(editorialRecommendations).length > 0;

  if (!positifs.length && !negatifs.length && !hasDna && !hasEditorial) return null;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ─── Section Header ─── */}
      <div>
        <h2 className="font-display text-xl font-bold text-foreground mb-1">📊 Analyse de ton contenu</h2>
        <p className="text-sm text-muted-foreground">
          L'IA a analysé {positifs.length + negatifs.length > 0 ? `${positifs.length} pattern${positifs.length > 1 ? "s" : ""} positif${positifs.length > 1 ? "s" : ""} et ${negatifs.length} négatif${negatifs.length > 1 ? "s" : ""}` : "tes contenus"}.
        </p>
      </div>

      {/* ─── Positive Patterns ─── */}
      {positifs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono-ui">
            ✅ Ce qui marche chez toi
          </h3>
          {positifs.map((p) => (
            <div key={p.number} className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-success text-white text-sm font-bold flex items-center justify-center">
                  {p.number}
                </span>
                <h4 className="text-base font-semibold text-foreground leading-tight">{p.title}</h4>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed pl-10">{p.explanation}</p>
              {p.metric_highlight && (
                <div className="ml-10 flex flex-wrap gap-3">
                  {p.metric_highlight.split(/[·|]/).map((m, i) => (
                    <span key={i} className="text-xs font-medium text-foreground bg-success-bg px-2 py-1 rounded-md">
                      {m.trim()}
                    </span>
                  ))}
                </div>
              )}
              {p.posts_concerned && p.posts_concerned.length > 0 && (
                <p className="text-xs text-muted-foreground pl-10 italic">
                  🏷️ Posts : {p.posts_concerned.join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── Negative Patterns ─── */}
      {negatifs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono-ui">
            ⚠️ Ce qui ne marche pas
          </h3>
          {negatifs.map((p) => (
            <div key={p.number} className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-warning text-white text-sm font-bold flex items-center justify-center">
                  {p.number}
                </span>
                <h4 className="text-base font-semibold text-foreground leading-tight">{p.title}</h4>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed pl-10">{p.explanation}</p>
              {p.alternative && (
                <div className="ml-10 bg-accent/30 border-l-[3px] border-l-accent rounded-r-lg px-4 py-3">
                  <p className="text-sm text-foreground/80 italic">💡 {p.alternative}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── Content DNA Table ─── */}
      {hasDna && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono-ui">
            📋 Récap : Ton ADN de contenu
          </h3>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-foreground">Type</th>
                  <th className="text-center px-4 py-2.5 font-medium text-foreground">Engage.</th>
                  <th className="text-center px-4 py-2.5 font-medium text-foreground">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {contentDna!.map((d, i) => {
                  const v = VERDICT_LABELS[d.verdict] || { label: d.verdict, emoji: "•" };
                  return (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5 text-foreground">{d.emoji} {d.type}</td>
                      <td className="px-4 py-2.5 text-center"><StarRating rating={d.rating} /></td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-pill ${
                          d.verdict === "ton_arme" ? "bg-primary/10 text-primary" :
                          d.verdict === "continue" ? "bg-success-bg text-success" :
                          d.verdict === "a_ameliorer" ? "bg-warning-bg text-warning" :
                          "bg-error-bg text-error"
                        }`}>
                          {v.emoji} {v.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {comboGagnant && (
            <div className="rounded-xl bg-rose-pale p-4">
              <p className="text-sm text-foreground">
                💡 <strong>Ton combo gagnant :</strong> {comboGagnant}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── Editorial Recommendations ─── */}
      {hasEditorial && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono-ui">
            🎯 Recommandations pour ta ligne éditoriale
          </h3>
          <p className="text-sm text-muted-foreground">
            D'après l'analyse de tes contenus, voici comment ajuster ta stratégie :
          </p>

          {editorialRecommendations!.recommended_mix && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">📊 Mix recommandé pour toi</h4>
              <div className="space-y-2">
                {Object.entries(editorialRecommendations!.recommended_mix).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-sm text-foreground w-28 capitalize">{key}</span>
                    <Progress value={val} className="h-2 flex-1" />
                    <span className="text-xs font-medium text-muted-foreground w-10 text-right">{val}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {editorialRecommendations!.best_format && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h4 className="text-sm font-semibold text-foreground mb-1">📑 Format star : {editorialRecommendations!.best_format}</h4>
              <p className="text-sm text-muted-foreground">
                Ce format performe le mieux chez toi. Assure-toi d'en faire régulièrement.
              </p>
            </div>
          )}

          {editorialRecommendations!.reel_advice && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h4 className="text-sm font-semibold text-foreground mb-1">🎬 Reels</h4>
              <p className="text-sm text-muted-foreground">{editorialRecommendations!.reel_advice}</p>
            </div>
          )}

          {editorialRecommendations!.general_advice && (
            <div className="rounded-xl bg-rose-pale p-4">
              <p className="text-sm text-foreground italic">{editorialRecommendations!.general_advice}</p>
            </div>
          )}

          {onSaveToEditorial && (
            <Button onClick={onSaveToEditorial} className="rounded-pill gap-2">
              <Save className="h-4 w-4" />
              💾 Sauvegarder dans ma ligne éditoriale
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
