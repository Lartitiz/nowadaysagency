import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Loader2, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

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
  const { column: workspaceColumn, value: workspaceValue } = useWorkspaceFilter();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [replyShareId, setReplyShareId] = useState("");
  const [availableShares, setAvailableShares] = useState<Array<{id: string; label: string | null}>>([]);
  const [loadError, setLoadError] = useState(false);
  const visit = useRef(0);
  const receipt = useRef<{key: string; id: string} | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const version = ++visit.current;
    setComments([]); setAvailableShares([]); setReplyShareId(""); setReply(""); setLoadError(false);
    if (!postId || !user) return;
    setLoading(true);
    void (async () => {
      try {
        const { data: post, error: postError } = await supabase.from("calendar_posts")
          .select("user_id, workspace_id, canal").eq("id", postId).single();
        if (postError || !post) throw postError || new Error("missing_post");
        const { data: links, error: linksError } = await (supabase.from("calendar_shares") as any)
          .select("id, label, workspace_id, legacy_owner_scope, canal_filter, is_active, expires_at").eq("user_id", post.user_id);
        if (linksError) throw linksError;
        const allowed = (links || []).filter((s: any) => s.is_active && (!s.expires_at || Date.parse(s.expires_at)>Date.now())
          && (s.workspace_id ? s.workspace_id === post.workspace_id : s.legacy_owner_scope || !post.workspace_id)
          && (!s.canal_filter || s.canal_filter === "all" || s.canal_filter === post.canal));
        const { data, error } = await (supabase.from("calendar_comments") as any)
          .select("*").eq("calendar_post_id", postId).order("created_at", { ascending: true });
        if (error) throw error;
        if (version !== visit.current) return;
        setComments(data || []); setAvailableShares(allowed);
        setReplyShareId(allowed.length === 1 ? allowed[0].id : "");
      } catch { if (version === visit.current) setLoadError(true); }
      finally { if (version === visit.current) setLoading(false); }
    })();
    return () => { ++visit.current; };
  }, [postId, user?.id, workspaceColumn, workspaceValue]);

  if (!postId) return null;

  const unresolvedComments = comments.filter(c => !c.is_resolved);
  const resolvedComments = comments.filter(c => c.is_resolved);

  // On masque seulement s'il n'y a ni commentaire ni lien de partage où rattacher une note.
  if (comments.length === 0 && !loading && !loadError && availableShares.length === 0) return null;

  const toggleResolved = async (commentId: string, current: boolean) => {
    const { error } = await (supabase.from("calendar_comments") as any)
      .update({ is_resolved: !current })
      .eq("id", commentId).select("id").single();
    if (error) {
      toast.error("Erreur lors de la mise à jour du commentaire");
      return;
    }
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, is_resolved: !current } : c));
  };

  const handleReply = async () => {
    if (!reply.trim() || !user || !replyShareId || busy.current) return;
    const version = visit.current;
    const submitted = reply;
    const key = JSON.stringify([postId, replyShareId, submitted.trim()]);
    if (receipt.current?.key !== key) receipt.current = { key, id: crypto.randomUUID() };
    const id = receipt.current.id;
    busy.current = true; setSending(true);
    try {
      const { data, error } = await (supabase.from("calendar_comments") as any).insert({
        id, calendar_post_id: postId, share_id: replyShareId, author_name: ownerName || "Moi",
        author_role: "owner", content: submitted.trim(),
      }).select().single();
      let saved = data;
      if (error) {
        // A lost response may hide a committed insert. Reuse its ID, never create another reply.
        const result = await (supabase.from("calendar_comments") as any).select("*").eq("id", id).maybeSingle();
        if (result.error || !result.data) throw error;
        saved = result.data;
      }
      if (!saved?.id) throw new Error("missing_receipt");
      receipt.current = null;
      if (version === visit.current) {
        setComments(prev => [...prev.filter(c => c.id !== saved.id), saved]);
        setReply(current => current === submitted ? "" : current);
      }
    } catch { toast.error("Le commentaire n'a pas été enregistré. Ta réponse est conservée."); }
    finally { busy.current = false; setSending(false); }
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

      {loadError && <p role="alert">Impossible de charger les échanges. Ferme puis rouvre ce contenu pour réessayer.</p>}
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {/* Unresolved */}
          {unresolvedComments.map(c => (
            <CommentBubble key={c.id} linkLabel={availableShares.find(s => s.id === c.share_id)?.label || `Lien ${c.share_id.slice(0, 8)}`} comment={c} onToggleResolved={toggleResolved} getInitial={getInitial} />
          ))}

          {/* Resolved - collapsed */}
          {resolvedComments.length > 0 && (
            <Collapsible open={showResolved} onOpenChange={setShowResolved}>
              <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showResolved ? "▾" : "▸"} {resolvedComments.length} résolu{resolvedComments.length > 1 ? "s" : ""}
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 mt-2">
                {resolvedComments.map(c => (
                  <CommentBubble key={c.id} linkLabel={availableShares.find(s => s.id === c.share_id)?.label || `Lien ${c.share_id.slice(0, 8)}`} comment={c} onToggleResolved={toggleResolved} getInitial={getInitial} resolved />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Explicit destination; never choose the first of several links. */}
          {availableShares.length > 0 && <label className="block text-xs">Lien destinataire
            <select aria-label="Lien destinataire" value={replyShareId} onChange={e => setReplyShareId(e.target.value)} className="block w-full border rounded p-2">
              <option value="">Choisir le lien pour cette réponse</option>
              {availableShares.map(s => <option key={s.id} value={s.id}>{s.label || `Lien ${s.id.slice(0, 8)}`}</option>)}
            </select>
          </label>}
          {/* Reply input */}
          <div className="flex gap-2 mt-2">
            <Input
              placeholder="Répondre..."
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleReply()}
              className="text-sm"
            />
            <Button size="sm" onClick={handleReply} disabled={!reply.trim() || !replyShareId || sending} className="rounded-full shrink-0">
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Répondre"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentBubble({ comment, onToggleResolved, getInitial, resolved, linkLabel }: {
  linkLabel: string;
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
          <span className="text-xs font-medium text-foreground">{comment.author_name} · {linkLabel}</span>
          <span className={`text-2xs px-1.5 py-0.5 rounded-full ${isOwner ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
            {isOwner ? "Moi" : "Client·e"}
          </span>
          <span className="text-2xs text-muted-foreground ml-auto">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: fr })}
          </span>
        </div>
        <p className={`text-sm text-foreground ${resolved ? "line-through" : ""}`}>{comment.content}</p>
        <button
          onClick={() => onToggleResolved(comment.id, comment.is_resolved)}
          className={`mt-1 text-2xs flex items-center gap-1 transition-colors ${comment.is_resolved ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
        >
          <Check className="h-3 w-3" />
          {comment.is_resolved ? "Résolu" : "Marquer résolu"}
        </button>
      </div>
    </div>
  );
}
