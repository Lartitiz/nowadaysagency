import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, CalendarDays, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import laetitiaPhoto from "@/assets/laetitia-portrait.webp";

interface CoachingCardData {
  message: string;
  whatsappLink: string | null;
  calendlyLink: string | null;
}

interface SessionData {
  scheduled_date: string | null;
  title: string | null;
  focus_label: string | null;
  meeting_link: string | null;
  session_number: number;
}

const DEFAULT_MESSAGE = "N'hésite pas à m'écrire si tu as une question 💬";

const isToday = (date: string) => new Date(date).toDateString() === new Date().toDateString();
const isWithin24h = (date: string) => {
  const diff = new Date(date).getTime() - Date.now();
  return diff > 0 && diff < 24 * 60 * 60 * 1000;
};

export default function LaetitiaCoachingCard({ animationDelay = 0 }: { animationDelay?: number }) {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const navigate = useNavigate();
  const [data, setData] = useState<CoachingCardData | null>(null);
  const [nextSession, setNextSession] = useState<SessionData | null>(null);
  const [upcomingCount, setUpcomingCount] = useState(0);

  useEffect(() => {
    if (isDemoMode) {
      setData({
        message: "Bienvenue Léa ! J'ai hâte de découvrir ton univers. On se voit jeudi 🌸",
        whatsappLink: "https://wa.me/33614133921",
        calendlyLink: "https://calendly.com/laetitia-mattioli/atelier-2h",
      });
      setNextSession({
        scheduled_date: "2026-02-27T14:00:00",
        title: "Atelier de lancement",
        focus_label: null,
        meeting_link: null,
        session_number: 3,
      });
      setUpcomingCount(4);
      return;
    }
    if (!user?.id) return;

    (async () => {
      // RLS controls access — query any active program visible to this user
      const { data: prog } = await (supabase.from("coaching_programs" as any) as any)
        .select("dashboard_message, whatsapp_link, calendly_link, id")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (prog) {
        setData({
          message: prog.dashboard_message || DEFAULT_MESSAGE,
          whatsappLink: prog.whatsapp_link,
          calendlyLink: prog.calendly_link,
        });

        const now = new Date().toISOString();
        // Fetch all upcoming sessions
        const { data: sessions } = await (supabase.from("coaching_sessions" as any) as any)
          .select("scheduled_date, title, focus_label, meeting_link, session_number")
          .eq("program_id", prog.id)
          .in("status", ["scheduled", "planned"])
          .order("scheduled_date", { ascending: true, nullsFirst: false });

        if (sessions && sessions.length > 0) {
          // Pick first with a future date, or first without date
          const futureOnes = sessions.filter((s: any) => s.scheduled_date && s.scheduled_date >= now);
          const unscheduled = sessions.filter((s: any) => !s.scheduled_date);
          const next = futureOnes[0] || unscheduled[0] || null;
          setNextSession(next);
          setUpcomingCount(sessions.length);
        }
      }
    })();
  }, [user?.id, isDemoMode]);

  if (!data) return null;

  const openWhatsApp = () => {
    if (data.whatsappLink) window.open(data.whatsappLink, "_blank");
  };

  const openCalendly = () => {
    if (!data.calendlyLink) return;
    window.open(data.calendlyLink, "_blank");
  };

  const showJoinButton = nextSession?.scheduled_date &&
    (isToday(nextSession.scheduled_date) || isWithin24h(nextSession.scheduled_date));

  const sessionTitle = nextSession?.title || nextSession?.focus_label || `Session ${nextSession?.session_number}`;

  return (
    <div
      className="rounded-[20px] overflow-visible border border-primary/10 shadow-[var(--shadow-bento)] opacity-0 animate-reveal-up mb-6"
      style={{
        background: "linear-gradient(135deg, hsl(340 60% 97%), hsl(340 80% 92%))",
        animationDelay: `${animationDelay}s`,
        animationFillMode: "forwards",
      }}
    >
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-0 p-5 sm:p-6">
        {/* Mobile: photo on top */}
        <div className="sm:hidden flex justify-center mb-4">
          <img
            src={laetitiaPhoto}
            alt="Laetitia Mattioli"
            className="w-[120px] h-auto object-contain drop-shadow-md"
            loading="lazy"
          />
        </div>

        {/* Left: message + session + buttons */}
        <div className="flex-1 min-w-0">
          {/* ── Message ── */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">💬</span>
            <h3 className="font-heading text-sm font-bold text-foreground">Un mot de Laetitia</h3>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed mb-4 italic">
            "{data.message}"
          </p>

          <Separator className="bg-border/40 mb-4" />

          {/* ── Session ── */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">📅</span>
              <h4 className="font-heading text-sm font-bold text-foreground">
                {nextSession ? "Prochaine session" : "Sessions"}
              </h4>
            </div>

            {nextSession?.scheduled_date ? (
              /* State 1: session with date */
              <>
                <p className="text-sm text-foreground/80 mb-2.5">
                  {format(new Date(nextSession.scheduled_date), "EEEE d MMMM · HH'h'mm", { locale: fr })}
                  {" · "}
                  <span className="font-medium">{sessionTitle}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {showJoinButton && nextSession.meeting_link ? (
                    <Button
                      size="sm"
                      className="rounded-full gap-1.5 text-xs"
                      onClick={() => window.open(nextSession.meeting_link!, "_blank")}
                    >
                      <Video className="h-3.5 w-3.5" />
                      Rejoindre l'appel
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
                      onClick={openCalendly}
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      Modifier le créneau
                    </Button>
                  )}
                </div>
              </>
            ) : nextSession ? (
              /* State 2: session without date */
              <>
                <p className="text-sm text-foreground/80 mb-2.5">
                  Session à planifier · <span className="font-medium">{sessionTitle}</span>
                </p>
                <Button
                  size="sm"
                  className="rounded-full gap-1.5 text-xs"
                  onClick={openCalendly}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Réserver mon créneau
                </Button>
              </>
            ) : (
              /* State 3: no future sessions */
              <>
                <p className="text-sm text-muted-foreground mb-2.5">
                  Toutes tes sessions sont terminées pour l'instant.
                </p>
                <Button
                  size="sm"
                  className="rounded-full gap-1.5 text-xs"
                  onClick={openCalendly}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Réserver une session bonus
                </Button>
              </>
            )}

            {upcomingCount > 1 && (
              <button
                onClick={() => navigate("/accompagnement")}
                className="mt-2 text-xs text-primary font-medium hover:underline"
              >
                {upcomingCount - 1} autre{upcomingCount - 1 > 1 ? "s" : ""} session{upcomingCount - 1 > 1 ? "s" : ""} à venir · Voir tout →
              </button>
            )}
          </div>

          <Separator className="bg-border/40 mb-4" />

          {/* ── Permanent buttons ── */}
          <div className="flex flex-wrap gap-2">
            {data.whatsappLink && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
                onClick={openWhatsApp}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </Button>
            )}
            {data.calendlyLink && (
              <Button
                size="sm"
                className="rounded-full gap-1.5 text-xs"
                onClick={openCalendly}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Réserver une session
              </Button>
            )}
          </div>
        </div>

        {/* Desktop: photo on right */}
        <div className="hidden sm:block shrink-0 relative -mb-6 ml-4">
          <img
            src={laetitiaPhoto}
            alt="Laetitia Mattioli"
            className="w-[140px] h-auto object-contain drop-shadow-md"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
}
