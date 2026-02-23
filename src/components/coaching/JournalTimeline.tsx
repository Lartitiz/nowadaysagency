import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Download, Lock, Sparkles, ExternalLink } from "lucide-react";

interface JournalEntry {
  id: string;
  program_id: string;
  session_id: string | null;
  month_number: number | null;
  date: string | null;
  title: string;
  body: string | null;
  laetitia_note: string | null;
  deliverable_ids: string[];
  status: string;
}

interface Deliverable {
  id: string;
  title: string;
  status: string;
  route: string | null;
  delivered_at: string | null;
  unlocked_at: string | null;
  unlocked_by_journal_id: string | null;
  file_url: string | null;
  file_name: string | null;
  seen_by_client: boolean;
}

export default function JournalTimeline({ programId }: { programId: string }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [jRes, dRes] = await Promise.all([
        (supabase.from("coaching_journal" as any) as any)
          .select("*").eq("program_id", programId).order("date", { ascending: true, nullsFirst: false }),
        (supabase.from("coaching_deliverables" as any) as any)
          .select("*").eq("program_id", programId).order("created_at"),
      ]);
      setEntries((jRes.data || []) as JournalEntry[]);
      setDeliverables((dRes.data || []) as Deliverable[]);
      setLoading(false);

      // Mark unseen deliverables as seen
      const unseen = ((dRes.data || []) as Deliverable[]).filter(d => d.status === "delivered" && !d.seen_by_client);
      if (unseen.length > 0) {
        unseen.forEach(d => {
          toast("✨ Nouveau livrable débloqué : " + d.title + " !", { duration: 4000 });
        });
        const ids = unseen.map(d => d.id);
        await (supabase.from("coaching_deliverables" as any) as any)
          .update({ seen_by_client: true }).in("id", ids);
        setDeliverables(prev => prev.map(d => ids.includes(d.id) ? { ...d, seen_by_client: true } : d));
      }
    })();
  }, [programId]);

  if (loading) return null;

  const publishedEntries = entries.filter(e => e.status === "completed" || e.status === "current");
  const upcomingEntries = entries.filter(e => e.status === "upcoming");
  const unlockedDeliverables = deliverables.filter(d => d.status === "delivered");
  const lockedDeliverables = deliverables.filter(d => d.status !== "delivered");
  const progressPct = deliverables.length > 0 ? Math.round((unlockedDeliverables.length / deliverables.length) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* ── JOURNAL ── */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-bold text-foreground mb-1">📖 Journal de bord</h2>
        <p className="text-sm text-muted-foreground mb-6">Tout ce qu'on a construit ensemble.</p>

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Le journal sera alimenté au fil des sessions.</p>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-border" />

            <div className="space-y-8">
              {publishedEntries.map(entry => (
                <TimelineEntry
                  key={entry.id}
                  entry={entry}
                  deliverables={deliverables.filter(d => (entry.deliverable_ids || []).includes(d.id))}
                  status={entry.status === "completed" ? "completed" : "current"}
                />
              ))}
              {upcomingEntries.map(entry => (
                <TimelineEntry
                  key={entry.id}
                  entry={entry}
                  deliverables={[]}
                  status="upcoming"
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── LIVRABLES ── */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-bold text-foreground mb-1">
          🎁 Tes livrables · {unlockedDeliverables.length}/{deliverables.length} débloqués
        </h2>
        <Progress value={progressPct} className="h-2.5 mt-2 mb-5" />

        {unlockedDeliverables.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Débloqués</p>
            <div className="space-y-2">
              {unlockedDeliverables.map(d => (
                <DeliverableCard key={d.id} deliverable={d} />
              ))}
            </div>
          </div>
        )}

        {lockedDeliverables.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">À venir</p>
            <div className="space-y-2">
              {lockedDeliverables.map(d => (
                <div key={d.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 p-3 opacity-60">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{d.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* ── Timeline Entry ── */
function TimelineEntry({ entry, deliverables, status }: {
  entry: JournalEntry;
  deliverables: Deliverable[];
  status: "completed" | "current" | "upcoming";
}) {
  const dotColor = status === "completed" ? "bg-green-500" : status === "current" ? "bg-primary" : "bg-border";
  const isUpcoming = status === "upcoming";

  return (
    <div className={`relative pl-9 ${isUpcoming ? "opacity-50" : ""}`}>
      {/* Dot */}
      <div className={`absolute left-1.5 top-1.5 w-3 h-3 rounded-full ${dotColor} ring-2 ring-background`} />

      <div>
        {/* Date + month */}
        <p className="text-xs text-muted-foreground mb-1">
          {entry.date ? format(new Date(entry.date), "d MMMM", { locale: fr }) : ""}
          {entry.month_number ? ` · Mois ${entry.month_number}` : ""}
        </p>

        {/* Title */}
        <p className={`font-semibold text-sm ${isUpcoming ? "text-muted-foreground" : "text-foreground"}`}>
          {entry.title}
          {status === "completed" && " ✅"}
        </p>

        {/* Body (only for completed/current) */}
        {!isUpcoming && entry.body && (
          <div className="mt-2 text-sm text-foreground/80 whitespace-pre-line leading-relaxed">
            {entry.body}
          </div>
        )}

        {/* Linked deliverables */}
        {!isUpcoming && deliverables.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">📎 Livrables débloqués :</p>
            <div className="space-y-1">
              {deliverables.map(d => (
                <div key={d.id} className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-foreground">{d.title}</span>
                  {d.route && (
                    <Link to={d.route} className="text-xs text-primary font-semibold hover:underline">
                      Voir →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Laetitia note */}
        {!isUpcoming && entry.laetitia_note && (
          <div className="mt-3 rounded-xl bg-secondary/50 p-3">
            <p className="text-xs font-semibold text-primary mb-1">💌 Mot de Laetitia :</p>
            <p className="text-sm text-foreground italic whitespace-pre-line">{entry.laetitia_note}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Deliverable Card ── */
function DeliverableCard({ deliverable }: { deliverable: Deliverable }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-card p-3">
      <div className="flex items-center gap-3">
        <span className="text-lg">✅</span>
        <div>
          <p className="text-sm font-medium text-foreground">{deliverable.title}</p>
          {deliverable.unlocked_at && (
            <p className="text-xs text-muted-foreground">
              Débloqué le {format(new Date(deliverable.unlocked_at), "d MMM", { locale: fr })}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {deliverable.file_url && (
          <a href={deliverable.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
            <Download className="h-3.5 w-3.5" /> Télécharger
          </a>
        )}
        {deliverable.route && (
          <Link to={deliverable.route} className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
            <ExternalLink className="h-3.5 w-3.5" /> Voir
          </Link>
        )}
      </div>
    </div>
  );
}
