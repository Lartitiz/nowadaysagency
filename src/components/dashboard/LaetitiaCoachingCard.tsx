import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import laetitiaPhoto from "@/assets/laetitia-portrait.png";

interface CoachingCardData {
  message: string;
  whatsappLink: string | null;
  calendlyLink: string | null;
}

const DEFAULT_MESSAGE = "N'hésite pas à m'écrire si tu as une question 💬";

export default function LaetitiaCoachingCard({ animationDelay = 0 }: { animationDelay?: number }) {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const [data, setData] = useState<CoachingCardData | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      setData({
        message: "Super session mardi ! J'ai débloqué tes livrables. Regarde ça quand tu peux 🌸",
        whatsappLink: "https://wa.me/33612345678",
        calendlyLink: "https://calendly.com/laetitia-mattioli/atelier-2h",
      });
      return;
    }
    if (!user?.id) return;

    (async () => {
      // RLS controls access — query any active program visible to this user
      const { data: prog } = await (supabase.from("coaching_programs" as any) as any)
        .select("dashboard_message, whatsapp_link, calendly_link")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (prog) {
        setData({
          message: prog.dashboard_message || DEFAULT_MESSAGE,
          whatsappLink: prog.whatsapp_link,
          calendlyLink: prog.calendly_link,
        });
      }
    })();
  }, [user?.id, isDemoMode]);

  if (!data) return null;

  const openWhatsApp = () => {
    if (data.whatsappLink) window.open(data.whatsappLink, "_blank");
  };

  const openCalendly = () => {
    if (!data.calendlyLink) return;
    const url = new URL(data.calendlyLink);
    window.open(url.toString(), "_blank");
  };

  return (
    <div
      className="rounded-[20px] overflow-visible border border-primary/10 shadow-[var(--shadow-bento)] opacity-0 animate-reveal-up mb-6"
      style={{
        background: "linear-gradient(135deg, hsl(340 60% 97%), hsl(340 80% 92%))",
        animationDelay: `${animationDelay}s`,
        animationFillMode: "forwards",
      }}
    >
      <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 p-5 sm:p-6">
        {/* Mobile: photo on top */}
        <div className="sm:hidden flex justify-center">
          <img
            src={laetitiaPhoto}
            alt="Laetitia Mattioli"
            className="w-[120px] h-auto object-contain drop-shadow-md"
          />
        </div>

        {/* Left: message + buttons */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">💬</span>
            <h3 className="font-heading text-sm font-bold text-foreground">Un mot de Laetitia</h3>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed mb-4 italic">
            "{data.message}"
          </p>
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
        <div className="hidden sm:block shrink-0 relative -mb-6">
          <img
            src={laetitiaPhoto}
            alt="Laetitia Mattioli"
            className="w-[140px] h-auto object-contain drop-shadow-md"
          />
        </div>
      </div>
    </div>
  );
}
