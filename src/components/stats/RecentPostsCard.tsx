import { Bookmark, Camera, Clapperboard, Images, Recycle, Send, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  compte, habituelLabel, multipleLabel, recyclableIds, tropTotLabel, VERDICT_LABEL,
  type LivePosts, type PostVerdict, type RecentPost,
} from "@/features/stats/recent-posts";

const VERDICT_CLASS: Record<PostVerdict, string> = {
  sorti_du_lot: "bg-primary text-primary-foreground",
  au_dessus: "bg-primary/10 text-primary",
  en_dessous: "bg-muted text-muted-foreground",
  trop_tot: "border border-border text-muted-foreground",
};

function FormatIcon({ format }: { format?: string }) {
  const u = String(format || "").toUpperCase();
  const cls = "h-3.5 w-3.5 text-muted-foreground";
  if (u.includes("REEL") || u.includes("VIDEO")) return <Clapperboard className={cls} strokeWidth={1.75} />;
  if (u.includes("CAROUSEL")) return <Images className={cls} strokeWidth={1.75} />;
  return <Camera className={cls} strokeWidth={1.75} />;
}

/**
 * « Tes posts récents » : pour chaque post, est-il sorti du lot (likes rapportés au
 * post habituel du compte), combien d'enregistrements, combien de partages.
 */
export default function RecentPostsCard({ posts, onRecycle }: {
  posts: LivePosts;
  onRecycle: (p: RecentPost) => void;
}) {
  const recent = posts.recent || [];
  const recyclable = recyclableIds(posts);
  const hasMedian = typeof posts.medianLikes === "number" && !!posts.medianSample;
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3" data-testid="recent-posts-card">
      <div className="space-y-1">
        <h3 className="font-body text-sm font-bold text-foreground">
          <Trophy className="inline-block h-4 w-4 mr-1.5 align-[-2px] text-primary" strokeWidth={1.75} />Tes posts récents
        </h3>
        <p className="text-xs text-muted-foreground">{habituelLabel(posts)}</p>
      </div>
      <ul className="divide-y divide-border">
        {recent.map((p) => {
          const subject = (p.subject || "").trim() || "(sans légende)";
          const title = (
            <>
              <span className="shrink-0"><FormatIcon format={p.format} /></span>
              <span className="flex-1 truncate text-sm text-foreground" title={subject}>{subject}</span>
            </>
          );
          return (
            <li key={p.id} className="py-2.5 space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                {p.permalink
                  ? <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 min-w-0 flex-1 hover:underline">{title}</a>
                  : <span className="flex items-center gap-2 min-w-0 flex-1">{title}</span>}
                {p.verdict && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${VERDICT_CLASS[p.verdict]}`}>
                    {VERDICT_LABEL[p.verdict]}
                  </span>
                )}
              </div>
              {p.verdict === "trop_tot" ? (
                <p className="pl-[22px] text-xs text-muted-foreground">{tropTotLabel(p.timestamp)}</p>
              ) : (
                <div className="pl-[22px] flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {typeof p.xMedian === "number" && (
                    <span className="font-semibold text-foreground tabular-nums">{multipleLabel(p.xMedian)}</span>
                  )}
                  {typeof p.saves === "number" && (
                    <span className="inline-flex items-center gap-1"><Bookmark className="h-3.5 w-3.5" strokeWidth={1.75} />{compte(p.saves, "enregistrement")}</span>
                  )}
                  {typeof p.shares === "number" && (
                    <span className="inline-flex items-center gap-1"><Send className="h-3.5 w-3.5" strokeWidth={1.75} />{compte(p.shares, "partage")}</span>
                  )}
                </div>
              )}
              {recyclable.has(p.id) && (
                <Button
                  variant="ghost" size="sm"
                  className="ml-[14px] h-7 px-2 gap-1 text-xs text-primary"
                  title="Recycler ce sujet : repartir de ce qui a marché avec un nouvel angle"
                  onClick={() => onRecycle(p)}
                >
                  <Recycle className="h-3.5 w-3.5" /> Recycler ce sujet
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="space-y-1 text-xs text-muted-foreground">
        {hasMedian && (
          <p><strong className="text-foreground">× 2</strong> : ce post a fait 2 fois plus de likes que ton post habituel. À partir de × 2, il est sorti du lot.</p>
        )}
        <p><strong className="text-foreground">Enregistrements</strong> : des personnes veulent le retrouver.</p>
        <p><strong className="text-foreground">Partages</strong> : des personnes l'ont envoyé à quelqu'un. C'est ce qui te fait découvrir.</p>
      </div>
    </div>
  );
}
