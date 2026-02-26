import { useState, useMemo } from "react";
import { Heart, MessageCircle, Send, Bookmark, ThumbsUp, Share2, Mail, Globe, Play, Check } from "lucide-react";
import { CarouselSlider } from "./CarouselSlider";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

interface Comment {
  id: string;
  authorName: string;
  content: string;
  createdAt: string;
  isResolved?: boolean;
}

interface Slide {
  title: string;
  body: string;
  slideNumber: number;
}

interface SocialMockupProps {
  canal: "instagram" | "linkedin";
  format: "post" | "carousel" | "reel" | "story";
  username: string;
  displayName: string;
  avatarUrl?: string;
  caption: string;
  slides?: Slide[];
  hashtags?: string[];
  mediaUrls?: string[];
  showComments?: boolean;
  comments?: Comment[];
  onAddComment?: (content: string) => void;
  readonly?: boolean;
  compact?: boolean;
  hideFollowButton?: boolean;
}

const FORMAT_EMOJI: Record<string, string> = {
  post: "🖼️", carousel: "📑", reel: "🎬", story: "📱",
};

export function SocialMockup(props: SocialMockupProps) {
  if (props.canal === "linkedin") return <LinkedInMockup {...props} />;
  return <InstagramMockup {...props} />;
}

// ═══════════════════════════════════════
// INSTAGRAM
// ═══════════════════════════════════════

