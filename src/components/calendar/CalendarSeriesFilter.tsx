import { Tv, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveSeries } from "@/hooks/use-active-series";
import { cn } from "@/lib/utils";

interface Props {
  /** "all" | "none" | series_id */
  value: string;
  onChange: (v: string) => void;
  /** Optional counts per series_id (built from current posts list) */
  counts?: Record<string, number>;
}

export function CalendarSeriesFilter({ value, onChange, counts }: Props) {
  const { data: series = [], isLoading } = useActiveSeries();

  const hasActive = value !== "all";
  const selected = value === "none"
    ? "Sans série"
    : value === "all"
      ? null
      : series.find((s) => s.id === value)?.name || "Série";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all",
            hasActive
              ? "bg-primary/10 text-primary border-primary/30"
              : "bg-card text-muted-foreground border-border hover:border-primary/40",
          )}
        >
          <Tv className="h-3.5 w-3.5" />
          {hasActive ? `Série : ${selected}` : "Filtrer par série"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
        <DropdownMenuLabel className="text-xs">Filtrer par série</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onChange("all")}
          className="text-xs cursor-pointer"
        >
          <span className="flex-1">Toutes les séries</span>
          {value === "all" && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onChange("none")}
          className="text-xs cursor-pointer"
        >
          <span className="flex-1 text-muted-foreground">Sans série</span>
          {value === "none" && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>
        {series.length > 0 && <DropdownMenuSeparator />}
        {isLoading && (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            Chargement…
          </DropdownMenuItem>
        )}
        {!isLoading && series.length === 0 && (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            Aucune série active
          </DropdownMenuItem>
        )}
        {series.map((s) => {
          const count = counts?.[s.id] ?? 0;
          return (
            <DropdownMenuItem
              key={s.id}
              onClick={() => onChange(s.id)}
              className="text-xs cursor-pointer"
            >
              <span className="flex-1 truncate">📺 {s.name}</span>
              {count > 0 && (
                <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                  {count}
                </span>
              )}
              {value === s.id && <Check className="h-3.5 w-3.5 text-primary ml-1" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
