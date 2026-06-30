import { useState, useEffect, useMemo, useCallback } from "react";
import { LocalErrorBoundary } from "@/components/LocalErrorBoundary";
import { toLocalDateStr } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { useProfile } from "@/hooks/use-profile";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import BrandingPrompt from "@/components/BrandingPrompt";
import { useDemoContext } from "@/contexts/DemoContext";

import AuditRecommendationBanner from "@/components/AuditRecommendationBanner";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronLeft, ChevronRight, Sparkles, Download, Link2, PenLine, FileInput, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarShareDialog } from "@/components/calendar/CalendarShareDialog";

import CalendarCoachingDialog from "@/components/calendar/CalendarCoachingDialog";
import { CANAL_FILTERS, STATUS_LABELS, type CalendarPost } from "@/lib/calendar-constants";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { CalendarWeekGrid } from "@/components/calendar/CalendarWeekGrid";
import { CalendarPostDialog } from "@/components/calendar/CalendarPostDialog";
import { CalendarFilterBar } from "@/components/calendar/CalendarFilterBar";
import { useAllSeriesMap } from "@/hooks/use-active-series";
import { SkeletonCard } from "@/components/ui/skeleton-card";

import { CalendarIdeasSidebar, type SavedIdea } from "@/components/calendar/CalendarIdeasSidebar";
import { IdeaDetailSheet } from "@/components/calendar/IdeaDetailSheet";
import { WeekDashboard } from "@/components/calendar/WeekDashboard";
import { QuickBatchAdd } from "@/components/calendar/QuickBatchAdd";
import { ImportContentDialog } from "@/components/calendar/ImportContentDialog";
import { lazy, Suspense } from "react";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
const CalendarDndWrapper = lazy(() => import("@/components/calendar/CalendarDndWrapper"));

/** Map a calendar post format to the correct generator route */
function getGeneratorRoute(post: CalendarPost): string | null {
  const fmt = post.format || "";
  const isStories = !!(post.stories_count || post.stories_sequence_id || post.stories_structure);

  if (isStories || fmt === "story" || fmt === "story_serie") return "/creer?format=story";
  if (fmt === "reel") return "/creer?format=reel";
  if (fmt === "carousel" || fmt === "post_carrousel") return "/creer?format=carousel";
  if (fmt === "linkedin") return "/creer?canal=linkedin";
  if (fmt === "newsletter" || fmt === "newsletter_standard") return "/creer";
  if (fmt === "post" || fmt === "post_photo") return "/creer";

  // If generated_content_type is set, use that
  const gct = post.generated_content_type || "";
  if (gct === "carousel") return "/creer?format=carousel";
  if (gct === "reel") return "/creer?format=reel";
  if (gct === "story") return "/creer?format=story";
  if (gct === "linkedin") return "/creer?canal=linkedin";

  return null; // fallback to dialog
}

function makePostToRow(seriesNameById: Record<string, string>) {
  return (p: CalendarPost) => {
    const sid = (p as any).series_id as string | null | undefined;
    const ep = (p as any).episode_number as number | null | undefined;
    return {
      Date: p.date, Thème: p.theme, Canal: p.canal, Format: p.format || "",
      Objectif: p.objectif || (p as any).category || "", Statut: STATUS_LABELS[p.status] || p.status,
      Série: sid ? (seriesNameById[sid] || "") : "",
      Épisode: ep ?? "",
      Notes: p.notes || "", Brouillon: (p.content_draft || "").slice(0, 200),
    };
  };
}

function fileDate() { return new Date().toISOString().slice(0, 10); }

function autoWidth(ws: any, rows: Record<string, any>[]) {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  ws["!cols"] = keys.map(k => ({ wch: Math.min(40, Math.max(k.length, ...rows.map(r => String(r[k] || "").length))) }));
}

