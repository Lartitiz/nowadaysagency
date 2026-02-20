import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Link } from "react-router-dom";
import { PenLine, Star, Search, Lightbulb, CalendarDays, Rocket } from "lucide-react";

interface CardDef {
  icon: React.ElementType;
  emoji: string;
  title: string;
  desc: string;
  to: string;
  tag: string;
}

const CARDS: CardDef[] = [
  { icon: PenLine, emoji: "✍️", title: "Optimiser ma bio", desc: "Première impression parfaite.", to: "/instagram/bio", tag: "Guide + IA" },
  { icon: Star, emoji: "⭐", title: "Stories à la une", desc: "Organise tes highlights.", to: "/instagram/highlights", tag: "Checklist" },
  { icon: Search, emoji: "🔍", title: "M'inspirer", desc: "Observe et apprends.", to: "/instagram/inspiration", tag: "Exercice" },
  { icon: Lightbulb, emoji: "💡", title: "Trouver des idées", desc: "Direction l'atelier.", to: "/instagram/idees?canal=instagram", tag: "IA" },
  { icon: CalendarDays, emoji: "📅", title: "Mon calendrier Insta", desc: "Planifie tes posts.", to: "/instagram/calendrier?canal=instagram", tag: "Planning" },
  { icon: Rocket, emoji: "🚀", title: "Préparer un lancement", desc: "Plan de lancement guidé.", to: "/instagram/lancement", tag: "Template + IA" },
];

interface ProgressData {
  bioCount: number;
  highlightSteps: number;
  inspirationCount: number;
  ideasCount: number;
  calendarCount: number;
  launchCount: number;
}

export default function InstagramHub() {
  const { user } = useAuth();
  const [progress, setProgress] = useState<ProgressData>({
    bioCount: 0, highlightSteps: 0, inspirationCount: 0,
    ideasCount: 0, calendarCount: 0, launchCount: 0,
  });

  useEffect(() => {
    if (!user) return;
    const fetchProgress = async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

      const [bioRes, highlightRes, inspoRes, ideasRes, calRes, launchRes] = await Promise.all([
        supabase.from("generated_posts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("highlight_categories").select("id, added_to_profile").eq("user_id", user.id),
        supabase.from("inspiration_accounts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("saved_ideas").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("canal", "instagram"),
        supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("canal", "instagram").gte("date", monthStart).lte("date", monthEnd),
        supabase.from("launches").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);

      const highlightData = highlightRes.data || [];
      const completedSteps = highlightData.filter((h: any) => h.added_to_profile).length;

      setProgress({
        bioCount: bioRes.count || 0,
        highlightSteps: completedSteps,
        inspirationCount: inspoRes.count || 0,
        ideasCount: ideasRes.count || 0,
        calendarCount: calRes.count || 0,
        launchCount: launchRes.count || 0,
      });
    };
    fetchProgress();
  }, [user]);

  const getProgressLabel = (index: number): string | null => {
    switch (index) {
      case 0: return progress.bioCount > 0 ? "✓ Faite" : "À faire";
      case 1: return `${progress.highlightSteps}/4 étapes`;
      case 2: return `${progress.inspirationCount}/3 comptes`;
      case 3: return `${progress.ideasCount} idée${progress.ideasCount !== 1 ? "s" : ""}`;
      case 4: return `${progress.calendarCount} post${progress.calendarCount !== 1 ? "s" : ""} ce mois`;
      case 5: return `${progress.launchCount} lancement${progress.launchCount !== 1 ? "s" : ""}`;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-8 max-md:px-4">
        <div className="mb-8">
          <h1 className="font-display text-[26px] sm:text-3xl font-bold text-bordeaux">Mon Instagram</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tout ce dont tu as besoin pour structurer et animer ton compte Instagram.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map((card, idx) => {
            const progressLabel = getProgressLabel(idx);
            return (
              <Link
                key={card.to}
                to={card.to}
                className="group relative rounded-2xl border border-border bg-card p-6 hover:border-primary hover:shadow-md transition-all"
              >
                {/* Progress indicator */}
                {progressLabel && (
                  <span className="absolute top-4 right-4 font-mono-ui text-[10px] font-semibold text-muted-foreground bg-rose-pale px-2 py-0.5 rounded-pill">
                    {progressLabel}
                  </span>
                )}
                <span className="text-2xl mb-3 block">{card.emoji}</span>
                <h3 className="font-display text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                  {card.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{card.desc}</p>
                {/* Tag */}
                <span className="mt-3 inline-block font-mono-ui text-[10px] font-semibold text-primary bg-rose-pale px-2.5 py-0.5 rounded-pill">
                  {card.tag}
                </span>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
