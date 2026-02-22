import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useUserPlan } from "@/hooks/use-user-plan";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Heart, MessageCircle, Send, Trash2, Users, Crown, Loader2 } from "lucide-react";

interface Post {
  id: string;
  user_id: string;
  content: string;
  category: string;
  is_studio_only: boolean;
  created_at: string;
  reactions: { id: string; user_id: string; reaction_type: string }[];
  comments: { id: string; user_id: string; content: string; created_at: string }[];
}

const CATEGORIES = [
  { value: "general", label: "💬 Général" },
  { value: "victoire", label: "🎉 Victoire" },
  { value: "question", label: "❓ Question" },
  { value: "feedback", label: "🔍 Feedback" },
  { value: "inspiration", label: "✨ Inspiration" },
];

const CommunautePage = () => {
  const { user } = useAuth();
  const { plan } = useUserPlan();
  const isStudio = plan === "studio";

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [studioOnly, setStudioOnly] = useState(false);
  const [posting, setPosting] = useState(false);
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("all");

  const fetchPosts = async () => {
    const { data: postsData } = await supabase
      .from("community_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!postsData) return;

    const postIds = postsData.map((p) => p.id);

    const [{ data: reactions }, { data: comments }] = await Promise.all([
      supabase.from("community_reactions").select("*").in("post_id", postIds),
      supabase.from("community_comments").select("*").in("post_id", postIds).order("created_at", { ascending: true }),
    ]);

    const enriched: Post[] = postsData.map((p) => ({
      ...p,
      reactions: (reactions || []).filter((r) => r.post_id === p.id),
      comments: (comments || []).filter((c) => c.post_id === p.id),
    }));

    setPosts(enriched);
    setLoading(false);
  };

  useEffect(() => {
    fetchPosts();

    const channel = supabase
      .channel("community")
      .on("postgres_changes", { event: "*", schema: "public", table: "community_posts" }, () => fetchPosts())
      .on("postgres_changes", { event: "*", schema: "public", table: "community_comments" }, () => fetchPosts())
      .on("postgres_changes", { event: "*", schema: "public", table: "community_reactions" }, () => fetchPosts())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handlePost = async () => {
    if (!newContent.trim() || !user) return;
    setPosting(true);
    const { error } = await supabase.from("community_posts").insert({
      user_id: user.id,
      content: newContent.trim(),
      category: newCategory,
      is_studio_only: studioOnly,
    });
    if (error) toast.error("Erreur lors de la publication");
    else { setNewContent(""); toast.success("Publié ! 🎉"); }
    setPosting(false);
  };

  const toggleReaction = async (postId: string) => {
    if (!user) return;
    const existing = posts.find((p) => p.id === postId)?.reactions.find((r) => r.user_id === user.id);
    if (existing) {
      await supabase.from("community_reactions").delete().eq("id", existing.id);
    } else {
      await supabase.from("community_reactions").insert({ post_id: postId, user_id: user.id, reaction_type: "❤️" });
    }
  };

  const addComment = async (postId: string) => {
    const text = commentTexts[postId]?.trim();
    if (!text || !user) return;
    await supabase.from("community_comments").insert({ post_id: postId, user_id: user.id, content: text });
    setCommentTexts((prev) => ({ ...prev, [postId]: "" }));
  };

  const deletePost = async (postId: string) => {
    await supabase.from("community_posts").delete().eq("id", postId);
    toast.success("Post supprimé");
  };

  const filtered = posts.filter((p) => {
    if (tab === "studio") return p.is_studio_only;
    if (tab === "all") return !p.is_studio_only;
    return p.category === tab;
  });

  const catLabel = (cat: string) => CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}j`;
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Communauté</h1>
        </div>

        {/* Composer */}
        <Card className="p-4 space-y-3">
          <Textarea
            placeholder="Partage une victoire, pose une question, inspire la communauté…"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={3}
          />
          <div className="flex flex-wrap items-center gap-2">
            {CATEGORIES.map((c) => (
              <Badge
                key={c.value}
                variant={newCategory === c.value ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setNewCategory(c.value)}
              >
                {c.label}
              </Badge>
            ))}
            {isStudio && (
              <Badge
                variant={studioOnly ? "default" : "outline"}
                className="cursor-pointer ml-auto"
                onClick={() => setStudioOnly(!studioOnly)}
              >
                <Crown className="h-3 w-3 mr-1" /> Studio only
              </Badge>
            )}
          </div>
          <Button onClick={handlePost} disabled={posting || !newContent.trim()} className="w-full">
            {posting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Publier
          </Button>
        </Card>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full flex-wrap h-auto gap-1">
            <TabsTrigger value="all">Tous</TabsTrigger>
            <TabsTrigger value="victoire">🎉</TabsTrigger>
            <TabsTrigger value="question">❓</TabsTrigger>
            <TabsTrigger value="feedback">🔍</TabsTrigger>
            <TabsTrigger value="inspiration">✨</TabsTrigger>
            {isStudio && <TabsTrigger value="studio"><Crown className="h-3 w-3 mr-1" /> Studio</TabsTrigger>}
          </TabsList>

          <TabsContent value={tab} className="space-y-4 mt-4">
            {loading ? (
              <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">Aucun post pour le moment. Sois le·la premier·e ! 🚀</p>
            ) : (
              filtered.map((post) => {
                const liked = post.reactions.some((r) => r.user_id === user?.id);
                return (
                  <Card key={post.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{catLabel(post.category)}</Badge>
                        {post.is_studio_only && <Badge variant="outline"><Crown className="h-3 w-3 mr-1" />Studio</Badge>}
                        <span className="text-xs text-muted-foreground">{timeAgo(post.created_at)}</span>
                      </div>
                      {post.user_id === user?.id && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deletePost(post.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    <p className="whitespace-pre-wrap text-sm">{post.content}</p>

                    {/* Reactions & comments count */}
                    <div className="flex items-center gap-4 text-sm">
                      <button
                        onClick={() => toggleReaction(post.id)}
                        className={`flex items-center gap-1 transition-colors ${liked ? "text-red-500" : "text-muted-foreground hover:text-red-400"}`}
                      >
                        <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
                        {post.reactions.length > 0 && post.reactions.length}
                      </button>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <MessageCircle className="h-4 w-4" />
                        {post.comments.length > 0 && post.comments.length}
                      </span>
                    </div>

                    {/* Comments */}
                    {post.comments.length > 0 && (
                      <div className="space-y-2 pl-3 border-l-2 border-muted">
                        {post.comments.map((c) => (
                          <div key={c.id} className="text-sm">
                            <span className="text-muted-foreground text-xs mr-2">{timeAgo(c.created_at)}</span>
                            {c.content}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add comment */}
                    <div className="flex gap-2">
                      <input
                        className="flex-1 text-sm bg-muted/50 rounded-md px-3 py-1.5 border-0 focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Commenter…"
                        value={commentTexts[post.id] || ""}
                        onChange={(e) => setCommentTexts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && addComment(post.id)}
                      />
                      <Button size="sm" variant="ghost" onClick={() => addComment(post.id)} disabled={!commentTexts[post.id]?.trim()}>
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default CommunautePage;
