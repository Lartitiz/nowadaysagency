import { useNavigate } from "react-router-dom";
import { Loader2, Recycle, TrendingUp, History, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRecycleCandidates, type RecycleCandidate } from "@/hooks/use-recycle-candidates";
import { friendlyError } from "@/lib/error-messages";

const FORMAT_EMOJI: Record<string, string> = {
  carousel: "🎠",
  reel: "🎬",
  video: "🎬",
  image: "📷",
  post: "📝",
  story_serie: "📱",
  newsletter: "📧",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function metricsLine(c: RecycleCandidate): string | null {
  const m = c.metrics;
  if (!m) return null;
  const parts: string[] = [];
  if (typeof m.engagementRate === "number") parts.push(`${(m.engagementRate * 100).toFixed(1)} % d'engagement`);
  if (m.likes) parts.push(`${m.likes} ❤️`);
  if (m.comments) parts.push(`${m.comments} 💬`);
  if (m.saves) parts.push(`${m.saves} 🔖`);
  return parts.length ? parts.join(" · ") : null;
}

/** En-tête injecté dans le brief : dire à l'IA de RÉ-ANGLER, pas de paraphraser. */
function buildExistingContent(c: RecycleCandidate): string {
  const stats = metricsLine(c);
  const contexte = [
    `[POST DÉJÀ PUBLIÉ le ${formatDate(c.publishedAt)}${stats ? ` — ${stats}` : ""}.`,
    `MISSION : ce sujet a fait ses preuves, RÉ-ANGLE-le : nouvel angle, nouvelle accroche, nouvel exemple — surtout PAS une redite du texte ci-dessous.]`,
  ].join(" ");
  return `${contexte}\n\n${c.content || c.excerpt}`;
}

export default function RecycleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const { data, isLoading, error } = useRecycleCandidates(open);

  const handleRecycle = (c: RecycleCandidate) => {
    onOpenChange(false);
    navigate("/creer", {
      state: {
        sujet: c.theme,
        existingContent: buildExistingContent(c),
        fromRecycle: true,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Recycle className="h-5 w-5 text-primary" /> Recycler un contenu qui a marché
          </DialogTitle>
          <DialogDescription>
            Tes posts passés qui méritent une seconde vie — on repart du sujet et on le ré-angle.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="py-10 text-center space-y-3">
            <Loader2 className="h-7 w-7 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">
              Je relis tes posts publiés et leurs statistiques… (jusqu'à 20 secondes)
            </p>
          </div>
        )}

        {error && !isLoading && (
          <p className="py-6 text-sm text-destructive text-center">⚠️ {friendlyError(error)}</p>
        )}

        {!isLoading && !error && data && data.candidates.length === 0 && (
          <div className="py-8 text-center space-y-2">
            <p className="text-sm text-foreground">Rien à recycler pour l'instant.</p>
            <p className="text-xs text-muted-foreground">
              Publie quelques contenus (ou laisse-leur 3 semaines de vie) et reviens — tes
              meilleurs posts apparaîtront ici.
            </p>
          </div>
        )}

        {!isLoading && !error && data && data.candidates.length > 0 && (
          <div className="space-y-2">
            {!data.igConnected && (
              <p className="text-xs text-muted-foreground">
                💡 Connecte ton compte Instagram pour classer tes posts par engagement réel —
                en attendant, voici les plus anciens à faire revivre.
              </p>
            )}
            {data.candidates.map((c) => (
              <div
                key={`${c.source}-${c.id}`}
                className="rounded-xl border border-border bg-card p-3.5 flex flex-col gap-1.5"
              >
                <div className="flex items-center gap-2 text-2xs uppercase tracking-wider font-semibold">
                  {c.reason === "top_engagement" ? (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <TrendingUp className="h-3 w-3" /> Top engagement
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <History className="h-3 w-3" /> À faire revivre
                    </span>
                  )}
                  <span className="text-muted-foreground font-normal normal-case tracking-normal">
                    {FORMAT_EMOJI[c.format || ""] || "📝"} {formatDate(c.publishedAt)}
                  </span>
                </div>
                <p className="text-sm font-semibold text-foreground">{c.theme}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{c.excerpt}</p>
                {metricsLine(c) && (
                  <p className="text-xs text-foreground/70">{metricsLine(c)}</p>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" className="rounded-full h-8" onClick={() => handleRecycle(c)}>
                    ✍️ Ré-angler
                  </Button>
                  {c.permalink && (
                    <a
                      href={c.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      Voir le post <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
