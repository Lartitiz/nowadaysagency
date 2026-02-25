import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Loader2, MessageCircle, Send, AlertCircle } from "lucide-react";
import { formatDistanceToNow, format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";

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

export default function SharedCalendarPage() {
  const { token } = useParams<{ token: string }>();
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

  // Comment sheet
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);

  const effectiveName = guestName || share?.guest_name || "";

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

      // Restore guest_name
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
    // Update guest_name on share (fire-and-forget via edge function is not available, so we just store locally)
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

  const sendComment = async () => {
    if (!commentText.trim() || !selectedPost || !token) return;
    setSending(true);

    const optimisticComment: Comment = {
      id: `temp-${Date.now()}`,
      calendar_post_id: selectedPost.id,
      share_id: "",
      author_name: effectiveName || "Invité·e",
      author_role: "guest",
      content: commentText.trim(),
      is_resolved: false,
      created_at: new Date().toISOString(),
    };

    setComments(prev => [...prev, optimisticComment]);
    setCommentText("");

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/public-calendar-comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          calendar_post_id: selectedPost.id,
          author_name: effectiveName || "Invité·e",
          content: optimisticComment.content,
        }),
      });

      if (res.ok) {
        const real = await res.json();
        setComments(prev => prev.map(c => c.id === optimisticComment.id ? real : c));
      }
    } catch { /* keep optimistic */ }
    setSending(false);
  };

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

  const selectedPostComments = selectedPost ? getPostComments(selectedPost.id) : [];

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
                      <div key={post.id} className="mb-2 last:mb-0 rounded-lg border border-gray-200 bg-white p-2 text-xs">
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

                        <button
                          onClick={() => setSelectedPost(post)}
                          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-700 transition-colors"
                        >
                          <MessageCircle className="h-3 w-3" />
                          {unresolvedCount > 0 ? `💬 ${unresolvedCount}` : "Commenter"}
                        </button>
                      </div>
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

      {/* Comment sheet */}
      <Sheet open={!!selectedPost} onOpenChange={(o) => { if (!o) setSelectedPost(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col bg-white">
          <SheetHeader className="border-b border-gray-200 pb-3">
            <SheetTitle className="text-sm font-semibold text-gray-900" style={{ fontFamily: "'Libre Baskerville', serif" }}>
              {selectedPost?.theme}
            </SheetTitle>
            {selectedPost && (
              <p className="text-[10px] text-gray-400">
                {format(new Date(selectedPost.date), "EEEE d MMMM", { locale: fr })} · {CANAL_LABELS[selectedPost.canal]?.label || selectedPost.canal}
              </p>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto py-3 space-y-3">
            {selectedPostComments.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-8">Aucun commentaire pour l'instant. Sois le/la premier·e !</p>
            )}

            {selectedPostComments.map(c => {
              const isOwner = c.author_role === "owner";
              return (
                <div key={c.id} className="flex gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${isOwner ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-600"}`}>
                    {(c.author_name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-medium text-gray-800">{c.author_name}</span>
                      {isOwner && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Auteur·e</span>}
                      <span className="text-[9px] text-gray-400 ml-auto">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: fr })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">{c.content}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Comment input */}
          <div className="border-t border-gray-200 pt-3 space-y-2">
            {!hasName && (
              <div className="flex gap-2">
                <Input
                  placeholder="Ton prénom"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  className="text-xs h-8 rounded-lg border-gray-300"
                />
                <Button size="sm" onClick={confirmName} disabled={!nameInput.trim()} className="h-8 text-xs rounded-lg bg-gray-900 text-white hover:bg-gray-800">
                  OK
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Textarea
                placeholder={hasName ? "Ton commentaire…" : "Entre ton prénom d'abord"}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                disabled={!hasName}
                className="text-xs min-h-[60px] rounded-lg border-gray-300 resize-none"
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
              />
              <Button
                size="icon"
                onClick={sendComment}
                disabled={!commentText.trim() || !hasName || sending}
                className="h-10 w-10 rounded-lg bg-gray-900 text-white hover:bg-gray-800 shrink-0 self-end"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