function InstagramMockup({
  format, username, displayName, avatarUrl, caption, slides, hashtags, mediaUrls,
  showComments, comments = [], onAddComment, readonly, compact, hideFollowButton,
}: SocialMockupProps) {
  const [expanded, setExpanded] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [localComments, setLocalComments] = useState<Comment[]>([]);
  const likeCount = useMemo(() => Math.floor(Math.random() * 78) + 12, []);

  const allComments = [...comments, ...localComments];
  const captionLines = caption.split("\n");
  const isTruncated = captionLines.length > 3 || caption.length > 200;
  const displayCaption = expanded ? caption : captionLines.slice(0, 3).join("\n").slice(0, 200);

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    const c: Comment = { id: `opt-${Date.now()}`, authorName: "Vous", content: commentText.trim(), createdAt: new Date().toISOString() };
    setLocalComments(prev => [...prev, c]);
    onAddComment?.(commentText.trim());
    setCommentText("");
  };

  return (
    <div className="rounded-2xl border border-border shadow-sm overflow-hidden bg-white max-w-[400px] w-full">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <AvatarCircle url={avatarUrl} name={username} size={36} gradient="instagram" />
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-semibold text-gray-900">{username}</span>
        </div>
        {!hideFollowButton && <span className="text-xs font-semibold text-blue-500">Suivre</span>}
      </div>

      {/* Media area */}
      {format === "carousel" && slides && slides.length > 0 ? (
        compact ? (
          <div className="w-full aspect-[4/3] flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(340 60% 96%), hsl(30 60% 97%))" }}>
            <span className="text-2xl">{FORMAT_EMOJI.carousel}</span>
          </div>
        ) : (
          <CarouselSlider slides={slides} mediaUrls={mediaUrls} />
        )
      ) : mediaUrls && mediaUrls.length > 0 ? (
        <img src={mediaUrls[0]} alt="" className={`w-full object-cover ${format === "reel" ? "aspect-[4/5]" : "aspect-square"}`} />
      ) : (
        <div
          className={`w-full flex items-center justify-center ${format === "reel" ? "aspect-[4/5]" : "aspect-square"}`}
          style={{ background: "linear-gradient(135deg, hsl(340 60% 96%), hsl(30 60% 97%))" }}
        >
          {format === "reel" ? (
            <div className="w-14 h-14 rounded-full bg-white/70 flex items-center justify-center">
              <Play className="h-7 w-7 text-gray-700 ml-1" />
            </div>
          ) : (
            <span className="text-4xl">{FORMAT_EMOJI[format] || "🖼️"}</span>
          )}
        </div>
      )}

      {compact && <div className="h-1" />}

      {!compact && (
        <>
          {/* Action bar */}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-4">
              <Heart className="h-[22px] w-[22px] text-gray-900 cursor-pointer hover:text-gray-500 transition-colors" />
              <MessageCircle className="h-[22px] w-[22px] text-gray-900 cursor-pointer hover:text-gray-500 transition-colors" />
              <Send className="h-[22px] w-[22px] text-gray-900 cursor-pointer hover:text-gray-500 transition-colors" />
            </div>
            <Bookmark className="h-[22px] w-[22px] text-gray-900 cursor-pointer hover:text-gray-500 transition-colors" />
          </div>

          {/* Likes */}
          <p className="px-3 text-[13px] font-semibold text-gray-900">{likeCount} J'aime</p>

          {/* Caption */}
          <div className="px-3 py-1.5">
            <p className="text-[13px] text-gray-900 leading-snug whitespace-pre-line">
              <span className="font-semibold">{username}</span>{" "}
              {displayCaption}
              {isTruncated && !expanded && (
                <button onClick={() => setExpanded(true)} className="text-gray-400 ml-1">... plus</button>
              )}
            </p>
            {hashtags && hashtags.length > 0 && (
              <p className="text-[13px] text-blue-900/60 mt-1">
                {hashtags.map(h => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
              </p>
            )}
          </div>

          {/* Comment count link */}
          {allComments.length > 0 && !showComments && (
            <p className="px-3 text-[13px] text-gray-400 pb-1.5">
              Voir les {allComments.length} commentaire{allComments.length > 1 ? "s" : ""}
            </p>
          )}

          {/* Comments */}
          {showComments && (
            <div className="border-t border-gray-100">
              <div className="px-3 py-2 space-y-2 max-h-48 overflow-y-auto">
                {allComments.map(c => (
                  <div key={c.id} className={`flex gap-1.5 text-[13px] ${c.isResolved ? "opacity-50" : ""}`}>
                    <span className="font-semibold text-gray-900 shrink-0">{c.authorName}</span>
                    <span className="text-gray-800 flex-1">{c.content}</span>
                    {c.isResolved && <Check className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />}
                  </div>
                ))}
              </div>

              {!readonly && (
                <div className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-100">
                  <AvatarCircle name="V" size={24} />
                  <input
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddComment()}
                    placeholder="Ajouter un commentaire..."
                    className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-gray-400"
                  />
                  {commentText.trim() && (
                    <button onClick={handleAddComment} className="text-[13px] font-semibold text-blue-500">
                      Publier
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// LINKEDIN
// ═══════════════════════════════════════

function LinkedInMockup({
  displayName, username, avatarUrl, caption,
  showComments, comments = [], onAddComment, readonly, compact,
}: SocialMockupProps) {
  const [expanded, setExpanded] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [localComments, setLocalComments] = useState<Comment[]>([]);
  const reactionCount = useMemo(() => Math.floor(Math.random() * 40) + 5, []);

  const allComments = [...comments, ...localComments];
  const captionLines = caption.split("\n");
  const isTruncated = captionLines.length > 5 || caption.length > 400;
  const displayCaption = expanded ? caption : captionLines.slice(0, 5).join("\n").slice(0, 400);

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    const c: Comment = { id: `opt-${Date.now()}`, authorName: "Vous", content: commentText.trim(), createdAt: new Date().toISOString() };
    setLocalComments(prev => [...prev, c]);
    onAddComment?.(commentText.trim());
    setCommentText("");
  };

  return (
    <div className="rounded-2xl border border-border shadow-sm overflow-hidden bg-white max-w-[400px] w-full">
      {/* Header */}
      <div className="flex items-start gap-2.5 px-4 py-3">
        <AvatarCircle url={avatarUrl} name={displayName} size={48} />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-gray-900 leading-tight">{displayName}</p>
          <p className="text-[12px] text-gray-500 leading-tight mt-0.5 truncate">{username}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
            1j • <Globe className="h-3 w-3" />
          </p>
        </div>
      </div>

      {compact ? (
        <div className="h-1" />
      ) : (
        <>
          {/* Caption */}
          <div className="px-4 pb-3">
            <p className="text-[14px] text-gray-900 leading-relaxed whitespace-pre-line">
              {displayCaption}
              {isTruncated && !expanded && (
                <button onClick={() => setExpanded(true)} className="text-gray-500 ml-1">... voir plus</button>
              )}
            </p>
          </div>

          {/* Reactions bar */}
          <div className="px-4 flex items-center justify-between pb-2">
            <div className="flex items-center gap-0.5 text-[12px] text-gray-500">
              <span>👍❤️😄</span>
              <span className="ml-1">{reactionCount}</span>
            </div>
            {allComments.length > 0 && (
              <span className="text-[12px] text-gray-500">{allComments.length} commentaire{allComments.length > 1 ? "s" : ""}</span>
            )}
          </div>

          {/* Action buttons */}
          <div className="border-t border-gray-200 grid grid-cols-4 py-1">
            {[
              { icon: ThumbsUp, label: "J'aime" },
              { icon: MessageCircle, label: "Commenter" },
              { icon: Share2, label: "Partager" },
              { icon: Mail, label: "Envoyer" },
            ].map(({ icon: Icon, label }) => (
              <button key={label} className="flex flex-col items-center gap-0.5 py-2 text-gray-600 hover:bg-gray-50 transition-colors">
                <Icon className="h-4 w-4" />
                <span className="text-[11px] font-medium">{label}</span>
              </button>
            ))}
          </div>

          {/* Comments */}
          {showComments && (
            <div className="border-t border-gray-200">
              <div className="px-4 py-2 space-y-3 max-h-48 overflow-y-auto">
                {allComments.map(c => (
                  <div key={c.id} className={`flex gap-2 ${c.isResolved ? "opacity-50" : ""}`}>
                    <AvatarCircle name={c.authorName} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="bg-gray-100 rounded-xl px-3 py-2">
                        <p className="text-[12px] font-semibold text-gray-900 flex items-center gap-1">
                          {c.authorName}
                          {c.isResolved && <Check className="h-3 w-3 text-emerald-500" />}
                        </p>
                        <p className="text-[13px] text-gray-700">{c.content}</p>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5 ml-3">
                        {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true, locale: fr })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {!readonly && (
                <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-200">
                  <AvatarCircle name="V" size={28} />
                  <input
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddComment()}
                    placeholder="Ajouter un commentaire..."
                    className="flex-1 text-[13px] bg-gray-100 rounded-full px-3 py-1.5 outline-none placeholder:text-gray-400"
                  />
                  {commentText.trim() && (
                    <button onClick={handleAddComment} className="text-[13px] font-semibold text-blue-600">
                      Publier
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// SHARED AVATAR
// ═══════════════════════════════════════

function AvatarCircle({ url, name, size = 36, gradient }: { url?: string; name: string; size?: number; gradient?: "instagram" }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  const borderStyle = gradient === "instagram"
    ? { background: "linear-gradient(135deg, hsl(340 80% 60%), hsl(30 90% 60%))", padding: "2px" }
    : {};

  if (url) {
    return (
      <div className="rounded-full shrink-0 overflow-hidden" style={{ width: size, height: size, ...borderStyle }}>
        <img src={url} alt={name} className="w-full h-full rounded-full object-cover" style={gradient ? { border: "2px solid white" } : {}} />
      </div>
    );
  }

  return (
    <div className="rounded-full shrink-0 overflow-hidden" style={{ width: size, height: size, ...borderStyle }}>
      <div
        className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-semibold"
        style={{ fontSize: size * 0.4, ...(gradient ? { border: "2px solid white" } : {}) }}
      >
        {initial}
      </div>
    </div>
  );
}
