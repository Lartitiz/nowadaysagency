import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams, useLocation } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronLeft, ChevronRight, Plus, Trash2, X, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getGuide } from "@/lib/production-guides";

const ANGLES = [
  "Storytelling", "Mythe à déconstruire", "Coup de gueule", "Enquête / décryptage",
  "Conseil contre-intuitif", "Test grandeur nature", "Before / After",
  "Histoire cliente", "Regard philosophique", "Surf sur l'actu",
];

const STATUSES = [
  { id: "idea", label: "Idée" },
  { id: "drafting", label: "En rédaction" },
  { id: "ready", label: "Prêt à publier" },
  { id: "published", label: "Publié" },
];

const CANAL_FILTERS = [
  { id: "all", label: "Tout", enabled: true },
  { id: "instagram", label: "Instagram", enabled: true },
  { id: "linkedin", label: "LinkedIn", enabled: false },
  { id: "blog", label: "Blog", enabled: false },
];

interface CalendarPost {
  id: string;
  date: string;
  theme: string;
  angle: string | null;
  status: string;
  notes: string | null;
  canal: string;
}

const statusStyles: Record<string, string> = {
  idea: "bg-cal-idea border-cal-idea-border text-foreground",
  drafting: "bg-cal-drafting border-cal-drafting-border text-foreground",
  ready: "bg-cal-ready border-cal-ready-border text-foreground",
  published: "bg-cal-published border-cal-published-border text-foreground line-through",
};

