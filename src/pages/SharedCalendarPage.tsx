import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Loader2, MessageCircle, Send, AlertCircle, Check, X } from "lucide-react";
import { formatDistanceToNow, format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { SocialMockup } from "@/components/social-mockup/SocialMockup";
import { useIsMobile } from "@/hooks/use-mobile";

interface ShareData {
  label: string | null;
  canal_filter: string;
  show_content_draft: boolean;
  guest_name: string | null;
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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  idea: { label: "Idée", color: "bg-amber-100 text-amber-800" },
  a_rediger: { label: "À rédiger", color: "bg-amber-50 text-amber-700" },
  drafting: { label: "En rédaction", color: "bg-blue-100 text-blue-800" },
  ready: { label: "Prêt", color: "bg-emerald-100 text-emerald-800" },
  draft_ready: { label: "Prêt", color: "bg-emerald-100 text-emerald-800" },
  published: { label: "Publié", color: "bg-gray-200 text-gray-600" },
};

const CANAL_LABELS: Record<string, { label: string; color: string }> = {
  instagram: { label: "Instagram", color: "bg-pink-100 text-pink-800" },
  linkedin: { label: "LinkedIn", color: "bg-sky-100 text-sky-800" },
  pinterest: { label: "Pinterest", color: "bg-red-100 text-red-800" },
  blog: { label: "Blog", color: "bg-teal-100 text-teal-800" },
};

const FORMAT_EMOJIS: Record<string, string> = {
  post_carrousel: "📑", post_photo: "🖼️", reel: "🎬",
  story: "📱", story_serie: "📱", live: "🎤",
};

function mapFormat(f: string | null): "post" | "carousel" | "reel" | "story" {
  if (f === "post_carrousel") return "carousel";
  if (f === "reel") return "reel";
  if (f === "story" || f === "story_serie") return "story";
  return "post";
}

function mapCanal(c: string): "instagram" | "linkedin" {
  return c === "linkedin" ? "linkedin" : "instagram";
}

export default function SharedCalendarPage() {
  const { token } = useParams<{ token: string }>();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<ShareData | null>(null);
  const [profile, setProfile] = useState<{ prenom?: string; activite?: string }>({});
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Guest name
  const storageKey = `cal_guest_${token}`;
  const [guestName, setGuestName] = useState(() => localStorage.getItem(storageKey) || "");
  const [nameInput, setNameInput] = useState("");
  const hasName = !!(guestName || share?.guest_name);

  // Post detail dialog
  const [selectedPostIndex, setSelectedPostIndex] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [revisionMode, setRevisionMode] = useState(false);
  const [revisionText, setRevisionText] = useState("");
  const [currentSlide, setCurrentSlide] = useState(1);

  const effectiveName = guestName || share?.guest_name || "";

  // Ordered posts for navigation
  const orderedPosts = useMemo(() =>
    [...posts].sort((a, b) => a.date.localeCompare(b.date) || a.theme.localeCompare(b.theme)),
  [posts]);

  const selectedPost = selectedPostIndex !== null ? orderedPosts[selectedPostIndex] : null;

  const fetchData = async (ws?: Date) => {
    if (!token) return;
    const weekStr = format(ws || weekStart, "yyyy-MM-dd");
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const url = `https://${projectId}.supabase.co/functions/v1/public-calendar?token=${encodeURIComponent(token)}&week_start=${weekStr}`;

    try {
      const res = await fetch(url);
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

      if (data.share?.guest_name && !guestName) {
        setGuestName(data.share.guest_name);
        localStorage.setItem(storageKey, data.share.guest_name);
      }
    } catch {
      setError("error");
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [token]);

  const navigateWeek = (dir: "prev" | "next") => {
    const newWeek = dir === "next" ? addWeeks(weekStart, 1) : subWeeks(weekStart, 1);
    setWeekStart(newWeek);
    setLoading(true);
    fetchData(newWeek);
  };

  const confirmName = () => {
    if (!nameInput.trim()) return;
    const name = nameInput.trim();
    setGuestName(name);
    localStorage.setItem(storageKey, name);
  };

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
  [weekStart]);

  const postsByDate = useMemo(() => {
    const map: Record<string, Post[]> = {};
    posts.forEach(p => {
      const key = p.date;
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    return map;
  }, [posts]);

  const getPostComments = (postId: string) => comments.filter(c => c.calendar_post_id === postId);
  const getUnresolvedCount = (postId: string) => getPostComments(postId).filter(c => !c.is_resolved).length;

  const openPost = (post: Post) => {
    const idx = orderedPosts.findIndex(p => p.id === post.id);
    setSelectedPostIndex(idx >= 0 ? idx : 0);
    setRevisionMode(false);
    setRevisionText("");
    setCurrentSlide(1);
  };

  const navigatePost = (dir: "prev" | "next") => {
    if (selectedPostIndex === null) return;
    const newIdx = dir === "next" ? selectedPostIndex + 1 : selectedPostIndex - 1;
    if (newIdx >= 0 && newIdx < orderedPosts.length) {
      setSelectedPostIndex(newIdx);
      setRevisionMode(false);
      setRevisionText("");
      setCurrentSlide(1);
    }
  };

  const sendCommentRaw = async (content: string) => {
    if (!content.trim() || !selectedPost || !token) return;
    setSending(true);

    const optimisticComment: Comment = {
      id: `temp-${Date.now()}`,
      calendar_post_id: selectedPost.id,
      share_id: "",
      author_name: effectiveName || "Invité·e",
      author_role: "guest",
      content: content.trim(),
      is_resolved: false,
      created_at: new Date().toISOString(),
    };

    setComments(prev => [...prev, optimisticComment]);

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/public-calendar-comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          calendar_post_id: selectedPost.id,
          author_name: effectiveName || "Invité·e",
          content: content.trim(),
        }),
      });

      if (res.ok) {
        const real = await res.json();
        setComments(prev => prev.map(c => c.id === optimisticComment.id ? real : c));
      }
    } catch { /* keep optimistic */ }
    setSending(false);
  };

  const handleMockupComment = (content: string) => {
    const isCarousel = mapFormat(selectedPost?.format ?? null) === "carousel";
    const prefix = isCarousel && currentSlide > 0 ? `[SLIDE ${currentSlide}] ` : "";
    sendCommentRaw(prefix + content);
  };

  const handleValidate = () => {
    sendCommentRaw("[VALIDATION] Ce post est validé ✅");
  };

  const handleRevisionSubmit = () => {
    if (!revisionText.trim()) return;
    sendCommentRaw(`[REVISION] ${revisionText.trim()}`);
    setRevisionMode(false);
    setRevisionText("");
  };

  // Parse slides for carousel
  const parseSlides = (post: Post) => {
    if (mapFormat(post.format) !== "carousel" || !post.content_draft) return undefined;
    try {
      const parsed = JSON.parse(post.content_draft);
      if (Array.isArray(parsed)) {
        return parsed.map((s: any, i: number) => ({
          title: s.title || s.titre || `Slide ${i + 1}`,
          body: s.body || s.texte || s.content || "",
          slideNumber: i + 1,
        }));
      }
    } catch { /* not JSON */ }
    const parts = post.content_draft.split(/(?:slide\s*\d+|---+|\n{3,})/i).filter(Boolean);
    if (parts.length > 1) {
      return parts.map((p, i) => ({
        title: p.split("\n")[0]?.trim() || `Slide ${i + 1}`,
        body: p.split("\n").slice(1).join("\n").trim(),
        slideNumber: i + 1,
      }));
    }
    return undefined;
  };

  // Map comments for SocialMockup
  const mockupComments = useMemo(() => {
    if (!selectedPost) return [];
    return getPostComments(selectedPost.id).map(c => ({
      id: c.id,
      authorName: c.author_name,
      content: c.content,
      createdAt: c.created_at,
      isResolved: c.is_resolved,
    }));
  }, [selectedPost, comments]);

  // ── Error state ──
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <div className="mb-6 text-2xl font-semibold" style={{ fontFamily: "'Libre Baskerville', serif" }}>
          Nowadays
        </div>
        <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
        <h1 className="text-lg font-semibold text-gray-800 mb-2" style={{ fontFamily: "'Libre Baskerville', serif" }}>
          Ce lien a expiré ou n'existe plus.
        </h1>
        <p className="text-sm text-gray-500 max-w-xs">
          Contacte la personne qui te l'a envoyé pour obtenir un nouveau lien.
        </p>
      </div>
    );
  }

  // ── Loading ──
  if (loading && !share) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // ── Post detail content (shared between Dialog and Sheet) ──
  const postDetailContent = selectedPost ? (() => {
    const caption = selectedPost.content_draft || selectedPost.theme;
    const slides = parseSlides(selectedPost);
    const hashtags = (caption.match(/#\w+/g) || []);
    const isCarousel = mapFormat(selectedPost.format) === "carousel";
    const placeholderText = isCarousel && currentSlide > 0
      ? `Slide ${currentSlide} — ton retour...`
      : "Ton retour sur ce post...";

    return (
      <div className="flex flex-col h-full">
        {/* Mini breadcrumb + navigation */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white shrink-0">
          <button
            onClick={() => navigatePost("prev")}
            disabled={selectedPostIndex === 0}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <span className="text-[11px] text-gray-500 font-medium">
            Sem. du {format(weekStart, "d MMM", { locale: fr })} · Post {(selectedPostIndex ?? 0) + 1}/{orderedPosts.length}
          </span>
          <button
            onClick={() => navigatePost("next")}
            disabled={selectedPostIndex === orderedPosts.length - 1}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
          <div className="flex justify-center">
            <SocialMockup
              canal={mapCanal(selectedPost.canal)}
              format={mapFormat(selectedPost.format)}
              username={profile.prenom || "user"}
              displayName={profile.prenom || "Utilisateur"}
              caption={caption}
              slides={slides}
              hashtags={hashtags}
              showComments={true}
              comments={mockupComments}
              onAddComment={handleMockupComment}
              readonly={false}
            />
          </div>

          {/* Validation buttons */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <Button
              onClick={handleValidate}
              disabled={sending}
              className="rounded-full gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4 h-9"
            >
              <Check className="h-3.5 w-3.5" /> Validé
            </Button>
            <Button
              variant="outline"
              onClick={() => setRevisionMode(!revisionMode)}
              className="rounded-full gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50 text-xs px-4 h-9"
            >
              <X className="h-3.5 w-3.5" /> À revoir
            </Button>
          </div>

          {revisionMode && (
            <div className="mt-3 max-w-[400px] mx-auto space-y-2">
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

        {/* Guest name prompt if needed */}
        {!hasName && (
          <div className="border-t border-gray-200 px-4 py-3 bg-white shrink-0">
            <p className="text-[11px] text-gray-500 mb-2">Pour commenter, dis-nous comment tu t'appelles :</p>
            <div className="flex gap-2">
              <Input
                placeholder="Ton prénom"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && confirmName()}
                className="text-xs h-8 rounded-lg border-gray-300"
              />
              <Button size="sm" onClick={confirmName} disabled={!nameInput.trim()} className="h-8 text-xs rounded-lg bg-gray-900 text-white hover:bg-gray-800">
                OK
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  })() : null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-1" style={{ fontFamily: "'Libre Baskerville', serif" }}>
              Nowadays
            </p>
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900" style={{ fontFamily: "'Libre Baskerville', serif" }}>
              📅 Calendrier de {profile.prenom || "…"}
            </h1>
            {profile.activite && (
              <p className="text-sm text-gray-500 mt-0.5">{profile.activite}</p>
            )}
            {share?.label && (
              <p className="text-xs text-gray-400 mt-1">{share.label}</p>
            )}
          </div>

          {!hasName && (
            <div className="flex items-center gap-2 shrink-0">
              <Input
                placeholder="Comment tu t'appelles ?"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && confirmName()}
                className="w-40 sm:w-52 text-sm h-9 rounded-lg border-gray-300"
              />
              <Button size="sm" onClick={confirmName} disabled={!nameInput.trim()} className="rounded-lg text-xs h-9 bg-gray-900 hover:bg-gray-800 text-white">
                C'est moi
              </Button>
            </div>
          )}
          {hasName && (
            <span className="text-sm text-gray-500 shrink-0 pt-1">👋 {effectiveName}</span>
          )}
        </div>
      </header>

      {/* Week navigation */}
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigateWeek("prev")} className="text-gray-600 hover:text-gray-900">
          <ChevronLeft className="h-4 w-4 mr-1" /> Sem. préc.
        </Button>
        <span className="text-sm font-medium text-gray-700" style={{ fontFamily: "'Libre Baskerville', serif" }}>
          {format(weekStart, "d MMM", { locale: fr })} — {format(addDays(weekStart, 6), "d MMM yyyy", { locale: fr })}
        </span>
        <Button variant="ghost" size="sm" onClick={() => navigateWeek("next")} className="text-gray-600 hover:text-gray-900">
          Sem. suiv. <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Calendar grid */}
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 pb-8 flex-1">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
            {weekDays.map(day => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayPosts = postsByDate[dateStr] || [];
              const isToday = isSameDay(day, new Date());

              return (
                <div key={dateStr} className={`rounded-xl border p-2.5 min-h-[120px] transition-colors ${isToday ? "border-gray-400 bg-white" : "border-gray-200 bg-white/60"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-medium ${isToday ? "text-gray-900" : "text-gray-500"}`}>
                      {format(day, "EEE d", { locale: fr })}
                    </span>
                    {isToday && <span className="w-1.5 h-1.5 rounded-full bg-gray-900" />}
                  </div>

                  {dayPosts.length === 0 && (
                    <p className="text-[10px] text-gray-300 italic">Rien de prévu</p>
                  )}

                  {dayPosts.map(post => {
                    const unresolvedCount = getUnresolvedCount(post.id);
                    const statusInfo = STATUS_LABELS[post.status] || STATUS_LABELS.idea;
                    const canalInfo = CANAL_LABELS[post.canal];

                    return (
                      <button
                        key={post.id}
                        onClick={() => openPost(post)}
                        className="mb-2 last:mb-0 rounded-lg border border-gray-200 bg-white p-2 text-xs w-full text-left hover:border-gray-400 hover:shadow-sm transition-all cursor-pointer"
                      >
                        <div className="flex items-start gap-1.5 mb-1">
                          {post.format && FORMAT_EMOJIS[post.format] && (
                            <span className="text-sm leading-none">{FORMAT_EMOJIS[post.format]}</span>
                          )}
                          <p className="font-medium text-gray-900 leading-snug flex-1 line-clamp-2" style={{ fontFamily: "'Libre Baskerville', serif", fontSize: "11px" }}>
                            {post.theme}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {canalInfo && (
                            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${canalInfo.color}`}>
                              {canalInfo.label}
                            </span>
                          )}
                          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </div>

                        {share?.show_content_draft && post.content_draft && (
                          <p className="text-[10px] text-gray-500 leading-relaxed line-clamp-3 mb-1.5">
                            {post.content_draft}
                          </p>
                        )}

                        <div className="flex items-center gap-1 text-[10px] text-gray-400">
                          <MessageCircle className="h-3 w-3" />
                          {unresolvedCount > 0 ? `💬 ${unresolvedCount}` : "Commenter"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-4 text-center">
        <p className="text-xs text-gray-400">
          Créé avec{" "}
          <a href="https://nowadaysagency.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">
            L'Assistant Com' par Nowadays Agency
          </a>
        </p>
      </footer>

      {/* Post detail — Dialog on desktop, fullscreen Sheet on mobile */}
      {isMobile ? (
        <Sheet open={selectedPost !== null} onOpenChange={(o) => { if (!o) setSelectedPostIndex(null); }}>
          <SheetContent side="bottom" className="h-[100dvh] p-0 flex flex-col rounded-none">
            {postDetailContent}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={selectedPost !== null} onOpenChange={(o) => { if (!o) setSelectedPostIndex(null); }}>
          <DialogContent className="max-w-[480px] p-0 overflow-hidden max-h-[90vh] flex flex-col">
            {postDetailContent}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
