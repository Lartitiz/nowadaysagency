import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import BrandingPrompt from "@/components/BrandingPrompt";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CANAL_FILTERS, type CalendarPost } from "@/lib/calendar-constants";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { CalendarWeekGrid } from "@/components/calendar/CalendarWeekGrid";
import { CalendarPostDialog } from "@/components/calendar/CalendarPostDialog";
import { CalendarLegend } from "@/components/calendar/CalendarLegend";
import { CalendarCategoryFilters } from "@/components/calendar/CalendarCategoryFilters";
import { StoriesMixBanner } from "@/components/calendar/StoriesMixBanner";
import { CalendarIdeasSidebar } from "@/components/calendar/CalendarIdeasSidebar";
import { CalendarWeekHeader } from "@/components/calendar/CalendarWeekHeader";
import { DndContext, DragOverlay, closestCenter, type DragStartEvent, type DragEndEvent, useDroppable } from "@dnd-kit/core";

export default function CalendarPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const isInstagramRoute = location.pathname.startsWith("/instagram/");
  const [searchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">("week");
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [canalFilter, setCanalFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<CalendarPost | null>(null);
  const [prefillData, setPrefillData] = useState<{ theme?: string; notes?: string } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [mobileTab, setMobileTab] = useState<"calendar" | "ideas">("calendar");
  const [activeDragItem, setActiveDragItem] = useState<any>(null);
  const [postsPerWeek, setPostsPerWeek] = useState(3);

  useEffect(() => {
    const urlCanal = searchParams.get("canal");
    if (urlCanal && CANAL_FILTERS.some((c) => c.id === urlCanal && c.enabled)) {
      setCanalFilter(urlCanal);
    }
    const prefillTheme = searchParams.get("prefill_theme");
    const prefillContent = searchParams.get("prefill_content");
    if (prefillTheme) {
      const today = new Date().toISOString().split("T")[0];
      setSelectedDate(today);
      setPrefillData({ theme: prefillTheme, notes: prefillContent || "" });
      setDialogOpen(true);
    }
  }, [searchParams]);

  // Fetch posts target from communication_plans
  useEffect(() => {
    if (!user) return;
    supabase.from("communication_plans").select("instagram_posts_week").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if ((data as any)?.instagram_posts_week) setPostsPerWeek((data as any).instagram_posts_week as number); });
  }, [user?.id]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getWeekStart = (d: Date) => {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.getFullYear(), d.getMonth(), diff);
  };
  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  }), [weekStart]);

  const fetchPosts = useCallback(async () => {
    if (!user) return;
    let startDate: string, endDate: string;
    if (viewMode === "week") {
      startDate = weekDays[0].toISOString().split("T")[0];
      endDate = weekDays[6].toISOString().split("T")[0];
    } else {
      startDate = new Date(year, month, 1).toISOString().split("T")[0];
      endDate = new Date(year, month + 1, 0).toISOString().split("T")[0];
    }
    const { data } = await supabase
      .from("calendar_posts")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date");
    if (data) setPosts(data as CalendarPost[]);
  }, [user, year, month, viewMode, weekStart]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;
    const days: { date: Date; inMonth: boolean }[] = [];
    for (let i = startDow - 1; i >= 0; i--) days.push({ date: new Date(year, month, -i), inMonth: false });
    for (let d = 1; d <= lastDay.getDate(); d++) days.push({ date: new Date(year, month, d), inMonth: true });
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) for (let i = 1; i <= remaining; i++) days.push({ date: new Date(year, month + 1, i), inMonth: false });
    return days;
  }, [year, month]);

  const filteredPosts = useMemo(() => {
    let result = posts;
    if (canalFilter !== "all") result = result.filter((p) => p.canal === canalFilter);
    if (categoryFilter === "visibilite" || categoryFilter === "confiance" || categoryFilter === "vente") {
      result = result.filter((p) => p.category === categoryFilter);
    } else if (categoryFilter === "launch") {
      result = result.filter((p) => !!p.launch_id);
    } else if (categoryFilter === "a_rediger") {
      result = result.filter((p) => p.status === "a_rediger");
    }
    return result;
  }, [posts, canalFilter, categoryFilter]);

  const postsByDate = useMemo(() => {
    const map: Record<string, CalendarPost[]> = {};
    filteredPosts.forEach((p) => { if (!map[p.date]) map[p.date] = []; map[p.date].push(p); });
    return map;
  }, [filteredPosts]);

  // Week posts for header
  const weekPosts = useMemo(() => {
    return weekDays.flatMap(d => postsByDate[d.toISOString().split("T")[0]] || []);
  }, [weekDays, postsByDate]);

  const openCreateDialog = (dateStr: string) => {
    setSelectedDate(dateStr);
    setEditingPost(null);
    setDialogOpen(true);
  };

  const openEditDialog = (post: CalendarPost) => {
    // Route to the right generator based on format
    const fmt = post.format || (post as any).format_technique || "";
    if (fmt === "reel" || fmt === "post_carrousel" || fmt === "story_serie" || fmt === "story") {
      // These have dedicated content viewers in the dialog
    }
    setEditingPost(post);
    setSelectedDate(post.date);
    setDialogOpen(true);
  };

  const handleSave = async (data: { theme: string; angle: string | null; status: string; notes: string; canal: string; objectif: string | null; format?: string | null; content_draft?: string | null; accroche?: string | null }) => {
    if (!user || !selectedDate) return;
    const payload: any = {
      theme: data.theme, angle: data.angle, status: data.status, notes: data.notes || null,
      canal: data.canal, objectif: data.objectif || null,
      format: data.format || null, content_draft: data.content_draft || null, accroche: data.accroche || null,
    };
    if (editingPost) {
      await supabase.from("calendar_posts").update(payload).eq("id", editingPost.id);
    } else {
      await supabase.from("calendar_posts").insert({ ...payload, user_id: user.id, date: selectedDate });
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
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, date: newDate } : p)));
    const { error } = await supabase.from("calendar_posts")
      .update({ date: newDate, updated_at: new Date().toISOString() })
      .eq("id", postId);
    if (error) { toast({ title: "Erreur", variant: "destructive" }); fetchPosts(); }
    else {
      const formatted = new Date(newDate + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
      toast({ title: `Déplacé au ${formatted}` });
    }
  };

  // Drag & Drop handler that supports ideas from sidebar
  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === "idea") {
      setActiveDragItem({ type: "idea", idea: data.idea });
    } else {
      const post = posts.find(p => p.id === event.active.id);
      setActiveDragItem(post ? { type: "post", post } : null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragItem(null);
    const { active, over } = event;
    if (!over || !user) return;
    const newDate = over.id as string;
    const data = active.data.current;

    if (data?.type === "idea") {
      // Drop idea onto calendar
      const idea = data.idea;
      const { data: newPost } = await supabase.from("calendar_posts").insert({
        user_id: user.id,
        date: newDate,
        theme: idea.titre,
        status: "idea",
        canal: idea.canal || "instagram",
        objectif: idea.objectif,
        format: idea.format,
        notes: idea.notes,
        content_draft: idea.content_draft,
      }).select("id").single();
      if (newPost) {
        await supabase.from("saved_ideas").update({ calendar_post_id: newPost.id, planned_date: newDate }).eq("id", idea.id);
      }
      fetchPosts();
      toast({ title: `"${idea.titre}" planifié !` });
    } else {
      // Move existing post
      const postId = active.id as string;
      const currentPost = posts.find(p => p.id === postId);
      if (!currentPost || currentPost.date === newDate) return;
      handleMovePost(postId, newDate);
    }
  };

  const prevWeek = () => setCurrentDate(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7));
  const nextWeek = () => setCurrentDate(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7));
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const todayStr = new Date().toISOString().split("T")[0];
  const weekLabel = `Semaine du ${weekDays[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
  const monthName = currentDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const calendarContent = (
    <>
      {/* Canal filter */}
      <div className="flex gap-2 flex-wrap mb-4">
        {CANAL_FILTERS.map((ch) => (
          <button key={ch.id} onClick={() => ch.enabled && setCanalFilter(ch.id)} disabled={!ch.enabled}
            className={`whitespace-nowrap rounded-pill px-4 py-2 text-sm font-medium border transition-all shrink-0 ${
              canalFilter === ch.id ? "bg-primary text-primary-foreground border-primary"
                : ch.enabled ? "bg-card text-foreground border-border hover:border-primary/40"
                  : "bg-muted text-muted-foreground border-border opacity-60 cursor-not-allowed"}`}>
            {ch.label}{!ch.enabled && <span className="ml-1 text-xs">(Bientôt)</span>}
          </button>
        ))}
      </div>

      <CalendarCategoryFilters value={categoryFilter} onChange={setCategoryFilter} />
      <CalendarLegend />

      {/* View toggle + Navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="outline" size="icon" onClick={viewMode === "month" ? prevMonth : prevWeek} className="rounded-full">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex rounded-full border border-border overflow-hidden">
            <button onClick={() => setViewMode("week")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              Semaine
            </button>
            <button onClick={() => setViewMode("month")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              Mois
            </button>
          </div>
          <span className="font-display text-lg font-bold capitalize">
            {viewMode === "month" ? monthName : weekLabel}
          </span>
        </div>
        <Button variant="outline" size="icon" onClick={viewMode === "month" ? nextMonth : nextWeek} className="rounded-full">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Week header stats */}
      {viewMode === "week" && (
        <CalendarWeekHeader weekLabel={weekLabel} weekPosts={weekPosts} postsPerWeekTarget={postsPerWeek} />
      )}

      {viewMode === "month" ? (
        <CalendarGrid
          calendarDays={calendarDays} postsByDate={postsByDate} todayStr={todayStr} isMobile={isMobile}
          onCreatePost={openCreateDialog} onEditPost={openEditDialog} onMovePost={handleMovePost}
        />
      ) : (
        <>
          <StoriesMixBanner weekDays={weekDays} />
          <CalendarWeekGrid
            weekDays={weekDays} postsByDate={postsByDate} todayStr={todayStr} isMobile={isMobile}
            onCreatePost={openCreateDialog} onEditPost={openEditDialog} onMovePost={handleMovePost}
          />
        </>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[1400px] px-6 py-8 max-md:px-4">
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

        {/* Mobile tabs */}
        {isMobile && (
          <div className="flex rounded-full border border-border overflow-hidden mb-4">
            <button onClick={() => setMobileTab("calendar")}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${mobileTab === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              📅 Calendrier
            </button>
            <button onClick={() => setMobileTab("ideas")}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${mobileTab === "ideas" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              💡 Mes idées
            </button>
          </div>
        )}

        {isMobile ? (
          mobileTab === "calendar" ? calendarContent : (
            <CalendarIdeasSidebar onIdeaPlanned={fetchPosts} isMobile />
          )
        ) : (
          <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-6">
              {/* Calendar area (75%) */}
              <div className="flex-1 min-w-0">
                {calendarContent}
              </div>

              {/* Sidebar (25%) */}
              <div className="w-[280px] shrink-0">
                <div className="sticky top-24 border border-border rounded-2xl bg-card p-4 max-h-[calc(100vh-120px)] overflow-hidden flex flex-col">
                  <CalendarIdeasSidebar onIdeaPlanned={fetchPosts} />
                </div>
              </div>
            </div>

            {/* Drag overlay */}
            <DragOverlay>
              {activeDragItem ? (
                <div className="bg-card border border-primary/40 rounded-lg px-3 py-2 shadow-lg text-xs font-medium max-w-[180px]">
                  <span className="truncate block">
                    {activeDragItem.type === "idea"
                      ? `💡 ${activeDragItem.idea.titre}`
                      : `${activeDragItem.post?.content_type_emoji || ""} ${activeDragItem.post?.theme}`
                    }
                  </span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

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
