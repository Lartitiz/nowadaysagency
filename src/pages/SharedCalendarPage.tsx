import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft, ChevronRight, Loader2, MessageCircle, Send, AlertCircle,
  Check, X, Eye, ChevronDown, ArrowUpDown, Trash2
} from "lucide-react";
import { format, startOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths, isSameDay, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { SocialMockup } from "@/components/social-mockup/SocialMockup";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── Types ──

interface ShareData {
  id: string;
  label: string | null;
  canal_filter: string;
  show_content_draft: boolean;
  guest_name: string | null;
  guest_can_edit_status: boolean;
  guest_can_edit_wording: boolean;
  view_mode: string;
  show_columns: string[];
}

interface Post {
  id: string;
  date: string;
  theme: string;
  canal: string;
  format: string | null;
  objectif: string | null;
  status: string;
  notes: string | null;
  content_draft?: string | null;
  wording?: string | null;
  phase?: string | null;
  updated_at?: string;
}

interface Comment {
  id: string;
  calendar_post_id: string;
  share_id: string;
  author_name: string;
  author_role: string;
  content: string;
  is_resolved: boolean;
  created_at: string;
}

// ── Constants ──

const STATUS_OPTIONS = [
  { value: "idea", label: "Pas commencé", color: "bg-gray-100 text-gray-600", rowBg: "" },
  { value: "a_rediger", label: "À rédiger", color: "bg-gray-100 text-gray-600", rowBg: "" },
  { value: "drafting", label: "En cours", color: "bg-blue-100 text-blue-700", rowBg: "" },
  { value: "ready", label: "À valider", color: "bg-orange-100 text-orange-700", rowBg: "bg-orange-50/50" },
  { value: "draft_ready", label: "Validé", color: "bg-emerald-100 text-emerald-700", rowBg: "" },
  { value: "published", label: "Posté", color: "bg-emerald-200 text-emerald-800", rowBg: "" },
];

const getStatusInfo = (s: string) => STATUS_OPTIONS.find(o => o.value === s) || STATUS_OPTIONS[0];

const CANAL_COLORS: Record<string, { label: string; color: string }> = {
  instagram: { label: "Instagram", color: "bg-pink-100 text-pink-800" },
  linkedin: { label: "LinkedIn", color: "bg-sky-100 text-sky-800" },
  facebook: { label: "Facebook", color: "bg-indigo-100 text-indigo-800" },
  pinterest: { label: "Pinterest", color: "bg-red-100 text-red-800" },
  blog: { label: "Blog", color: "bg-teal-100 text-teal-800" },
  email: { label: "Email", color: "bg-emerald-100 text-emerald-700" },
  newsletter: { label: "Newsletter", color: "bg-emerald-100 text-emerald-700" },
};

const FORMAT_LABELS: Record<string, string> = {
  post_carrousel: "Carrousel",
  post_photo: "Photo",
  reel: "Reel",
  story: "Story",
  story_serie: "Série Stories",
  live: "Live",
  texte: "Texte",
  article: "Article",
  video: "Vidéo",
};

type PeriodMode = "week" | "month" | "all";
type SortKey = "date" | "status" | "canal";
type SortDir = "asc" | "desc";

// ── Helpers ──

const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const baseUrl = `https://${projectId}.supabase.co/functions/v1`;

function mapFormat(f: string | null): "post" | "carousel" | "reel" | "story" {
  if (f === "post_carrousel") return "carousel";
  if (f === "reel") return "reel";
  if (f === "story" || f === "story_serie") return "story";
  return "post";
}

function mapCanal(c: string): "instagram" | "linkedin" {
  return c === "linkedin" ? "linkedin" : "instagram";
}

function parseSlides(post: Post) {
  const draft = post.content_draft || post.wording;
  if (mapFormat(post.format) !== "carousel" || !draft) return undefined;
  try {
    const parsed = JSON.parse(draft);
    if (Array.isArray(parsed)) {
      return parsed.map((s: any, i: number) => ({
        title: s.title || s.titre || `Slide ${i + 1}`,
        body: s.body || s.texte || s.content || "",
        slideNumber: i + 1,
      }));
    }
  } catch { /* not JSON */ }
  const parts = draft.split(/(?:slide\s*\d+|---+|\n{3,})/i).filter(Boolean);
  if (parts.length > 1) {
    return parts.map((p: string, i: number) => ({
      title: p.split("\n")[0]?.trim() || `Slide ${i + 1}`,
      body: p.split("\n").slice(1).join("\n").trim(),
      slideNumber: i + 1,
    }));
  }
  return undefined;
}

// ══════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════

export default function SharedCalendarPage() {
  const { token } = useParams<{ token: string }>();
  const isMobile = useIsMobile();

  // Data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<ShareData | null>(null);
  const [profile, setProfile] = useState<{ prenom?: string; activite?: string }>({});
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Guest name
  const storageKey = `cal_guest_${token}`;
  const [guestName, setGuestName] = useState(() => localStorage.getItem(storageKey) || "");
  const [nameInput, setNameInput] = useState("");
  const hasName = !!(guestName || share?.guest_name);
  const effectiveName = guestName || share?.guest_name || "";

  // Navigation
  const [periodMode, setPeriodMode] = useState<PeriodMode>("week");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));

  // Filters
  const [filterCanal, setFilterCanal] = useState<string>("all");
  const [filterPhase, setFilterPhase] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Post detail
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [sending, setSending] = useState(false);
  const [revisionMode, setRevisionMode] = useState(false);
  const [revisionText, setRevisionText] = useState("");

  // Expanded wording rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Editing wording
  const [editingWording, setEditingWording] = useState<string | null>(null);
  const [editWordingValue, setEditWordingValue] = useState("");

  // Polling
  const pollingRef = useRef<ReturnType<typeof setInterval>>();

  // ── Data fetching ──

  const fetchData = useCallback(async (opts?: { ws?: Date; ms?: Date; pm?: PeriodMode }) => {
    if (!token) return;
    const pm = opts?.pm ?? periodMode;
    const params = new URLSearchParams({ token });

    if (pm === "week") {
      const ws = opts?.ws ?? weekStart;
      params.set("week_start", format(ws, "yyyy-MM-dd"));
    } else if (pm === "month") {
      const ms = opts?.ms ?? monthStart;
      params.set("month_start", format(ms, "yyyy-MM-dd"));
    } else {
      params.set("period", "all");
    }

    try {
      const res = await fetch(`${baseUrl}/public-calendar?${params}`);
      if (!res.ok) {
        setError(res.status === 404 ? "expired" : "error");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setShare(data.share);
      setProfile(data.profile || {});
      setPosts(data.posts || []);
      setComments(data.comments || []);
      setLastUpdated(data.last_updated || null);

      if (data.share?.guest_name && !guestName) {
        setGuestName(data.share.guest_name);
        localStorage.setItem(storageKey, data.share.guest_name);
      }
    } catch {
      setError("error");
    }
    setLoading(false);
  }, [token, periodMode, weekStart, monthStart, guestName, storageKey]);

  useEffect(() => {
    fetchData();
  }, [token]);

  // Polling every 60s
  useEffect(() => {
    pollingRef.current = setInterval(() => fetchData(), 60000);
    return () => clearInterval(pollingRef.current);
  }, [fetchData]);

  // ── Navigation ──

  const navigatePeriod = (dir: "prev" | "next") => {
    setLoading(true);
    if (periodMode === "week") {
      const nw = dir === "next" ? addWeeks(weekStart, 1) : subWeeks(weekStart, 1);
      setWeekStart(nw);
      fetchData({ ws: nw });
    } else if (periodMode === "month") {
      const nm = dir === "next" ? addMonths(monthStart, 1) : subMonths(monthStart, 1);
      setMonthStart(nm);
      fetchData({ ms: nm });
    }
  };

  const changePeriodMode = (pm: PeriodMode) => {
    setPeriodMode(pm);
    setLoading(true);
    fetchData({ pm });
  };

  // ── Guest name ──

  const confirmName = async () => {
    if (!nameInput.trim()) return;
    const name = nameInput.trim();
    setGuestName(name);
    localStorage.setItem(storageKey, name);
    // Also update server
    if (token) {
      fetch(`${baseUrl}/public-calendar?token=${encodeURIComponent(token)}&guest_name=${encodeURIComponent(name)}`).catch(() => {});
    }
  };

  // ── Filtering & sorting ──

  const uniqueCanals = useMemo(() => [...new Set(posts.map(p => p.canal))], [posts]);
  const uniquePhases = useMemo(() => [...new Set(posts.map(p => p.phase).filter(Boolean))], [posts]);
  const uniqueStatuses = useMemo(() => [...new Set(posts.map(p => p.status))], [posts]);

  const filteredPosts = useMemo(() => {
    let result = [...posts];
    if (filterCanal !== "all") result = result.filter(p => p.canal === filterCanal);
    if (filterPhase !== "all") result = result.filter(p => p.phase === filterPhase);
    if (filterStatus !== "all") result = result.filter(p => p.status === filterStatus);

    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else if (sortKey === "canal") cmp = a.canal.localeCompare(b.canal);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [posts, filterCanal, filterPhase, filterStatus, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  // ── Comment counts ──

  const getPostComments = (postId: string) => comments.filter(c => c.calendar_post_id === postId);
  const getUnresolvedCount = (postId: string) => getPostComments(postId).filter(c => !c.is_resolved).length;

  // ── To validate count ──

  const toValidateCount = useMemo(() => posts.filter(p => p.status === "ready").length, [posts]);
  const unresolvedTotal = useMemo(() => comments.filter(c => !c.is_resolved && !c.content.startsWith("[EDIT]")).length, [comments]);

  // ── Status edit ──

  const editStatus = async (post: Post, newStatus: string) => {
    const old = post.status;
    // Optimistic
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: newStatus } : p));

    try {
      await fetch(`${baseUrl}/public-calendar-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, post_id: post.id, field: "status", value: newStatus }),
      });
    } catch {
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: old } : p));
    }
  };

  // ── Wording edit ──

  const saveWording = async (post: Post, newWording: string) => {
    const old = post.content_draft;
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, content_draft: newWording, wording: newWording } : p));
    setEditingWording(null);

    try {
      await fetch(`${baseUrl}/public-calendar-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, post_id: post.id, field: "wording", value: newWording }),
      });
    } catch {
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, content_draft: old, wording: old } : p));
    }
  };

  // ── Validate all ──

  const validateAll = async () => {
    const toValidate = posts.filter(p => p.status === "ready");
    // Optimistic
    setPosts(prev => prev.map(p => p.status === "ready" ? { ...p, status: "draft_ready" } : p));

    for (const post of toValidate) {
      try {
        await fetch(`${baseUrl}/public-calendar-edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, post_id: post.id, field: "status", value: "draft_ready" }),
        });
      } catch { /* ignore */ }
    }
  };

  // ── Comments ──

  const sendComment = async (postId: string, content: string) => {
    if (!content.trim() || !token) return;
    setSending(true);

    const optimistic: Comment = {
      id: `temp-${Date.now()}`,
      calendar_post_id: postId,
      share_id: "",
      author_name: effectiveName || "Invité·e",
      author_role: "guest",
      content: content.trim(),
      is_resolved: false,
      created_at: new Date().toISOString(),
    };
    setComments(prev => [...prev, optimistic]);

    try {
      const res = await fetch(`${baseUrl}/public-calendar-comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          calendar_post_id: postId,
          author_name: effectiveName || "Invité·e",
          content: content.trim(),
        }),
      });
      if (res.ok) {
        const real = await res.json();
        setComments(prev => prev.map(c => c.id === optimistic.id ? real : c));
      }
    } catch { /* keep optimistic */ }
    setSending(false);
  };

  const handleValidatePost = () => {
    if (!selectedPost) return;
    sendComment(selectedPost.id, "[VALIDATION] Ce post est validé ✅");
  };

  const handleRevisionSubmit = () => {
    if (!revisionText.trim() || !selectedPost) return;
    sendComment(selectedPost.id, `[REVISION] ${revisionText.trim()}`);
    setRevisionMode(false);
    setRevisionText("");
  };

  // ── Scroll to first unresolved ──

  const scrollToFirstUnresolved = () => {
    const firstPost = posts.find(p => getUnresolvedCount(p.id) > 0);
    if (firstPost) {
      const el = document.getElementById(`post-row-${firstPost.id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // ══════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <div className="mb-6 text-2xl font-semibold" style={{ fontFamily: "'Libre Baskerville', serif" }}>Nowadays</div>
        <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
        <h1 className="text-lg font-semibold text-gray-800 mb-2" style={{ fontFamily: "'Libre Baskerville', serif" }}>
          Ce lien a expiré ou n'existe plus.
        </h1>
        <p className="text-sm text-gray-500 max-w-xs">Contacte la personne qui te l'a envoyé pour obtenir un nouveau lien.</p>
      </div>
    );
  }

  if (loading && !share) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const showColumns = share?.show_columns || ["theme", "status", "date", "wording", "canal", "format", "phase"];

  // ── Comment panel content ──

  const commentPanelContent = selectedPost ? (() => {
    const postComments = getPostComments(selectedPost.id).filter(c => !c.content.startsWith("[EDIT]"));
    const wording = selectedPost.content_draft || selectedPost.wording || selectedPost.theme;
    const slides = parseSlides(selectedPost);
    const hashtags = (wording.match(/#\w+/g) || []);

    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate" style={{ fontFamily: "'Libre Baskerville', serif" }}>
              {selectedPost.theme}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {format(parseISO(selectedPost.date), "d MMMM yyyy", { locale: fr })} · {CANAL_COLORS[selectedPost.canal]?.label || selectedPost.canal}
            </p>
          </div>
          <button onClick={() => setSelectedPost(null)} className="p-1 rounded hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50 space-y-4">
          {/* Social mockup preview */}
          <div className="flex justify-center">
            <SocialMockup
              canal={mapCanal(selectedPost.canal)}
              format={mapFormat(selectedPost.format)}
              username={profile.prenom || "user"}
              displayName={profile.prenom || "Utilisateur"}
              caption={wording}
              slides={slides}
              hashtags={hashtags}
              mediaUrls={(selectedPost as any).media_urls || []}
              showComments={false}
              readonly={true}
              compact={true}
              hideFollowButton
            />
          </div>

          {/* Wording complet */}
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              Wording complet
            </p>
            <p className="text-[13px] text-gray-800 leading-relaxed whitespace-pre-line">{wording}</p>
          </div>

          {/* Comments */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              Commentaires ({postComments.length})
            </p>
            {postComments.length === 0 && (
              <p className="text-xs text-gray-400 italic">Aucun commentaire pour l'instant</p>
            )}
            {postComments.map(c => (
              <div key={c.id} className={`bg-white rounded-lg border border-gray-200 p-2.5 ${c.is_resolved ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[11px] font-semibold text-gray-800">{c.author_name}</span>
                  <span className="text-[10px] text-gray-400">
                    {format(parseISO(c.created_at), "d MMM · HH:mm", { locale: fr })}
                  </span>
                  {c.is_resolved && <Check className="h-3 w-3 text-emerald-500" />}
                </div>
                <p className="text-[12px] text-gray-700 leading-relaxed">{c.content}</p>
              </div>
            ))}
          </div>

          {/* Validation buttons */}
          {hasName && (
            <div className="flex items-center justify-center gap-3">
              <Button onClick={handleValidatePost} disabled={sending} className="rounded-full gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4 h-9">
                <Check className="h-3.5 w-3.5" /> Validé
              </Button>
              <Button variant="outline" onClick={() => setRevisionMode(!revisionMode)} className="rounded-full gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50 text-xs px-4 h-9">
                <X className="h-3.5 w-3.5" /> À revoir
              </Button>
            </div>
          )}

          {revisionMode && (
            <div className="space-y-2">
              <Textarea
                placeholder="Qu'est-ce qu'il faut changer ?"
                value={revisionText}
                onChange={e => setRevisionText(e.target.value)}
                className="text-xs min-h-[60px] rounded-lg border-gray-300 resize-none bg-white"
              />
              <Button
                onClick={handleRevisionSubmit}
                disabled={!revisionText.trim() || sending}
                className="rounded-full text-xs h-8 bg-orange-600 hover:bg-orange-700 text-white w-full"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Envoyer la demande de révision"}
              </Button>
            </div>
          )}
        </div>

        {/* Comment input */}
        {hasName && <CommentInput onSend={(text) => sendComment(selectedPost.id, text)} sending={sending} />}

        {/* Name prompt */}
        {!hasName && (
          <div className="border-t border-gray-200 px-4 py-3 bg-white shrink-0">
            <p className="text-[11px] text-gray-500 mb-2">Pour commenter, dis-nous comment tu t'appelles :</p>
            <div className="flex gap-2">
              <Input placeholder="Ton prénom" value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === "Enter" && confirmName()} className="text-xs h-8 rounded-lg border-gray-300" />
              <Button size="sm" onClick={confirmName} disabled={!nameInput.trim()} className="h-8 text-xs rounded-lg bg-gray-900 text-white hover:bg-gray-800">OK</Button>
            </div>
          </div>
        )}
      </div>
    );
  })() : null;

  // ═══════════════════════════════════════════
  // PAGE LAYOUT
  // ═══════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-1" style={{ fontFamily: "'Libre Baskerville', serif" }}>Nowadays</p>
            <h1 className="text-lg sm:text-xl text-gray-900" style={{ fontFamily: "'Libre Baskerville', serif" }}>
              📅 Calendrier éditorial de {profile.prenom || "…"}
            </h1>
            {profile.activite && <p className="text-sm text-gray-500 mt-0.5">{profile.activite}</p>}
            {share?.label && <p className="text-xs text-gray-400 mt-1">{share.label}</p>}
            {lastUpdated && (
              <p className="text-[10px] text-gray-400 mt-1" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                Dernière mise à jour : {format(parseISO(lastUpdated), "d MMM yyyy · HH:mm", { locale: fr })}
              </p>
            )}
          </div>

          {!hasName ? (
            <div className="flex items-center gap-2 shrink-0">
              <Input placeholder="Comment tu t'appelles ?" value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === "Enter" && confirmName()} className="w-40 sm:w-52 text-sm h-9 rounded-lg border-gray-300" />
              <Button size="sm" onClick={confirmName} disabled={!nameInput.trim()} className="rounded-lg text-xs h-9 bg-gray-900 hover:bg-gray-800 text-white">C'est parti</Button>
            </div>
          ) : (
            <span className="text-sm text-gray-500 shrink-0 pt-1">👋 {effectiveName}</span>
          )}
        </div>
      </header>

      {/* Period + Filters */}
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-3 space-y-3">
        {/* Period selector */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-0.5">
            {(["week", "month", "all"] as PeriodMode[]).map(pm => (
              <button
                key={pm}
                onClick={() => changePeriodMode(pm)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${periodMode === pm ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
              >
                {pm === "week" ? "Cette semaine" : pm === "month" ? "Ce mois" : "Tout"}
              </button>
            ))}
          </div>

          {periodMode !== "all" && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigatePeriod("prev")} className="text-gray-600 hover:text-gray-900 h-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium text-gray-700 min-w-[140px] text-center" style={{ fontFamily: "'Libre Baskerville', serif" }}>
                {periodMode === "week"
                  ? `${format(weekStart, "d MMM", { locale: fr })} — ${format(new Date(weekStart.getTime() + 6 * 86400000), "d MMM yyyy", { locale: fr })}`
                  : format(monthStart, "MMMM yyyy", { locale: fr })
                }
              </span>
              <Button variant="ghost" size="sm" onClick={() => navigatePeriod("next")} className="text-gray-600 hover:text-gray-900 h-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {/* Canal filter */}
          {uniqueCanals.length > 1 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400 uppercase font-semibold mr-1" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Canal</span>
              <FilterChip label="Tout" active={filterCanal === "all"} onClick={() => setFilterCanal("all")} />
              {uniqueCanals.map(c => (
                <FilterChip key={c} label={CANAL_COLORS[c]?.label || c} active={filterCanal === c} onClick={() => setFilterCanal(c)} />
              ))}
            </div>
          )}
          {/* Status filter */}
          {uniqueStatuses.length > 1 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400 uppercase font-semibold mr-1" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Statut</span>
              <FilterChip label="Tous" active={filterStatus === "all"} onClick={() => setFilterStatus("all")} />
              {uniqueStatuses.map(s => (
                <FilterChip key={s} label={getStatusInfo(s).label} active={filterStatus === s} onClick={() => setFilterStatus(s)} />
              ))}
            </div>
          )}
          {/* Phase filter */}
          {uniquePhases.length > 1 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400 uppercase font-semibold mr-1" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Phase</span>
              <FilterChip label="Toutes" active={filterPhase === "all"} onClick={() => setFilterPhase("all")} />
              {uniquePhases.map(p => (
                <FilterChip key={p!} label={p!} active={filterPhase === p} onClick={() => setFilterPhase(p!)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 pb-24 flex-1">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-400">Aucun post pour cette période</p>
          </div>
        ) : isMobile ? (
          /* ── MOBILE CARDS ── */
          <div className="space-y-3">
            {filteredPosts.map(post => (
              <MobilePostCard
                key={post.id}
                post={post}
                share={share!}
                comments={getPostComments(post.id)}
                unresolvedCount={getUnresolvedCount(post.id)}
                onOpenComments={() => { setSelectedPost(post); setRevisionMode(false); setRevisionText(""); }}
                onEditStatus={share?.guest_can_edit_status ? (s) => editStatus(post, s) : undefined}
              />
            ))}
          </div>
        ) : (
          /* ── DESKTOP TABLE ── */
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="grid gap-0 border-b border-gray-200 bg-white sticky top-0 z-10"
              style={{
                gridTemplateColumns: buildGridCols(showColumns, !!share?.guest_can_edit_status),
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              {showColumns.includes("date") && (
                <TableHeader label="Date" sortKey="date" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              )}
              {showColumns.includes("theme") && (
                <TableHeader label="Idée / Thème" />
              )}
              {showColumns.includes("status") && (
                <TableHeader label="Statut" sortKey="status" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              )}
              {showColumns.includes("wording") && (
                <div className="px-3 py-2.5 text-[10px] uppercase font-semibold text-gray-400 tracking-wider">Wording</div>
              )}
              {showColumns.includes("canal") && (
                <TableHeader label="Canal" sortKey="canal" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              )}
              {showColumns.includes("format") && (
                <div className="px-3 py-2.5 text-[10px] uppercase font-semibold text-gray-400 tracking-wider">Format</div>
              )}
              {showColumns.includes("phase") && (
                <div className="px-3 py-2.5 text-[10px] uppercase font-semibold text-gray-400 tracking-wider">Phase</div>
              )}
              <div className="px-3 py-2.5 text-[10px] uppercase font-semibold text-gray-400 tracking-wider">Actions</div>
            </div>

            {/* Table rows */}
            {filteredPosts.map((post, idx) => {
              const statusInfo = getStatusInfo(post.status);
              const isPublished = post.status === "published";
              const isToValidate = post.status === "ready";
              const wording = post.content_draft || post.wording || "";
              const isExpanded = expandedRows.has(post.id);
              const unresolvedCount = getUnresolvedCount(post.id);
              const canalInfo = CANAL_COLORS[post.canal];

              return (
                <div
                  key={post.id}
                  id={`post-row-${post.id}`}
                  className={`grid gap-0 border-b border-gray-100 items-start transition-colors hover:border-l-2 hover:border-l-gray-900 ${
                    idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                  } ${isToValidate ? "!bg-orange-50/40" : ""} ${isPublished ? "opacity-60" : ""}`}
                  style={{ gridTemplateColumns: buildGridCols(showColumns, !!share?.guest_can_edit_status) }}
                >
                  {showColumns.includes("date") && (
                    <div className="px-3 py-2.5 text-[12px] text-gray-600" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                      {format(parseISO(post.date), "d MMM yyyy", { locale: fr })}
                    </div>
                  )}
                  {showColumns.includes("theme") && (
                    <div className="px-3 py-2.5">
                      <p className="text-[13px] text-gray-900 leading-snug" style={{ fontFamily: "'Libre Baskerville', serif" }}>
                        {post.theme}
                      </p>
                    </div>
                  )}
                  {showColumns.includes("status") && (
                    <div className="px-3 py-2.5">
                      {share?.guest_can_edit_status ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className={`text-[11px] font-medium px-2 py-1 rounded-full ${statusInfo.color} cursor-pointer hover:opacity-80 transition-opacity inline-flex items-center gap-1`}>
                              {statusInfo.label}
                              <ChevronDown className="h-3 w-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="min-w-[140px]">
                            {STATUS_OPTIONS.map(opt => (
                              <DropdownMenuItem key={opt.value} onClick={() => editStatus(post, opt.value)} className="text-xs">
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${opt.color} mr-2`}>{opt.label}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className={`text-[11px] font-medium px-2 py-1 rounded-full ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      )}
                    </div>
                  )}
                  {showColumns.includes("wording") && (
                    <div className="px-3 py-2.5">
                      {editingWording === post.id ? (
                        <Textarea
                          autoFocus
                          value={editWordingValue}
                          onChange={e => setEditWordingValue(e.target.value)}
                          onBlur={() => saveWording(post, editWordingValue)}
                          onKeyDown={e => { if (e.key === "Escape") setEditingWording(null); }}
                          className="text-[12px] min-h-[60px] rounded border-gray-300 resize-none"
                        />
                      ) : (
                        <div
                          onClick={() => {
                            if (share?.guest_can_edit_wording && wording) {
                              setEditingWording(post.id);
                              setEditWordingValue(wording);
                            } else {
                              setExpandedRows(prev => {
                                const next = new Set(prev);
                                next.has(post.id) ? next.delete(post.id) : next.add(post.id);
                                return next;
                              });
                            }
                          }}
                          className={`text-[12px] text-gray-600 leading-relaxed cursor-pointer ${!isExpanded ? "line-clamp-2" : ""} ${share?.guest_can_edit_wording ? "hover:bg-gray-100 rounded px-1 -mx-1 py-0.5" : ""}`}
                        >
                          {wording || <span className="text-gray-300 italic">—</span>}
                        </div>
                      )}
                    </div>
                  )}
                  {showColumns.includes("canal") && (
                    <div className="px-3 py-2.5">
                      {canalInfo && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${canalInfo.color}`}>
                          {canalInfo.label}
                        </span>
                      )}
                    </div>
                  )}
                  {showColumns.includes("format") && (
                    <div className="px-3 py-2.5 text-[12px] text-gray-500">
                      {FORMAT_LABELS[post.format || ""] || post.format || "—"}
                    </div>
                  )}
                  {showColumns.includes("phase") && (
                    <div className="px-3 py-2.5 text-[11px] text-gray-500">
                      {post.phase || "—"}
                    </div>
                  )}
                  <div className="px-3 py-2.5 flex items-center gap-1.5">
                    <button
                      onClick={() => { setSelectedPost(post); setRevisionMode(false); setRevisionText(""); }}
                      className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded hover:bg-gray-100 relative"
                      title="Commenter"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {unresolvedCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                          {unresolvedCount}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => { setSelectedPost(post); setRevisionMode(false); setRevisionText(""); }}
                      className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded hover:bg-gray-100"
                      title="Aperçu"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Sticky action bar */}
      {!loading && filteredPosts.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-40">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-xs">
              {toValidateCount > 0 && (
                <span className="font-semibold text-orange-600">
                  {toValidateCount} post{toValidateCount > 1 ? "s" : ""} à valider
                </span>
              )}
              {unresolvedTotal > 0 && (
                <button onClick={scrollToFirstUnresolved} className="text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {unresolvedTotal} commentaire{unresolvedTotal > 1 ? "s" : ""}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {toValidateCount > 0 && share?.guest_can_edit_status && (
                <Button onClick={validateAll} size="sm" className="rounded-full text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-8">
                  <Check className="h-3.5 w-3.5" /> Tout valider
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-gray-200 py-4 text-center bg-white" style={{ marginBottom: filteredPosts.length > 0 ? "52px" : 0 }}>
        <p className="text-xs text-gray-400">
          Créé avec{" "}
          <a href="https://nowadaysagency.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">
            L'Assistant Com' par Nowadays Agency
          </a>
        </p>
      </footer>

      {/* Comment panel — Sheet on mobile, side panel on desktop */}
      {isMobile ? (
        <Sheet open={selectedPost !== null} onOpenChange={(o) => { if (!o) setSelectedPost(null); }}>
          <SheetContent side="bottom" className="h-[90dvh] p-0 flex flex-col rounded-t-2xl">
            <SheetHeader className="sr-only"><SheetTitle>Détails du post</SheetTitle></SheetHeader>
            {commentPanelContent}
          </SheetContent>
        </Sheet>
      ) : (
        selectedPost && (
          <div className="fixed top-0 right-0 bottom-0 w-[420px] bg-white border-l border-gray-200 shadow-xl z-50 flex flex-col">
            {commentPanelContent}
          </div>
        )
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
        active ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-gray-400"
      }`}
    >
      {label}
    </button>
  );
}

function TableHeader({ label, sortKey, currentKey, sortDir, onSort }: {
  label: string;
  sortKey?: SortKey;
  currentKey?: SortKey;
  sortDir?: SortDir;
  onSort?: (k: SortKey) => void;
}) {
  const isActive = sortKey && currentKey === sortKey;
  return (
    <button
      onClick={() => sortKey && onSort?.(sortKey)}
      className={`px-3 py-2.5 text-left flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider ${
        isActive ? "text-gray-800" : "text-gray-400"
      } ${sortKey ? "cursor-pointer hover:text-gray-700" : "cursor-default"}`}
    >
      {label}
      {sortKey && <ArrowUpDown className="h-3 w-3" />}
    </button>
  );
}

function CommentInput({ onSend, sending }: { onSend: (text: string) => void; sending: boolean }) {
  const [text, setText] = useState("");

  const handleSend = () => {
    if (!text.trim() || sending) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <div className="border-t border-gray-200 px-4 py-3 bg-white shrink-0 flex items-end gap-2">
      <Textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        placeholder="Ton commentaire..."
        className="text-xs min-h-[36px] max-h-[100px] rounded-lg border-gray-300 resize-none flex-1"
        rows={1}
      />
      <Button size="sm" onClick={handleSend} disabled={!text.trim() || sending} className="h-9 w-9 p-0 rounded-lg bg-gray-900 hover:bg-gray-800 shrink-0">
        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white" /> : <Send className="h-3.5 w-3.5 text-white" />}
      </Button>
    </div>
  );
}

function MobilePostCard({ post, share, comments, unresolvedCount, onOpenComments, onEditStatus }: {
  post: Post;
  share: ShareData;
  comments: Comment[];
  unresolvedCount: number;
  onOpenComments: () => void;
  onEditStatus?: (status: string) => void;
}) {
  const statusInfo = getStatusInfo(post.status);
  const isPublished = post.status === "published";
  const isToValidate = post.status === "ready";
  const wording = post.content_draft || post.wording || "";
  const canalInfo = CANAL_COLORS[post.canal];
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 shadow-sm p-3.5 ${isToValidate ? "border-orange-200 bg-orange-50/30" : ""} ${isPublished ? "opacity-60" : ""}`}
      id={`post-row-${post.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-gray-900 leading-snug" style={{ fontFamily: "'Libre Baskerville', serif" }}>
            {post.theme}
          </p>
          <p className="text-[11px] text-gray-400 mt-1" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            {format(parseISO(post.date), "d MMM yyyy", { locale: fr })}
          </p>
        </div>
        {onEditStatus ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`text-[10px] font-medium px-2 py-1 rounded-full ${statusInfo.color} shrink-0 inline-flex items-center gap-0.5`}>
                {statusInfo.label} <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[130px]">
              {STATUS_OPTIONS.map(opt => (
                <DropdownMenuItem key={opt.value} onClick={() => onEditStatus(opt.value)} className="text-xs">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${opt.color} mr-2`}>{opt.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${statusInfo.color} shrink-0`}>
            {statusInfo.label}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {canalInfo && <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${canalInfo.color}`}>{canalInfo.label}</span>}
        {post.format && <span className="text-[9px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">{FORMAT_LABELS[post.format] || post.format}</span>}
        {post.phase && <span className="text-[9px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">{post.phase}</span>}
      </div>

      {wording && (
        <div onClick={() => setExpanded(!expanded)} className={`text-[12px] text-gray-600 leading-relaxed cursor-pointer ${!expanded ? "line-clamp-2" : ""}`}>
          {wording}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-gray-100">
        <button onClick={onOpenComments} className="text-[11px] text-gray-500 hover:text-gray-800 flex items-center gap-1 transition-colors">
          <MessageCircle className="h-3.5 w-3.5" />
          {unresolvedCount > 0 ? <span className="text-orange-600 font-semibold">{unresolvedCount}</span> : "Commenter"}
        </button>
        <button onClick={onOpenComments} className="text-[11px] text-gray-500 hover:text-gray-800 flex items-center gap-1 transition-colors">
          <Eye className="h-3.5 w-3.5" /> Voir
        </button>
      </div>
    </div>
  );
}

function buildGridCols(showColumns: string[], hasActions: boolean): string {
  const cols: string[] = [];
  if (showColumns.includes("date")) cols.push("100px");
  if (showColumns.includes("theme")) cols.push("minmax(140px, 1.5fr)");
  if (showColumns.includes("status")) cols.push("110px");
  if (showColumns.includes("wording")) cols.push("minmax(160px, 2fr)");
  if (showColumns.includes("canal")) cols.push("90px");
  if (showColumns.includes("format")) cols.push("90px");
  if (showColumns.includes("phase")) cols.push("minmax(80px, 1fr)");
  cols.push("80px"); // actions
  return cols.join(" ");
}
