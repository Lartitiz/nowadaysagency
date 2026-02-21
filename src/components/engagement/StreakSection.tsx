import { useMemo } from "react";

interface StreakSectionProps {
  currentStreak: number;
  bestStreak: number;
  weekChecks: boolean[]; // 7 booleans, Mon-Sun, true=done, false=missed, null-like=future
  todayIndex: number; // 0=Mon ... 6=Sun
}

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function StreakSection({ currentStreak, bestStreak, weekChecks, todayIndex }: StreakSectionProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-foreground">
          🔥 {currentStreak} jour{currentStreak > 1 ? "s" : ""} d'engagement
        </h2>
        <span className="text-xs text-muted-foreground">Record : {bestStreak} jours 🏆</span>
      </div>

      <div className="flex justify-between gap-1">
        {DAYS.map((day, i) => {
          const done = weekChecks[i];
          const isFuture = i > todayIndex;
          const isToday = i === todayIndex;

          return (
            <div key={day} className="flex flex-col items-center gap-1 flex-1">
              <span className="text-[10px] text-muted-foreground font-mono">{day}</span>
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all
                  ${done ? "bg-primary text-primary-foreground" : ""}
                  ${!done && !isFuture ? "bg-muted text-muted-foreground" : ""}
                  ${isFuture ? "border-2 border-dashed border-border text-muted-foreground/40" : ""}
                  ${isToday && !done ? "ring-2 ring-primary/30" : ""}
                `}
              >
                {done ? "🔥" : isFuture ? "○" : "·"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