function ExportSection({ filteredPosts, canalFilter, onCoachingOpen, onQuickBatchOpen, onImportOpen, seriesNameById }: {
  filteredPosts: CalendarPost[];
  canalFilter: string;
  onCoachingOpen: () => void;
  onQuickBatchOpen: () => void;
  onImportOpen: () => void;
  seriesNameById: Record<string, string>;
}) {
  const postToRow = makePostToRow(seriesNameById);
  const [shareOpen, setShareOpen] = useState(false);

  const exportCSV = () => {
    if (filteredPosts.length === 0) { toast("Aucun contenu à exporter pour cette période."); return; }
    const rows = filteredPosts.map(postToRow);
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(";"), ...rows.map(r => headers.map(h => `"${String((r as any)[h]).replace(/"/g, '""')}"`).join(";"))];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `calendrier-nowadays-${fileDate()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportXLSX = async () => {
    if (filteredPosts.length === 0) { toast("Aucun contenu à exporter pour cette période."); return; }
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    if (canalFilter === "all") {
      const canals = [...new Set(filteredPosts.map(p => p.canal))];
      canals.forEach(canal => {
        const rows = filteredPosts.filter(p => p.canal === canal).map(postToRow);
        const ws = XLSX.utils.json_to_sheet(rows);
        autoWidth(ws, rows);
        XLSX.utils.book_append_sheet(wb, ws, canal.slice(0, 31));
      });
    } else {
      const rows = filteredPosts.map(postToRow);
      const ws = XLSX.utils.json_to_sheet(rows);
      autoWidth(ws, rows);
      XLSX.utils.book_append_sheet(wb, ws, "Posts");
    }
    XLSX.writeFile(wb, `calendrier-nowadays-${fileDate()}.xlsx`);
  };

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">
          📅 Mon calendrier éditorial
        </h1>
        <p className="mt-1 text-base text-muted-foreground">Planifie tes contenus, visualise ta semaine, ne te demande plus jamais « je poste quoi aujourd'hui ».</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-full gap-1.5" aria-label="Plus d'actions">
              <MoreHorizontal className="h-4 w-4" /> Plus
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => setShareOpen(true)} className="cursor-pointer gap-2">
              <Link2 className="h-4 w-4" /> Partager
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onImportOpen} className="cursor-pointer gap-2">
              <FileInput className="h-4 w-4" /> Importer un contenu
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={exportXLSX} className="cursor-pointer gap-2">
              <Download className="h-4 w-4" /> Exporter en Excel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportCSV} className="cursor-pointer gap-2">
              <Download className="h-4 w-4" /> Exporter en CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={onQuickBatchOpen}>
          <PenLine className="h-3.5 w-3.5" /> Ajout rapide
        </Button>
        <Button onClick={onCoachingOpen} className="shrink-0 gap-1.5 rounded-full" size="sm">
          <Sparkles className="h-3.5 w-3.5" /> Planifier ma semaine
        </Button>
      </div>
      <CalendarShareDialog open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}

export default function CalendarPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const { isDemoMode, demoData } = useDemoContext();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const isInstagramRoute = location.pathname.startsWith("/instagram/");
  const [searchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(() => {
    const dateParam = searchParams.get("date");
    if (dateParam) {
      const parsed = new Date(dateParam + "T00:00:00");
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  });
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [ideasRefreshKey, setIdeasRefreshKey] = useState(0);
  const [canalFilter, setCanalFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<CalendarPost | null>(null);
  const [prefillData, setPrefillData] = useState<{ theme?: string; notes?: string } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [seriesFilter, setSeriesFilter] = useState<string>("all");
  const [mobileTab, setMobileTab] = useState<"calendar" | "ideas">("calendar");
  const [activeDragItem, setActiveDragItem] = useState<any>(null);
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const [selectedIdea, setSelectedIdea] = useState<SavedIdea | null>(null);
  const [ideaDetailOpen, setIdeaDetailOpen] = useState(false);
  const [coachingOpen, setCoachingOpen] = useState(false);
  const [ideasCollapsed, setIdeasCollapsed] = useState(true);
  const [quickBatchOpen, setQuickBatchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importDate, setImportDate] = useState<string | null>(null);
  const [importFiles, setImportFiles] = useState<File[] | null>(null);

  const { data: profileData } = useProfile();
  const ownerName = (profileData as any)?.prenom || "";
  const igUsername = (profileData as any)?.instagram_username || "";

  useEffect(() => {
    const urlCanal = searchParams.get("canal");
    if (urlCanal && CANAL_FILTERS.some((c) => c.id === urlCanal && c.enabled)) {
      setCanalFilter(urlCanal);
    }
    const urlSerie = searchParams.get("serie");
    if (urlSerie) setSeriesFilter(urlSerie);
    const prefillTheme = searchParams.get("prefill_theme");
    const prefillContent = searchParams.get("prefill_content");
    if (prefillTheme) {
      const today = toLocalDateStr(new Date());
      setSelectedDate(today);
      setPrefillData({ theme: prefillTheme, notes: prefillContent || "" });
      setDialogOpen(true);
      // Clean up the params so reopening doesn't re-trigger
      const next = new URLSearchParams(searchParams);
      next.delete("prefill_theme");
      next.delete("prefill_content");
      navigate({ search: next.toString() }, { replace: true });
    }
    if (searchParams.get("coaching") === "1") {
      setCoachingOpen(true);
    }
    // Ouverture directe de l'import depuis le dashboard (/calendrier?import=1)
    if (searchParams.get("import") === "1") {
      const d = searchParams.get("date");
      if (d) setImportDate(d);
      setImportOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("import");
      navigate({ search: next.toString() }, { replace: true });
    }
  }, [searchParams]);

  // Fetch all series names (for badge display)
  const { data: seriesNameById = {} } = useAllSeriesMap();

  // Sync seriesFilter to URL
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (seriesFilter && seriesFilter !== "all") next.set("serie", seriesFilter);
    else next.delete("serie");
    if (next.toString() !== searchParams.toString()) {
      navigate({ search: next.toString() }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesFilter]);

  // Fetch posts target from communication_plans
  useEffect(() => {
    if (!user) return;
    (supabase.from("communication_plans") as any).select("instagram_posts_week").eq(column, value).maybeSingle()
      .then(({ data }) => { if ((data as any)?.instagram_posts_week) setPostsPerWeek((data as any).instagram_posts_week as number); });
  }, [user?.id, column, value]);

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
    setPostsLoading(true);
    try {
    if (isDemoMode && demoData) {
      // Build demo posts from demoData.calendar_posts
      const demoPosts: CalendarPost[] = (demoData as any).calendar_posts
        .filter((p: any) => p.planned_day)
        .map((p: any, i: number) => ({
          id: `demo-post-${i}`,
          user_id: "demo",
          date: p.planned_day,
          theme: p.title,
          format: p.format,
          objectif: p.objective,
          canal: "instagram",
          status: i === 0 ? "published" : "idea",
          angle: null,
          notes: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as unknown as CalendarPost));
      setPosts(demoPosts);
      return;
    }
    if (!user) { return; }

    // Vue mois ou semaine : on récupère les posts de la période visible.
    let startDate: string, endDate: string;
    if (viewMode === "week") {
      startDate = toLocalDateStr(weekDays[0]);
      endDate = toLocalDateStr(weekDays[6]);
    } else {
      startDate = toLocalDateStr(new Date(year, month, 1));
      endDate = toLocalDateStr(new Date(year, month + 1, 0));
    }
    const { data } = await (supabase.from("calendar_posts") as any)
      .select("*").eq(column, value)
      .gte("date", startDate).lte("date", endDate)
      .order("date");
    if (data) setPosts(data as CalendarPost[]);
    } finally {
      setPostsLoading(false);
    }
  }, [user, year, month, viewMode, weekStart, isDemoMode, column, value]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Open post dialog from ?post=ID query param
  useEffect(() => {
    const postId = searchParams.get("post");
    if (!postId || postsLoading || posts.length === 0) return;
    const target = posts.find((p) => p.id === postId);
    if (target) {
      setEditingPost(target);
      setSelectedDate(target.date);
      setDialogOpen(true);
      // Clean up the params so reopening doesn't re-trigger
      const next = new URLSearchParams(searchParams);
      next.delete("post");
      next.delete("date");
      navigate({ search: next.toString() }, { replace: true });
    }
  }, [posts, postsLoading, searchParams]);

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
    if (["visibilite", "confiance", "vente", "credibilite"].includes(categoryFilter)) {
      // L'objectif peut être stocké dans `objectif` (dialog) ou `category` (flux Créer) — on couvre les deux.
      result = result.filter((p) => p.objectif === categoryFilter || p.category === categoryFilter);
    } else if (categoryFilter === "launch") {
      result = result.filter((p) => !!p.launch_id);
    } else if (categoryFilter === "a_rediger") {
      result = result.filter((p) => p.status === "a_rediger");
    }
    if (seriesFilter === "none") result = result.filter((p) => !(p as any).series_id);
    else if (seriesFilter !== "all") result = result.filter((p) => (p as any).series_id === seriesFilter);
    return result;
  }, [posts, canalFilter, categoryFilter, seriesFilter]);

  // Counts per series across all posts (not yet filtered) for the filter chip
  const seriesCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of posts) {
      const sid = (p as any).series_id;
      if (sid) map[sid] = (map[sid] || 0) + 1;
    }
    return map;
  }, [posts]);

  const postsByDate = useMemo(() => {
    const map: Record<string, CalendarPost[]> = {};
    filteredPosts.forEach((p) => { if (!map[p.date]) map[p.date] = []; map[p.date].push(p); });
    return map;
  }, [filteredPosts]);

  const weekPosts = useMemo(() => {
    return weekDays.flatMap(d => postsByDate[toLocalDateStr(d)] || []);
  }, [weekDays, postsByDate]);

  /** Open the import dialog (contenu déjà prêt). Optional date (day "+" menu) + files (drop on a cell). */
  const openImportDialog = (dateStr?: string, files?: File[]) => {
    setImportDate(dateStr || null);
    setImportFiles(files && files.length > 0 ? files : null);
    setImportOpen(true);
  };

  /** Open dialog for creating a new post via the "Juste une idée" flow */
  const openCreateDialog = (dateStr: string) => {
    setSelectedDate(dateStr);
    setEditingPost(null);
    setDialogOpen(true);
  };

  /** Click on an existing post: always open the detail dialog first */
  const handlePostClick = (post: CalendarPost) => {
    setEditingPost(post);
    setSelectedDate(post.date);
    setDialogOpen(true);
  };

  type PostFormData = { theme: string; angle: string | null; status: string; notes: string; canal: string; objectif: string | null; format?: string | null; content_draft?: string | null; accroche?: string | null; media_urls?: string[] | null; series_id?: string | null; episode_number?: number | null };

  const buildPostPayload = (data: PostFormData) => ({
    theme: data.theme, angle: data.angle, status: data.status, notes: data.notes || null,
    canal: data.canal, objectif: data.objectif || null,
    format: data.format || null, content_draft: data.content_draft || null, accroche: data.accroche || null,
    media_urls: data.media_urls || null,
    series_id: data.series_id || null, episode_number: data.episode_number ?? null,
  });

  // Auto-save SILENCIEUX : ne ferme pas le dialog, ne toast pas. Met à jour si on a déjà un id,
  // sinon insère UNE fois et renvoie le post créé (le dialog mémorise son id pour les saves suivants).
  const handleAutoSave = async (data: PostFormData, existingId: string | null): Promise<{ post?: CalendarPost; error?: boolean }> => {
    if (!user || !selectedDate) return { error: true };
    const payload: any = buildPostPayload(data);
    const targetId = existingId ?? editingPost?.id ?? null;
    if (targetId) {
      const { error } = await supabase.from("calendar_posts").update(payload).eq("id", targetId);
      if (error) return { error: true };
      fetchPosts();
      return {};
    }
    const { data: inserted, error } = await supabase.from("calendar_posts")
      .insert({ ...payload, user_id: user.id, workspace_id: workspaceId !== user.id ? workspaceId : undefined, date: selectedDate })
      .select().single();
    if (error || !inserted) return { error: true };
    fetchPosts();
    return { post: inserted as CalendarPost };
  };

  const handleSave = async (data: PostFormData, id?: string | null) => {
    if (!user || !selectedDate) return;
    const payload: any = buildPostPayload(data);
    const targetId = id ?? editingPost?.id ?? null;
    let error;
    let createdPost: CalendarPost | null = null;
    if (targetId) {
      ({ error } = await supabase.from("calendar_posts").update(payload).eq("id", targetId));
    } else {
      const { data: inserted, error: insertError } = await supabase.from("calendar_posts")
        .insert({ ...payload, user_id: user.id, workspace_id: workspaceId !== user.id ? workspaceId : undefined, date: selectedDate })
        .select()
        .single();
      error = insertError;
      createdPost = (inserted as CalendarPost) || null;
    }
    if (error) {
      toast.error("Oups, ça n'a pas été enregistré", { description: "Réessaie dans un instant." });
      fetchPosts();
      return;
    }
    setDialogOpen(false);
    fetchPosts();
    if (targetId) {
      toast.success("Post modifié !");
    } else {
      toast.success("Post ajouté au calendrier !", {
        action: createdPost ? {
          label: "✨ Générer",
          onClick: () => handleQuickGenerate(createdPost!),
        } : undefined,
      });
    }
  };

  const handleDelete = async (id?: string | null) => {
    const targetId = id ?? editingPost?.id ?? null;
    if (!targetId) { setDialogOpen(false); return; }
    // Posts liés (créés ensemble par un import multi-réseaux) : proposer de tout supprimer.
    const target = posts.find((p) => p.id === targetId);
    const groupId = (target as any)?.group_id || null;
    const siblings = groupId ? posts.filter((p) => (p as any).group_id === groupId && p.id !== targetId) : [];
    let ids = [targetId];
    if (siblings.length > 0) {
      const also = await confirm({
        title: "Supprimer aussi les posts liés ?",
        description: `Ce contenu est lié à ${siblings.length} autre(s) post(s) (${siblings.map((p) => p.canal).join(", ")}).`,
        confirmText: "Tout supprimer",
        cancelText: "Ce post seulement",
        destructive: true,
      });
      if (also) ids = [targetId, ...siblings.map((p) => p.id)];
    }
    const { error } = await supabase.from("calendar_posts").delete().in("id", ids);
    if (error) {
      toast.error("Oups, ça n'a pas été enregistré", { description: "Réessaie dans un instant." });
      fetchPosts();
      return;
    }
    setDialogOpen(false);
    fetchPosts();
    toast.success(ids.length > 1 ? `${ids.length} posts supprimés` : "Post supprimé");
  };

  const handleQuickCreate = async (dateStr: string, title: string) => {
    if (!user) return;
    const { data, error } = await supabase.from("calendar_posts").insert({
      user_id: user.id,
      workspace_id: workspaceId !== user.id ? workspaceId : undefined,
      date: dateStr,
      theme: title,
      status: "idea",
      canal: canalFilter !== "all" ? canalFilter : "instagram",
    }).select().single();

    if (!error && data) {
      setPosts(prev => [...prev, data as CalendarPost]);
      toast.success("💡 Idée ajoutée !", { description: title });
    }
  };

  const handleQuickStatusChange = async (postId: string, newStatus: string) => {
    const { error } = await supabase.from("calendar_posts").update({ status: newStatus }).eq("id", postId);
    if (error) {
      toast.error("Oups, ça n'a pas été enregistré", { description: "Réessaie dans un instant." });
      fetchPosts();
      return;
    }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: newStatus } : p));
    toast(STATUS_LABELS[newStatus] || newStatus);
  };

  const handleQuickDuplicate = async (post: CalendarPost) => {
    if (!user) return;
    const { data: dupData, error } = await supabase.from("calendar_posts").insert({
      user_id: user.id,
      date: post.date,
      theme: `${post.theme} (copie)`,
      status: "idea",
      canal: post.canal,
      objectif: post.objectif,
      format: post.format,
      notes: post.notes,
      angle: post.angle,
      content_draft: (post as any).content_draft ?? null,
      accroche: (post as any).accroche ?? null,
      media_urls: (post as any).media_urls ?? null,
      category: (post as any).category ?? null,
      ...(column !== "user_id" ? { [column]: value } : {}),
    }).select().single();
    if (!error && dupData) {
      setPosts(prev => [...prev, dupData as CalendarPost]);
      toast.success("📋 Post dupliqué !");
    } else {
      toast.error("Oups, ça n'a pas été enregistré", { description: "Réessaie dans un instant." });
    }
  };

  const handleQuickDelete = async (postId: string) => {
    if (!(await confirm({ title: "Supprimer ce post ?", confirmText: "Supprimer", destructive: true }))) return;
    const { error } = await supabase.from("calendar_posts").delete().eq("id", postId);
    if (error) {
      toast.error("Suppression impossible", { description: "Réessaie dans un instant." });
      return;
    }
    setPosts(prev => prev.filter(p => p.id !== postId));
    toast.success("🗑️ Post supprimé");
  };

  const handleQuickGenerate = (post: CalendarPost) => {
    const route = getGeneratorRoute(post);
    if (route) {
      const params = new URLSearchParams();
      params.set("calendar_id", post.id);
      if (post.theme) params.set("sujet", post.theme);
      if (post.objectif || post.category) params.set("objectif", post.objectif || post.category || "");
      params.set("from", "/calendrier");
      if (post.format === "newsletter" || post.format === "newsletter_standard" || post.canal === "newsletter") {
        params.set("format", "newsletter");
      }

      const sep = route.includes("?") ? "&" : "?";
      navigate(`${route}${sep}${params.toString()}`, { state: {
        fromCalendar: true,
        postId: post.id,
        calendarPostId: post.id,
        theme: post.theme,
        objectif: post.objectif || post.category || "",
        angle: post.angle || "",
        format: post.format || "",
        notes: post.notes || "",
        postDate: post.date,
        existingContent: post.content_draft || "",
        canal: post.canal || "instagram",
      } });
    } else {
      setEditingPost(post);
      setDialogOpen(true);
    }
  };

  const handleMovePost = async (postId: string, newDate: string) => {
    const originalPost = posts.find((p) => p.id === postId);
    const originalDate = originalPost?.date ?? null;
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, date: newDate } : p)));
    const { error } = await supabase.from("calendar_posts")
      .update({ date: newDate, updated_at: new Date().toISOString() })
      .eq("id", postId);
    if (error) { toast.error("Erreur"); fetchPosts(); }
    else {
      const formatted = new Date(newDate + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
      toast(`Déplacé au ${formatted}`, {
        action: originalDate && originalDate !== newDate ? {
          label: "Annuler",
          onClick: async () => {
            const { error: rollbackError } = await supabase.from("calendar_posts")
              .update({ date: originalDate, updated_at: new Date().toISOString() })
              .eq("id", postId);
            if (rollbackError) {
              toast.error("Oups, ça n'a pas été enregistré", { description: "Réessaie dans un instant." });
            }
            fetchPosts();
          },
        } : undefined,
      });
    }
  };

  /** Build idea insert payload from a calendar post, snapshotting carousel slides + visuals into content_data */
  const buildIdeaPayloadFromPost = async (post: CalendarPost) => {
    if (!user) return null;
    // Fetch latest carousel linked to this post (if any)
    const { data: carousel } = await supabase
      .from("generated_carousels")
      .select("slides, caption, hashtags, carousel_type, quality_score, hook_text, subject")
      .eq("calendar_post_id", post.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const contentData: Record<string, any> = {};
    if ((post as any).accroche) contentData.accroche = (post as any).accroche;
    if (post.content_draft) contentData.content = post.content_draft;

    if (carousel && Array.isArray((carousel as any).slides) && (carousel as any).slides.length > 0) {
      contentData.carousel = {
        slides: (carousel as any).slides,
        caption: (carousel as any).caption ?? null,
        hashtags: (carousel as any).hashtags ?? null,
        carousel_type: (carousel as any).carousel_type ?? null,
        quality_score: (carousel as any).quality_score ?? null,
        hook_text: (carousel as any).hook_text ?? null,
      };
      // Compat racine pour lecteurs existants (IdeaDetailSheet, etc.)
      contentData.slides = (carousel as any).slides;
      if ((carousel as any).caption) contentData.caption = (carousel as any).caption;
      if ((carousel as any).hashtags) contentData.hashtags = (carousel as any).hashtags;
    }

    if ((post as any).story_sequence_detail) {
      contentData.story_sequence_detail = (post as any).story_sequence_detail;
      if ((post as any).stories_count) contentData.stories_count = (post as any).stories_count;
      if ((post as any).stories_objective) contentData.stories_objective = (post as any).stories_objective;
      if ((post as any).stories_structure) contentData.stories_structure = (post as any).stories_structure;
      if ((post as any).stories_timing) contentData.stories_timing = (post as any).stories_timing;
    }

    const mediaUrls = (post as any).media_urls;
    if (Array.isArray(mediaUrls) && mediaUrls.length > 0) {
      contentData.media_urls = mediaUrls;
    }

    return {
      user_id: user.id,
      workspace_id: workspaceId !== user.id ? workspaceId : undefined,
      titre: post.theme,
      format: post.format || null,
      objectif: post.objectif || null,
      notes: post.notes || null,
      status: "to_explore",
      canal: post.canal || "instagram",
      content_draft: post.content_draft || null,
      angle: post.angle || "",
      series_id: (post as any).series_id ?? null,
      episode_number: (post as any).episode_number ?? null,
      content_data: Object.keys(contentData).length > 0 ? contentData : null,
    } as any;
  };

  /** Unplan a post: move it back to saved_ideas */
  const handleUnplan = async () => {
    if (!editingPost || !user) return;
    const payload = await buildIdeaPayloadFromPost(editingPost);
    if (!payload) return;
    const { error: insertError } = await supabase.from("saved_ideas").insert(payload);
    if (insertError) {
      toast.error("Oups, ça n'a pas été enregistré", { description: "Réessaie dans un instant." });
      fetchPosts();
      return;
    }
    // Delete calendar post
    await supabase.from("calendar_posts").delete().eq("id", editingPost.id);
    setDialogOpen(false);
    fetchPosts();
    // Refresh sidebar
    setIdeasRefreshKey(k => k + 1);
    toast.success("Remis en idée !");
  };

  const handleIdeaClick = (idea: SavedIdea) => {
    setSelectedIdea(idea);
    setIdeaDetailOpen(true);
  };

  const handleIdeaUpdated = () => {
    setIdeasRefreshKey(k => k + 1);
  };

  const handleIdeaPlannedFromSheet = () => {
    fetchPosts();
    setIdeasRefreshKey(k => k + 1);
  };

  // Unified Drag & Drop handler (sidebar ideas + calendar post moves)
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
    const data = active.data.current;
    const overId = over.id as string;

    // Drop on ideas sidebar = unplan
    if (overId === "ideas-sidebar") {
      if (data?.type === "idea") return; // already an idea
      const postId = active.id as string;
      const post = posts.find(p => p.id === postId);
      if (!post) return;
      const payload = await buildIdeaPayloadFromPost(post);
      if (!payload) return;
      await supabase.from("saved_ideas").insert(payload);
      await supabase.from("calendar_posts").delete().eq("id", post.id);
      fetchPosts();
      setIdeasRefreshKey(k => k + 1);
      toast.success("Remis en idée !");
      return;
    }

    const newDate = overId;

    if (data?.type === "idea") {
      const idea = data.idea;
      const { data: newPost } = await supabase.from("calendar_posts").insert({
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        date: newDate,
        theme: idea.titre,
        status: "idea",
        canal: idea.canal || "instagram",
        objectif: idea.objectif,
        format: idea.format,
        notes: idea.notes,
        content_draft: idea.content_draft,
        series_id: (idea as any).series_id ?? null,
        episode_number: (idea as any).episode_number ?? null,
      } as any).select("id").single();
      if (newPost) {
        await supabase.from("saved_ideas").update({ calendar_post_id: newPost.id, planned_date: newDate }).eq("id", idea.id);
      }
      fetchPosts();
      setIdeasRefreshKey(k => k + 1);
      toast.success(`"${idea.titre}" planifié !`);
    } else {
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
  const todayStr = toLocalDateStr(new Date());
  const weekLabel = `Semaine du ${weekDays[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
  const monthName = currentDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const calendarContent = (
    <>
      {/* Filtres regroupés (canal + objectif + série) */}
      <CalendarFilterBar
        canalFilter={canalFilter}
        onCanalChange={setCanalFilter}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        seriesFilter={seriesFilter}
        onSeriesChange={setSeriesFilter}
        seriesCounts={seriesCounts}
      />

      {/* View toggle + Navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="outline" size="icon" onClick={viewMode === "month" ? prevMonth : prevWeek} className="rounded-full" aria-label={viewMode === "month" ? "Mois précédent" : "Semaine précédente"}>
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
          <div className="flex items-center gap-2">
            {(() => {
              const now = new Date();
              const isCurrentMonth = now.getMonth() === month && now.getFullYear() === year;
              const isCurrentWeek = viewMode === "week" && weekStart.getTime() === getWeekStart(now).getTime();
              const isCurrent = viewMode === "month" ? isCurrentMonth : isCurrentWeek;
              return !isCurrent ? (
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} className="rounded-full text-xs px-3">
                  Aujourd'hui
                </Button>
              ) : null;
            })()}
            <span className="font-display text-lg font-bold capitalize">
              {viewMode === "month" ? monthName : weekLabel}
            </span>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={viewMode === "month" ? nextMonth : nextWeek} className="rounded-full" aria-label={viewMode === "month" ? "Mois suivant" : "Semaine suivante"}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>


      {postsLoading ? (
        <div className="space-y-3">
          <div className="h-10 rounded-lg bg-muted animate-pulse" />
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-24 rounded-[12px] bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      ) : viewMode === "month" ? (
        <CalendarGrid
          calendarDays={calendarDays} postsByDate={postsByDate} todayStr={todayStr} isMobile={isMobile}
          onCreatePost={openCreateDialog} onEditPost={handlePostClick} onMovePost={handleMovePost}
          onAddIdea={openCreateDialog}
          onImport={openImportDialog}
          seriesNameById={seriesNameById}
        />
      ) : (
        <>
          <WeekDashboard weekPosts={weekPosts} weekLabel={weekLabel} postsPerWeekTarget={postsPerWeek} onObjectifFilter={(obj) => setCategoryFilter(obj || "all")} />
          <CalendarWeekGrid
            weekDays={weekDays} postsByDate={postsByDate} todayStr={todayStr} isMobile={isMobile}
            onCreatePost={openCreateDialog} onEditPost={handlePostClick} onMovePost={handleMovePost}
            onAddIdea={openCreateDialog} onImport={openImportDialog} onQuickCreate={handleQuickCreate}
            onQuickStatusChange={handleQuickStatusChange}
            onQuickDuplicate={handleQuickDuplicate}
            onQuickDelete={handleQuickDelete}
            onQuickGenerate={handleQuickGenerate}
            onQuickAttachSeries={(post) => { setEditingPost(post); setSelectedDate(post.date); setDialogOpen(true); }}
            ownerUsername={igUsername}
            ownerDisplayName={ownerName}
            seriesNameById={seriesNameById}
          />
          
        </>
      )}
    </>
  );

  const body = (
    <>
      <AuditRecommendationBanner />
      <ExportSection filteredPosts={filteredPosts} canalFilter={canalFilter} onCoachingOpen={() => setCoachingOpen(true)} onQuickBatchOpen={() => setQuickBatchOpen(true)} onImportOpen={() => openImportDialog()} seriesNameById={seriesNameById} />

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
          <CalendarIdeasSidebar onIdeaPlanned={fetchPosts} onIdeaClick={handleIdeaClick} isMobile refreshKey={ideasRefreshKey} />
        )
      ) : (
        <Suspense fallback={<div className="flex gap-6"><div className="flex-1 min-w-0">{calendarContent}</div></div>}>
          <CalendarDndWrapper onDragStart={handleDragStart} onDragEnd={handleDragEnd} overlayContent={activeDragItem ? (
              <div className="bg-card border border-primary/40 rounded-lg px-3 py-2 shadow-lg text-xs font-medium max-w-[180px]">
                <span className="truncate block">
                  {activeDragItem.type === "idea"
                    ? `💡 ${activeDragItem.idea.titre}`
                    : `${activeDragItem.post?.content_type_emoji || ""} ${activeDragItem.post?.theme}`
                  }
                </span>
              </div>
            ) : null}>
            <div className="flex gap-6">
              <div className="flex-1 min-w-0">
                {calendarContent}
              </div>
              <div className={`shrink-0 transition-all duration-300 ${ideasCollapsed ? "w-10" : "w-[280px]"}`}>
                <div className="sticky top-24">
                  {ideasCollapsed ? (
                    <button
                      onClick={() => setIdeasCollapsed(false)}
                      className="w-10 py-3 rounded-xl border border-border bg-card flex flex-col items-center gap-1.5 hover:bg-muted hover:border-primary/40 transition-colors"
                      title="Afficher mes idées"
                      aria-label="Afficher le panneau d'idées"
                    >
                      <span className="text-base leading-none">💡</span>
                      <span className="text-2xs font-semibold text-muted-foreground [writing-mode:vertical-rl] rotate-180">
                        Mes idées
                      </span>
                    </button>
                  ) : (
                    <div className="relative border border-border rounded-2xl bg-card p-4 max-h-[calc(100vh-120px)] overflow-hidden flex flex-col">
                      <button
                        onClick={() => setIdeasCollapsed(true)}
                        className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Replier le panneau idées"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                      <CalendarIdeasSidebar onIdeaPlanned={fetchPosts} onIdeaClick={handleIdeaClick} refreshKey={ideasRefreshKey} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CalendarDndWrapper>
        </Suspense>
      )}

      <LocalErrorBoundary fallbackMessage="Erreur dans le dialogue de post.">
        <CalendarPostDialog
          open={dialogOpen}
          onOpenChange={(open) => { setDialogOpen(open); if (!open) setPrefillData(null); }}
          editingPost={editingPost}
          selectedDate={selectedDate}
          defaultCanal={canalFilter}
          onSave={handleSave}
          onAutoSave={handleAutoSave}
          onDelete={handleDelete}
          onUnplan={editingPost ? handleUnplan : undefined}
          onDateChange={(postId, newDate) => {
            handleMovePost(postId, newDate);
            setSelectedDate(newDate);
            if (editingPost) setEditingPost({ ...editingPost, date: newDate });
          }}
          prefillData={prefillData}
        />
      </LocalErrorBoundary>

      <IdeaDetailSheet
        idea={selectedIdea}
        open={ideaDetailOpen}
        onOpenChange={setIdeaDetailOpen}
        onUpdated={handleIdeaUpdated}
        onPlanned={handleIdeaPlannedFromSheet}
      />

      <CalendarCoachingDialog
        open={coachingOpen}
        onOpenChange={setCoachingOpen}
        onPostAdded={fetchPosts}
        existingPosts={weekPosts.map(p => ({ date: p.date, theme: p.theme, format: p.format || "post", canal: p.canal, objectif: p.objectif || null }))}
      />

      <QuickBatchAdd
        open={quickBatchOpen}
        onOpenChange={setQuickBatchOpen}
        weekStartDate={toLocalDateStr(weekStart)}
        defaultCanal={canalFilter !== "all" ? canalFilter : "instagram"}
        onPostsAdded={fetchPosts}
      />

      <ImportContentDialog
        open={importOpen}
        onOpenChange={(open) => { setImportOpen(open); if (!open) setImportFiles(null); }}
        selectedDate={importDate}
        defaultCanal={canalFilter !== "all" ? canalFilter : "instagram"}
        initialFiles={importFiles}
        onSaved={fetchPosts}
      />
    </>
  );

  if (embedded) {
    return <div>{body}</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main id="main-content" className="mx-auto max-w-[1400px] px-6 py-8 max-md:px-4">
        {isInstagramRoute && (
          <SubPageHeader parentLabel="Instagram" parentTo="/instagram" currentLabel="Calendrier éditorial" useFromParam />
        )}
        {body}
      </main>
    </div>
  );
}

