import { useState, useMemo } from "react";
import EmptyState from "@/components/EmptyState";
import { MESSAGES } from "@/lib/messages";
import { STATUSES, CANAL_COLORS, type CalendarPost } from "@/lib/calendar-constants";
import { FORMAT_EMOJIS, FORMAT_LABELS, OBJECTIVE_CARD_COLORS, CATEGORY_LABELS } from "@/lib/calendar-helpers";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Pencil, Copy, Trash2, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";

interface CalendarListViewProps {
  posts: CalendarPost[];
  onEditPost: (post: CalendarPost) => void;
  onStatusChange: (postId: string, newStatus: string) => void;
  onDeletePost: (postId: string) => void;
  onDuplicate?: (post: CalendarPost) => void;
  onUpdateDraft?: (postId: string, draft: string) => void;
  canalFilter: string;
  categoryFilter: string;
}

type SortKey = "date" | "status" | "canal";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<string, number> = { idea: 0, a_rediger: 1, drafting: 2, ready: 3, published: 4 };

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function CanalBadge({ canal }: { canal: string }) {
  const bgClass = CANAL_COLORS[canal] || "bg-muted";
  return (
    <span className={cn("text-[10px] font-medium text-white px-2 py-0.5 rounded-full capitalize", bgClass)}>
      {canal}
    </span>
  );
}

function ObjectifBadge({ objectif }: { objectif: string | null }) {
  if (!objectif) return <span className="text-muted-foreground text-xs">—</span>;
  const colors = OBJECTIVE_CARD_COLORS[objectif];
  const info = CATEGORY_LABELS[objectif];
  if (!colors || !info) return <span className="text-xs">{objectif}</span>;
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.bg, color: colors.text }}>
      {info.emoji} {info.label}
    </span>
  );
}

function InlineStatusSelect({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs bg-transparent border border-border rounded-md px-1.5 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
    >
      {STATUSES.map((s) => (
        <option key={s.id} value={s.id}>{s.label}</option>
      ))}
    </select>
  );
}

/** Expandable draft section */
function DraftSection({ post, editDraft, setEditDraft, onUpdateDraft }: {
  post: CalendarPost;
  editDraft: string;
  setEditDraft: (v: string) => void;
  onUpdateDraft?: (postId: string, draft: string) => void;
}) {
  return (
    <div className="px-4 py-3 bg-muted/20 border-b border-border">
      <label className="text-xs font-semibold text-muted-foreground mb-1 block">
        ✏️ Rédaction
      </label>
      <textarea
        value={editDraft}
        onChange={(e) => setEditDraft(e.target.value)}
        onBlur={() => onUpdateDraft?.(post.id, editDraft)}
        placeholder="Écris ton texte ici..."
        className="w-full min-h-[100px] text-sm bg-background border border-border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
      />
      {post.notes && (
        <div className="mt-2">
          <span className="text-xs font-semibold text-muted-foreground">📝 Notes :</span>
          <p className="text-xs text-muted-foreground mt-0.5">{post.notes}</p>
        </div>
      )}
    </div>
  );
}