export default function CalendarPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const location = useLocation();
  const isInstagramRoute = location.pathname.startsWith("/instagram/");
  const [searchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [canalFilter, setCanalFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<CalendarPost | null>(null);

  // Form state
  const [theme, setTheme] = useState("");
  const [angle, setAngle] = useState<string | null>(null);
  const [status, setStatus] = useState("idea");
  const [notes, setNotes] = useState("");
  const [postCanal, setPostCanal] = useState("instagram");

  // Pre-select canal filter from URL
  useEffect(() => {
    const urlCanal = searchParams.get("canal");
    if (urlCanal && CANAL_FILTERS.some((c) => c.id === urlCanal && c.enabled)) {
      setCanalFilter(urlCanal);
    }
  }, [searchParams]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const fetchPosts = async () => {
    if (!user) return;
    const startDate = new Date(year, month, 1).toISOString().split("T")[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split("T")[0];
    const { data } = await supabase
      .from("calendar_posts")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date");
    if (data) setPosts(data as CalendarPost[]);
  };

  useEffect(() => { fetchPosts(); }, [user, year, month]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startDow = firstDay.getDay() - 1; // Monday = 0
    if (startDow < 0) startDow = 6;

    const days: { date: Date; inMonth: boolean }[] = [];
    // Previous month padding
    for (let i = startDow - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month, -i), inMonth: false });
    }
    // Current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push({ date: new Date(year, month, d), inMonth: true });
    }
    // Next month padding
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        days.push({ date: new Date(year, month + 1, i), inMonth: false });
      }
    }
    return days;
  }, [year, month]);

  const filteredPosts = useMemo(() => {
    if (canalFilter === "all") return posts;
    return posts.filter((p) => p.canal === canalFilter);
  }, [posts, canalFilter]);

  const postsByDate = useMemo(() => {
    const map: Record<string, CalendarPost[]> = {};
    filteredPosts.forEach((p) => {
      if (!map[p.date]) map[p.date] = [];
      map[p.date].push(p);
    });
    return map;
  }, [filteredPosts]);

  const openCreateDialog = (dateStr: string) => {
    setSelectedDate(dateStr);
    setEditingPost(null);
    setTheme("");
    setAngle(null);
    setStatus("idea");
    setNotes("");
    setPostCanal(canalFilter !== "all" ? canalFilter : "instagram");
    setDialogOpen(true);
  };

  const openEditDialog = (post: CalendarPost) => {
    setEditingPost(post);
    setSelectedDate(post.date);
    setTheme(post.theme);
    setAngle(post.angle);
    setStatus(post.status);
    setNotes(post.notes || "");
    setPostCanal(post.canal || "instagram");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user || !selectedDate || !theme.trim()) return;
    if (editingPost) {
      await supabase.from("calendar_posts").update({
        theme, angle, status, notes: notes || null, canal: postCanal,
      }).eq("id", editingPost.id);
    } else {
      await supabase.from("calendar_posts").insert({
        user_id: user.id, date: selectedDate, theme, angle, status, notes: notes || null, canal: postCanal,
      });
    }
    setDialogOpen(false);
    fetchPosts();
    toast({ title: editingPost ? "Post modifié !" : "Post ajouté au calendrier !" });
  };

  const handleDelete = async () => {
    if (!editingPost) return;
    await supabase.from("calendar_posts").delete().eq("id", editingPost.id);
    setDialogOpen(false);
    fetchPosts();
    toast({ title: "Post supprimé" });
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const todayStr = new Date().toISOString().split("T")[0];
  const monthName = currentDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const guide = angle ? getGuide(angle) : null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[1100px] px-6 py-8 max-md:px-4">
        {isInstagramRoute && (
          <SubPageHeader parentLabel="Instagram" parentTo="/instagram" currentLabel="Calendrier éditorial" />
        )}
        <div className="mb-6">
          <h1 className="font-display text-[22px] sm:text-3xl md:text-4xl font-bold text-foreground">
            Mon calendrier éditorial
          </h1>
          <p className="mt-2 text-muted-foreground">Planifie et organise tes publications.</p>
        </div>

        {/* Canal filter */}
        <div className="flex gap-2 flex-wrap mb-5">
          {CANAL_FILTERS.map((ch) => (
            <button
              key={ch.id}
              onClick={() => ch.enabled && setCanalFilter(ch.id)}
              disabled={!ch.enabled}
              className={`whitespace-nowrap rounded-pill px-4 py-2 text-sm font-medium border transition-all shrink-0 ${
                canalFilter === ch.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : ch.enabled
                    ? "bg-card text-foreground border-border hover:border-primary/40"
                    : "bg-muted text-muted-foreground border-border opacity-60 cursor-not-allowed"
              }`}
            >
              {ch.label}
              {!ch.enabled && <span className="ml-1 text-xs">(Bientôt)</span>}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="outline" size="icon" onClick={prevMonth} className="rounded-full">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-display text-lg font-bold capitalize">{monthName}</span>
          <Button variant="outline" size="icon" onClick={nextMonth} className="rounded-full">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {isMobile ? (
          /* Mobile: list view */
          <div className="space-y-2">
            {calendarDays.filter((d) => d.inMonth).map((d) => {
              const dateStr = d.date.toISOString().split("T")[0];
              const dayPosts = postsByDate[dateStr] || [];
              const isToday = dateStr === todayStr;
              return (
                <div key={dateStr} className={`rounded-xl border p-3 ${isToday ? "bg-rose-pale border-primary/30" : "border-border"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                      {d.date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}
                    </span>
                    <button onClick={() => openCreateDialog(dateStr)} className="text-muted-foreground hover:text-primary">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {dayPosts.map((p) => (
                    <button key={p.id} onClick={() => openEditDialog(p)}
                      className={`w-full text-left rounded-md border px-2 py-1 text-[11px] font-medium truncate mb-1 ${statusStyles[p.status] || statusStyles.idea}`}>
                      {p.theme}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop: grid view */
          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-7 border-b border-border">
              {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
                <div key={d} className="px-2 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {d}
                </div>
              ))}
            </div>
            {/* Days grid */}
            <div className="grid grid-cols-7">
              {calendarDays.map((d, i) => {
                const dateStr = d.date.toISOString().split("T")[0];
                const dayPosts = postsByDate[dateStr] || [];
                const isToday = dateStr === todayStr;
                return (
                  <div key={i}
                    className={`min-h-[90px] border-b border-r border-border p-1.5 group relative ${!d.inMonth ? "opacity-40" : ""} ${isToday ? "bg-rose-pale" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium ${isToday ? "text-primary font-bold" : "text-foreground"}`}>
                        {d.date.getDate()}
                      </span>
                      {d.inMonth && (
                        <button onClick={() => openCreateDialog(dateStr)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {dayPosts.slice(0, 2).map((p) => (
                        <button key={p.id} onClick={() => openEditDialog(p)}
                          className={`w-full text-left rounded-md border px-1.5 py-0.5 text-[11px] font-medium truncate ${statusStyles[p.status] || statusStyles.idea}`}>
                          {p.theme}
                        </button>
                      ))}
                      {dayPosts.length > 2 && (
                        <span className="text-[10px] text-muted-foreground">+{dayPosts.length - 2} de plus</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display">
                {editingPost ? "Modifier le post" : "Ajouter un post"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Thème / sujet</label>
                <Input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="De quoi parle ce post ?" className="rounded-[10px] h-11" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Angle</label>
                <div className="flex flex-wrap gap-1.5">
                  {ANGLES.map((a) => (
                    <button key={a} onClick={() => setAngle(angle === a ? null : a)}
                      className={`rounded-pill px-3 py-1 text-xs font-medium border transition-all ${angle === a ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Statut</label>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => (
                    <button key={s.id} onClick={() => setStatus(s.id)}
                      className={`rounded-pill px-3 py-1 text-xs font-medium border transition-all ${status === s.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Notes (optionnel)</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Idées, brouillon, remarques..." className="rounded-[10px] min-h-[60px]" />
              </div>

              {/* Production guide */}
              {guide ? (
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors w-full">
                    <span>📝 Comment produire ce post</span>
                    <ChevronDown className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3">
                    <ol className="list-decimal list-inside space-y-2 text-[13px] leading-relaxed text-foreground">
                      {guide.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </CollapsibleContent>
                </Collapsible>
              ) : (
                <p className="text-xs italic text-muted-foreground">Choisis un angle pour débloquer le guide de production</p>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={!theme.trim()} className="flex-1 rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux">
                  Enregistrer
                </Button>
                {editingPost && (
                  <Button variant="outline" size="icon" onClick={handleDelete} className="rounded-full text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
