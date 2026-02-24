import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Plus, ChevronRight, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { ProgramWithProfile, SessionData } from "./admin-coaching-types";

interface CoachingProgramListProps {
  programs: ProgramWithProfile[];
  sessions: SessionData[];
  loading: boolean;
  onSelectProgram: (id: string) => void;
  onAddClient: () => void;
}

export default function CoachingProgramList({ programs, sessions, loading, onSelectProgram, onAddClient }: CoachingProgramListProps) {
  const activePrograms = programs.filter(p => p.status === "active" || p.status === "paused");
  const completedPrograms = programs.filter(p => p.status === "completed");

  const getNextSession = (programId: string) => sessions.find(s => s.program_id === programId && s.status === "scheduled" && s.scheduled_date);
  const getSessionStats = (programId: string) => {
    const ps = sessions.filter(s => s.program_id === programId);
    return { done: ps.filter(s => s.status === "completed").length, total: ps.length };
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">🎓 Mes clientes Now Pilot</h1>
          <p className="text-sm text-muted-foreground mt-1">Actives : {activePrograms.length}</p>
        </div>
        <Button onClick={onAddClient} className="rounded-full gap-2"><Plus className="h-4 w-4" /> Ajouter une cliente</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-4">
          {activePrograms.map(p => {
            const next = getNextSession(p.id);
            const stats = getSessionStats(p.id);
            const pct = Math.round(((p.current_month || 1) / 6) * 100);
            return (
              <div key={p.id} className="rounded-2xl border border-border bg-card p-5 cursor-pointer hover:border-primary/40 transition-colors" onClick={() => onSelectProgram(p.id)}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-display font-bold text-foreground flex items-center gap-2">
                      {p.client_name || "Cliente"}
                      {p.status === "paused" && <Badge variant="secondary" className="text-[10px]">⏸️ En pause</Badge>}
                    </h3>
                    {p.client_activity && <p className="text-xs text-muted-foreground">{p.client_activity}</p>}
                  </div>
                  <Badge variant="secondary">Mois {p.current_month || 1}/6</Badge>
                </div>
                <Progress value={pct} className="h-2 mb-3" />
                <div className="space-y-1 text-sm text-muted-foreground mb-3">
                  {next ? (
                    <p>📅 Prochaine : {format(new Date(next.scheduled_date!), "d MMM", { locale: fr })} · {next.title}</p>
                  ) : (
                    <p className="text-destructive flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Aucune session planifiée</p>
                  )}
                  <p>📚 Sessions : {stats.done}/{stats.total}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-primary font-semibold">
                  Voir le programme <ChevronRight className="h-3 w-3" />
                </div>
              </div>
            );
          })}

          {completedPrograms.length > 0 && (
            <div className="mt-8">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Programmes terminés</p>
              {completedPrograms.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 rounded-lg px-2 transition-colors" onClick={() => onSelectProgram(p.id)}>
                  <span className="text-sm text-muted-foreground">{p.client_name} · Terminé</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
