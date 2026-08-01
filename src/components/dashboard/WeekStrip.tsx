import { useNavigate } from "react-router-dom";
import { ArrowRight, Instagram, Linkedin, Mail, Pin, type LucideIcon } from "lucide-react";
import { toLocalDateStr } from "@/lib/utils";

/* ── Bande « Cette semaine » : 7 cases jour, réseau + format dans la case.
      L'icône dit le réseau, le petit mot dit le format ; monochrome bordeaux
      pour ne pas transformer la page en sapin de Noël. ── */

export type WeekPost = {
  date: string;
  theme: string | null;
  format: string | null;
  canal: string | null;
};

function canalIcon(canal?: string | null): LucideIcon | null {
  const c = (canal ?? "").toLowerCase();
  if (c.includes("insta")) return Instagram;
  if (c.includes("linkedin")) return Linkedin;
  if (c.includes("newsletter") || c.includes("mail")) return Mail;
  if (c.includes("pinterest")) return Pin;
  return null;
}

function canalLabel(canal?: string | null): string {
  const c = (canal ?? "").toLowerCase();
  if (c.includes("insta")) return "Instagram";
  if (c.includes("linkedin")) return "LinkedIn";
  if (c.includes("newsletter") || c.includes("mail")) return "Newsletter";
  if (c.includes("pinterest")) return "Pinterest";
  return "";
}

function formatLabel(format?: string | null): string {
  const f = (format ?? "").toLowerCase();
  if (f.includes("carrousel") || f.includes("carousel")) return "carrousel";
  if (f.includes("story") || f.includes("storie")) return "story";
  if (f.includes("reel")) return "reel";
  if (f.includes("newsletter")) return "newsletter";
  if (f.includes("pin")) return "pin";
  return "post";
}

function formatShortDate(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  const s = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function WeekStrip({ posts, isLoading }: { posts: WeekPost[]; isLoading: boolean }) {
  const navigate = useNavigate();

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  // posts arrive triés par date croissante depuis aujourd'hui : [0] = prochain contenu
  const nextPost = posts[0] ?? null;

  // Le prochain contenu peut tomber APRÈS la bande (ex. le 15 alors qu'on
  // affiche le 1er → 7). La bande semblait alors vide pendant que la ligne du
  // dessous annonçait « Prochain — sam. 15 » : deux messages contradictoires
  // (constaté le 01/08). On le dit maintenant explicitement.
  const lastDayStr = toLocalDateStr(days[days.length - 1]);
  const nextPostIsBeyond = !!nextPost && nextPost.date > lastDayStr;

  if (isLoading) {
    return (
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <div key={d.toISOString()} className="h-[72px] rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {days.map((day) => {
          const dateStr = toLocalDateStr(day);
          const dayPosts = posts.filter((p) => p.date === dateStr);
          const isNext = !!nextPost && nextPost.date === dateStr;
          const planned = dayPosts.length > 0;
          const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(day);

          const cellClass = isNext
            ? "bg-bordeaux border border-transparent"
            : planned
              ? "bg-rose-pale border border-bordeaux/25 hover:border-bordeaux/50"
              : "bg-transparent border border-border/70 hover:border-primary/40";

          const aria = planned
            ? `${weekday} ${day.getDate()} — ${dayPosts.map((p) => `${formatLabel(p.format)} ${canalLabel(p.canal)}`).join(", ")}`
            : `${weekday} ${day.getDate()} — rien de prévu, programmer un contenu`;

          return (
            <button
              key={dateStr}
              type="button"
              aria-label={aria}
              onClick={() => navigate(`/calendrier?date=${dateStr}`)}
              className={`rounded-xl px-0.5 pt-2 pb-2.5 text-center transition-colors min-h-[72px] flex flex-col items-center ${cellClass}`}
            >
              <span className={`text-[11px] leading-tight ${isNext ? "text-white/70" : "text-muted-foreground"}`}>
                {weekday}
              </span>
              <span className={`text-[15px] leading-tight mb-1 ${isNext ? "text-white font-medium" : "text-foreground"}`}>
                {day.getDate()}
              </span>

              {planned ? (
                <span className="flex flex-col items-center gap-0.5 min-w-0 max-w-full">
                  <span className={`flex items-center gap-0.5 ${isNext ? "text-white" : "text-bordeaux"}`}>
                    {dayPosts.slice(0, 2).map((p, i) => {
                      const Icon = canalIcon(p.canal);
                      return Icon ? (
                        <Icon key={i} className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden="true" />
                      ) : (
                        <span key={i} className="inline-block h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                      );
                    })}
                    {dayPosts.length > 2 && (
                      <span className="text-[11px]">+{dayPosts.length - 2}</span>
                    )}
                  </span>
                  <span className={`hidden sm:block text-[11px] leading-tight truncate max-w-full ${isNext ? "text-white/80" : "text-bordeaux/80"}`}>
                    {dayPosts.length > 1 ? `${dayPosts.length} contenus` : formatLabel(dayPosts[0].format)}
                  </span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/40 mt-0.5" aria-hidden="true">+</span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-sm text-muted-foreground flex items-baseline gap-1.5 min-w-0">
        {nextPost ? (
          <>
            <span className="shrink-0 font-medium text-bordeaux">
              {nextPostIsBeyond
                ? `Rien ces 7 jours — prochain ${formatShortDate(nextPost.date).toLowerCase()} :`
                : `Prochain — ${formatShortDate(nextPost.date).toLowerCase()} :`}
            </span>
            <span className="truncate">
              {formatLabel(nextPost.format)}
              {canalLabel(nextPost.canal) ? ` ${canalLabel(nextPost.canal)}` : ""}
              {nextPost.theme ? ` — ${nextPost.theme}` : ""}
            </span>
          </>
        ) : (
          <span className="truncate">Rien de prévu pour l'instant — on planifie ta semaine ?</span>
        )}
        <button
          type="button"
          onClick={() => navigate("/calendrier")}
          className="shrink-0 inline-flex items-center gap-1 text-bordeaux hover:text-primary transition-colors"
        >
          Voir mon calendrier
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </p>
    </div>
  );
}
