import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const CARDS = [
  { emoji: "👤", title: "Optimiser mon compte", desc: "Passe en pro, photo, nom, bio, URL.", to: "/pinterest/compte", tag: "Checklist" },
  { emoji: "🎨", title: "Mes tableaux", desc: "Crée et optimise tes tableaux.", to: "/pinterest/tableaux", tag: "Guide + IA" },
  { emoji: "🔎", title: "Mes mots-clés", desc: "Trouve les bons mots-clés SEO.", to: "/pinterest/mots-cles", tag: "IA" },
  { emoji: "📌", title: "Mes épingles", desc: "Crée des épingles optimisées.", to: "/pinterest/epingles", tag: "IA" },
  { emoji: "⏰", title: "Ma routine Pinterest", desc: "Ton rythme et ta checklist mensuelle.", to: "/pinterest/routine", tag: "Suivi" },
  { emoji: "💡", title: "Trouver des idées", desc: "Idées de contenu Pinterest.", to: "/atelier?canal=pinterest", tag: "IA" },
  { emoji: "📅", title: "Mon calendrier", desc: "Planifie tes épingles.", to: "/calendrier?canal=pinterest", tag: "Planning" },
];

export default function PinterestHub() {
  const { user } = useAuth();
  const [progress, setProgress] = useState({ profileSteps: 0, boardsCount: 0, pinsCount: 0, ideasCount: 0, calendarCount: 0 });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      const [profRes, boardRes, pinRes, ideasRes, calRes] = await Promise.all([
        supabase.from("pinterest_profile").select("pro_account_done, photo_done, name_done, bio_done, url_done").eq("user_id", user.id).maybeSingle(),
        supabase.from("pinterest_boards").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("pinterest_pins").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("saved_ideas").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("canal", "pinterest"),
        supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("canal", "pinterest").gte("date", monthStart).lte("date", monthEnd),
      ]);
      const pp = profRes.data;
      setProgress({
        profileSteps: pp ? [pp.pro_account_done, pp.photo_done, pp.name_done, pp.bio_done, pp.url_done].filter(Boolean).length : 0,
        boardsCount: boardRes.count || 0,
        pinsCount: pinRes.count || 0,
        ideasCount: ideasRes.count || 0,
        calendarCount: calRes.count || 0,
      });
    };
    load();
  }, [user]);

  const getLabel = (i: number): string | null => {
    switch (i) {
      case 0: return `${progress.profileSteps}/5 éléments`;
      case 1: return `${progress.boardsCount} tableau${progress.boardsCount !== 1 ? "x" : ""}`;
      case 2: return null;
      case 3: return `${progress.pinsCount} épingle${progress.pinsCount !== 1 ? "s" : ""}`;
      case 4: return null;
      case 5: return `${progress.ideasCount} idée${progress.ideasCount !== 1 ? "s" : ""}`;
      case 6: return `${progress.calendarCount} post${progress.calendarCount !== 1 ? "s" : ""} ce mois`;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-8 max-md:px-4">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6">
          <ArrowLeft className="h-4 w-4" /> Retour au hub
        </Link>
        <div className="mb-8">
          <h1 className="font-display text-[26px] sm:text-3xl font-bold text-foreground">📌 Mon Pinterest</h1>
          <p className="mt-2 text-sm text-muted-foreground">Pinterest c'est un moteur de recherche visuel. Chaque épingle peut ramener du trafic pendant des mois. On optimise tout ça.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map((card, idx) => {
            const label = getLabel(idx);
            return (
              <Link key={card.to} to={card.to} className="group relative rounded-2xl border border-border bg-card p-6 hover:border-primary hover:shadow-md transition-all">
                {label && <span className="absolute top-4 right-4 font-mono-ui text-[10px] font-semibold text-muted-foreground bg-rose-pale px-2 py-0.5 rounded-pill">{label}</span>}
                <span className="text-2xl mb-3 block">{card.emoji}</span>
                <h3 className="font-display text-lg font-bold text-foreground group-hover:text-primary transition-colors">{card.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{card.desc}</p>
                <span className="mt-3 inline-block font-mono-ui text-[10px] font-semibold text-primary bg-rose-pale px-2.5 py-0.5 rounded-pill">{card.tag}</span>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
