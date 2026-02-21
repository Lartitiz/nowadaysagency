import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams, useLocation } from "react-router-dom";
import BrandingPrompt from "@/components/BrandingPrompt";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CANAL_FILTERS, type CalendarPost } from "@/lib/calendar-constants";
import { BalanceGauge } from "@/components/calendar/BalanceGauge";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { CalendarPostDialog } from "@/components/calendar/CalendarPostDialog";

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
  const [prefillData, setPrefillData] = useState<{ theme?: string; notes?: string } | null>(null);

  useEffect(() => {
    const urlCanal = searchParams.get("canal");
    if (urlCanal && CANAL_FILTERS.some((c) => c.id === urlCanal && c.enabled)) {
      setCanalFilter(urlCanal);
    }
    // Handle prefill from atelier/redaction
    const prefillTheme = searchParams.get("prefill_theme");
    const prefillContent = searchParams.get("prefill_content");
    if (prefillTheme) {
      const today = new Date().toISOString().split("T")[0];
      setSelectedDate(today);
      setPrefillData({ theme: prefillTheme, notes: prefillContent || "" });
      setDialogOpen(true);
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
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;
    const days: { date: Date; inMonth: boolean }[] = [];
    for (let i = startDow - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month, -i), inMonth: false });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push({ date: new Date(year, month, d), inMonth: true });
    }
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
    setDialogOpen(true);
  };

  const openEditDialog = (post: CalendarPost) => {
    setEditingPost(post);
    setSelectedDate(post.date);
    setDialogOpen(true);
  };

  const handleSave = async (data: { theme: string; angle: string | null; status: string; notes: string; canal: string; objectif: string | null }) => {
    if (!user || !selectedDate) return;
    if (editingPost) {
      await supabase.from("calendar_posts").update({
        theme: data.theme, angle: data.angle, status: data.status, notes: data.notes || null, canal: data.canal, objectif: data.objectif || null,
      }).eq("id", editingPost.id);
    } else {
      await supabase.from("calendar_posts").insert({
        user_id: user.id, date: selectedDate, theme: data.theme, angle: data.angle, status: data.status, notes: data.notes || null, canal: data.canal, objectif: data.objectif || null,
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

  const handleMovePost = async (postId: string, newDate: string) => {
    // Optimistic update
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, date: newDate } : p)));
    const { error } = await supabase
      .from("calendar_posts")
      .update({ date: newDate, updated_at: new Date().toISOString() })
      .eq("id", postId);
    if (error) {
      toast({ title: "Erreur lors du déplacement", variant: "destructive" });
      fetchPosts();
    } else {
      const formatted = new Date(newDate + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
      toast({ title: `Contenu déplacé au ${formatted}` });
    }
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const todayStr = new Date().toISOString().split("T")[0];
  const monthName = currentDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

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

        <BrandingPrompt section="strategie" />


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

        <BalanceGauge posts={filteredPosts} />

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

        <CalendarGrid
          calendarDays={calendarDays}
          postsByDate={postsByDate}
          todayStr={todayStr}
          isMobile={isMobile}
          onCreatePost={openCreateDialog}
          onEditPost={openEditDialog}
          onMovePost={handleMovePost}
        />

        <CalendarPostDialog
          open={dialogOpen}
          onOpenChange={(open) => { setDialogOpen(open); if (!open) setPrefillData(null); }}
          editingPost={editingPost}
          selectedDate={selectedDate}
          defaultCanal={canalFilter}
          onSave={handleSave}
          onDelete={handleDelete}
          prefillData={prefillData}
        />
      </main>
    </div>
  );
}