/** Mobile card for a single post row */
function MobileCard({ post, onEditPost, onStatusChange, onDeletePost, onDuplicate, expandedId, setExpandedId, editDraft, setEditDraft, onUpdateDraft }: {
  post: CalendarPost;
  onEditPost: (p: CalendarPost) => void;
  onStatusChange: (id: string, s: string) => void;
  onDeletePost: (id: string) => void;
  onDuplicate?: (p: CalendarPost) => void;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  editDraft: string;
  setEditDraft: (v: string) => void;
  onUpdateDraft?: (postId: string, draft: string) => void;
}) {
  const formatKey = (post as any).format_technique || post.format || "";
  const formatEmoji = FORMAT_EMOJIS[formatKey] || "";
  const formatLabel = FORMAT_LABELS[formatKey] || "";
  const isExpanded = expandedId === post.id;

  const toggleExpand = () => {
    if (isExpanded) {
      setExpandedId(null);
    } else {
      setExpandedId(post.id);
      setEditDraft((post as any).content_draft || "");
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{formatDate(post.date)}</span>
          <CanalBadge canal={post.canal} />
        </div>
        <button onClick={() => onEditPost(post)} className="text-sm font-medium text-foreground text-left w-full hover:text-primary transition-colors truncate">
          {post.content_type_emoji || ""} {post.theme}
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {formatEmoji && <span className="text-xs text-muted-foreground">{formatEmoji} {formatLabel}</span>}
          <ObjectifBadge objectif={post.objectif || post.category || null} />
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <InlineStatusSelect status={post.status} onChange={(s) => onStatusChange(post.id, s)} />
          <div className="flex items-center gap-1">
            <button onClick={toggleExpand} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Voir la rédaction">
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => onEditPost(post)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {onDuplicate && (
              <button onClick={() => onDuplicate(post)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={() => onDeletePost(post.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      {isExpanded && (
        <DraftSection post={post} editDraft={editDraft} setEditDraft={setEditDraft} onUpdateDraft={onUpdateDraft} />
      )}
    </div>
  );
}

export function CalendarListView({ posts, onEditPost, onStatusChange, onDeletePost, onDuplicate, onUpdateDraft, canalFilter, categoryFilter }: CalendarListViewProps) {
  const isMobile = useIsMobile();
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const toggleExpand = (post: CalendarPost) => {
    if (expandedId === post.id) {
      setExpandedId(null);
    } else {
      setExpandedId(post.id);
      setEditDraft((post as any).content_draft || "");
    }
  };

  const filtered = useMemo(() => {
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

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === "date") return a.date.localeCompare(b.date) * dir;
      if (sortKey === "canal") return a.canal.localeCompare(b.canal) * dir;
      if (sortKey === "status") return ((STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0)) * dir;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Mobile: card list
  if (isMobile) {
    return (
      <div className="space-y-2">
        {sorted.length === 0 && <EmptyState {...MESSAGES.empty.calendar_empty} />}
        {sorted.map((post) => (
          <MobileCard
            key={post.id}
            post={post}
            onEditPost={onEditPost}
            onStatusChange={onStatusChange}
            onDeletePost={onDeletePost}
            onDuplicate={onDuplicate}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            editDraft={editDraft}
            setEditDraft={setEditDraft}
            onUpdateDraft={onUpdateDraft}
          />
        ))}
      </div>
    );
  }

  // Desktop: table-like
  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <button onClick={() => toggleSort(k)} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
      {label}
      <ArrowUpDown className={cn("h-3 w-3", sortKey === k ? "text-foreground" : "text-muted-foreground/40")} />
    </button>
  );

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[28px_100px_1fr_90px_120px_110px_120px_90px] gap-2 px-4 py-2.5 bg-muted/50 border-b border-border sticky top-0 z-10">
        <span />
        <SortHeader label="Date" k="date" />
        <span className="text-xs font-semibold text-muted-foreground">Thème</span>
        <SortHeader label="Canal" k="canal" />
        <span className="text-xs font-semibold text-muted-foreground">Format</span>
        <span className="text-xs font-semibold text-muted-foreground">Objectif</span>
        <SortHeader label="Statut" k="status" />
        <span className="text-xs font-semibold text-muted-foreground text-right">Actions</span>
      </div>

      {/* Rows */}
      {sorted.length === 0 && (
        <EmptyState {...MESSAGES.empty.calendar_empty} />
      )}
      {sorted.map((post, i) => {
        const formatKey = (post as any).format_technique || post.format || "";
        const formatEmoji = FORMAT_EMOJIS[formatKey] || "";
        const formatLabel = FORMAT_LABELS[formatKey] || "";
        const isExpanded = expandedId === post.id;
        const hasDraft = !!(post as any).content_draft;

        return (
          <div key={post.id}>
            <div
              className={cn(
                "grid grid-cols-[28px_100px_1fr_90px_120px_110px_120px_90px] gap-2 px-4 py-2 items-center border-b border-border/50 group hover:bg-accent/30 transition-colors cursor-pointer",
                i % 2 === 1 && "bg-muted/5",
                isExpanded && "bg-accent/20"
              )}
              onClick={(e) => {
                // Don't toggle if clicking on interactive elements
                if ((e.target as HTMLElement).closest("button, select, a")) return;
                toggleExpand(post);
              }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); toggleExpand(post); }}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
              >
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : (
                  <ChevronRight className={cn("h-3.5 w-3.5", hasDraft && "text-primary")} />
                )}
              </button>
              <span className="text-xs text-muted-foreground">{formatDate(post.date)}</span>
              <button onClick={() => onEditPost(post)} className="text-sm font-medium text-foreground text-left truncate hover:text-primary transition-colors">
                {post.content_type_emoji || ""} {post.theme}
              </button>
              <div><CanalBadge canal={post.canal} /></div>
              <span className="text-xs text-muted-foreground truncate">{formatEmoji} {formatLabel || "—"}</span>
              <ObjectifBadge objectif={post.objectif || post.category || null} />
              <InlineStatusSelect status={post.status} onChange={(s) => onStatusChange(post.id, s)} />
              <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onEditPost(post)} className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Modifier">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {onDuplicate && (
                  <button onClick={() => onDuplicate(post)} className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Dupliquer">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => onDeletePost(post.id)} className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Supprimer">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {isExpanded && (
              <DraftSection post={post} editDraft={editDraft} setEditDraft={setEditDraft} onUpdateDraft={onUpdateDraft} />
            )}
          </div>
        );
      })}
    </div>
  );
}
