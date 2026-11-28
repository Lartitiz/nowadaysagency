// Attente de « Réagir à une actualité » (28/11/2026). Retour de Laetitia :
// près d'une minute devant un rond qui tourne. Le serveur envoie maintenant
// ce qu'il trouve au fil de l'eau : les sujets repérés, la recherche en
// cours, puis chaque actu dès qu'elle est prête.
import { Loader2 } from "lucide-react";
import { dateActu } from "./newsjacking-date";
import { type EnDirect, searchStageLabel, stripCitations } from "./newsjacking-config";

const sourceDatee = (source?: string, date?: string) => [source, dateActu(date)].filter(Boolean).join(" · ");

export default function NewsjackingAttente({ secondes, enDirect }: { secondes: number; enDirect: EnDirect }) {
  const { pistes, requete, actus } = enDirect;
  const etape = actus.length > 0
    ? "J'écris le lien avec ton activité pour les suivantes…"
    : requete
      ? `Je cherche : « ${requete} »`
      : pistes.length > 0
        ? "Je regarde comment les relier à ton activité…"
        : searchStageLabel(secondes);

  return (
    <div className="space-y-4 py-6" aria-live="polite">
      <div className="flex items-center justify-center gap-2.5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
        <p className="min-w-0 truncate">{etape}</p>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">{secondes} s</span>
      </div>

      {actus.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {actus.length} actu{actus.length > 1 ? "s" : ""} prête{actus.length > 1 ? "s" : ""}, la suite arrive. Tu pourras choisir dès que la recherche est finie.
          </p>
          {actus.map((actu, i) => (
            <div key={i} className="animate-fade-in rounded-[20px] border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-lg">{actu.type === "globale" ? "📰" : "🎯"}</span>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-medium leading-snug">{stripCitations(actu.titre)}</h4>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{stripCitations(actu.resume)}</p>
                  {(actu.source || actu.date_publication) && (
                    <p className="mt-2 text-2xs text-muted-foreground">{sourceDatee(actu.source, actu.date_publication)}</p>
                  )}
                  {actu.pertinence && <p className="mt-2 text-xs italic text-muted-foreground">💡 {stripCitations(actu.pertinence)}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : pistes.length > 0 ? (
        <div className="animate-fade-in rounded-[20px] border bg-card p-4">
          <p className="text-xs font-medium text-foreground">Ce dont on parle cette semaine</p>
          <ul className="mt-2 space-y-2">
            {pistes.map((piste, i) => (
              <li key={i} className="text-sm leading-snug">
                {piste.titre}
                {(piste.source || piste.date_publication) && (
                  <span className="text-2xs text-muted-foreground"> · {sourceDatee(piste.source, piste.date_publication)}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-2xs text-muted-foreground">Je garde celles que tu peux relier à ce dont tu parles, et j'en cherche d'autres.</p>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground/80">
          {secondes < 30 ? "Les premières actus arrivent dans quelques secondes." : "Ça peut prendre jusqu'à 2 minutes, c'est normal."}
        </p>
      )}
    </div>
  );
}
