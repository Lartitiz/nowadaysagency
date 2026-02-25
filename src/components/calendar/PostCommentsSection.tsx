import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Loader2, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

interface Props {
  postId: string | undefined;
  ownerName: string;
}

export function PostCommentsSection({ postId, ownerName }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    (supabase.from("calendar_comments") as any)
      .select("*")
      .eq("calendar_post_id", postId)
      .order("created_at", { ascending: true })
      .then(({ data }: any) => {
        setComments(data || []);
        setLoading(false);
      });
  }, [postId]);

  if (!postId) return null;

  const unresolvedComments = comments.filter(c => !c.is_resolved);
  const resolvedComments = comments.filter(c => c.is_resolved);

  if (comments.length === 0 && !loading) return null;

  const toggleResolved = async (commentId: string, current: boolean) => {
    await (supabase.from("calendar_comments") as any)
      .update({ is_resolved: !current })
      .eq("id", commentId);
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, is_resolved: !current } : c));
  };

  const handleReply = async () => {
    if (!reply.trim() || !user) return;
    setSending(true);

    // Get first share for this post
    const shareForPost = comments[0]?.share_id;
    if (!shareForPost) { setSending(false); return; }

    const { data } = await (supabase.from("calendar_comments") as any)
      .insert({
        calendar_post_id: postId,
        share_id: shareForPost,
        author_name: ownerName || "Moi",
        author_role: "owner",
        content: reply.trim(),
      })
      .select()
      .single();

    if (data) {
      setComments(prev => [...prev, data]);
      setReply("");
    }
    setSending(false);
  };

  const getInitial = (name: string) => (name || "?").charAt(0).toUpperCase();

  return (
    <div className="border-t border-border pt-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          Commentaires ({unresolvedComments.length})
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {/* Unresolved */}
          {unresolvedComments.map(c => (
            <CommentBubble key={c.id} comment={c} onToggleResolved={toggleResolved} getInitial={getInitial} />
          ))}

          {/* Resolved - collapsed */}
          {resolvedComments.length > 0 && (
            <Collapsible open={showResolved} onOpenChange={setShowResolved}>
              <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showResolved ? "▾" : "▸"} {resolvedComments.length} résolu{resolvedComments.length > 1 ? "s" : ""}
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 mt-2">
                {resolvedComments.map(c => (
                  <CommentBubble key={c.id} comment={c} onToggleResolved={toggleResolved} getInitial={getInitial} resolved />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Reply input */}
          <div className="flex gap-2 mt-2">
            <Input
              placeholder="Répondre..."
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleReply()}
              className="text-sm"
            />
            <Button size="sm" onClick={handleReply} disabled={!reply.trim() || sending} className="rounded-full shrink-0">
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Répondre"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentBubble({ comment, onToggleResolved, getInitial, resolved }: {
  comment: Comment;
  onToggleResolved: (id: string, current: boolean) => void;
  getInitial: (name: string) => string;
  resolved?: boolean;
}) {
  const isOwner = comment.author_role === "owner";

  return (
    <div className={`flex gap-2 ${resolved ? "opacity-50" : ""}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${isOwner ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
        {getInitial(comment.author_name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-medium text-foreground">{comment.author_name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isOwner ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
            {isOwner ? "Moi" : "Client·e"}
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: fr })}
          </span>
        </div>
        <p className={`text-sm text-foreground ${resolved ? "line-through" : ""}`}>{comment.content}</p>
        <button
          onClick={() => onToggleResolved(comment.id, comment.is_resolved)}
          className={`mt-1 text-[11px] flex items-center gap-1 transition-colors ${comment.is_resolved ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
        >
          <Check className="h-3 w-3" />
          {comment.is_resolved ? "Résolu" : "Marquer résolu"}
        </button>
      </div>
    </div>
  );
}
