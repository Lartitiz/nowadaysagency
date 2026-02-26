import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { ExternalLink, Image as ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */
interface FeedbackRow {
  id: string;
  user_id: string;
  type: string;
  content: string;
  details: string | null;
  page_url: string | null;
  severity: string | null;
  screenshot_url: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

interface ProfileMap {
  [userId: string]: { prenom: string | null; email: string | null };
}

const STATUS_OPTIONS = [
  { value: "new", label: "Nouveau", color: "bg-rose-100 text-rose-700" },
  { value: "seen", label: "Vu", color: "bg-blue-100 text-blue-700" },
  { value: "in_progress", label: "En cours", color: "bg-orange-100 text-orange-700" },
  { value: "done", label: "Résolu", color: "bg-emerald-100 text-emerald-700" },
  { value: "wont_fix", label: "Won't fix", color: "bg-muted text-muted-foreground" },
];

const SEVERITY_COLORS: Record<string, string> = {
  blocking: "bg-red-500 text-white",
  annoying: "bg-orange-400 text-white",
  minor: "bg-muted text-muted-foreground",
};

/* ── Component ── */
export default function AdminFeedbackTab() {
  const { isAdmin } = useAuth();
  const [feedbacks, setFeedbacks] = useState<FeedbackRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"all" | "bug" | "suggestion">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "new" | "in_progress" | "done">("all");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  /* Fetch feedbacks + profiles */
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("beta_feedback")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) { toast.error("Erreur chargement feedbacks"); setLoading(false); return; }
      const rows = (data || []) as FeedbackRow[];
      setFeedbacks(rows);

      // Init note drafts
      const drafts: Record<string, string> = {};
      rows.forEach(r => { drafts[r.id] = r.admin_notes || ""; });
      setNoteDrafts(drafts);

      // Fetch profiles
      const userIds = [...new Set(rows.map(r => r.user_id))];
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("user_id, prenom, email")
          .in("user_id", userIds);
        const map: ProfileMap = {};
        (profileData || []).forEach((p: any) => { map[p.user_id] = { prenom: p.prenom, email: p.email }; });
        setProfiles(map);
      }
      setLoading(false);
    })();
  }, [isAdmin]);

  const newCount = feedbacks.filter(f => f.status === "new").length;

  const filtered = useMemo(() => {
    let result = feedbacks;
    if (typeFilter !== "all") result = result.filter(f => f.type === typeFilter);
    if (statusFilter === "new") result = result.filter(f => f.status === "new");
    else if (statusFilter === "in_progress") result = result.filter(f => f.status === "in_progress" || f.status === "seen");
    else if (statusFilter === "done") result = result.filter(f => f.status === "done" || f.status === "wont_fix");
    return result;
  }, [feedbacks, typeFilter, statusFilter]);

  /* Actions */
  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("beta_feedback").update({ status }).eq("id", id);
    if (error) { toast.error("Erreur mise à jour"); return; }
    setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, status } : f));
  };

  const saveNotes = async (id: string) => {
    const notes = noteDrafts[id] ?? "";
    const { error } = await supabase.from("beta_feedback").update({ admin_notes: notes }).eq("id", id);
    if (error) { toast.error("Erreur sauvegarde notes"); return; }
    setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, admin_notes: notes } : f));
  };

  if (!isAdmin) return null;

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 rounded-2xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  const statusBadgeClass = (s: string) => STATUS_OPTIONS.find(o => o.value === s)?.color || "bg-muted text-muted-foreground";

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
          {([["all", "Tous"], ["bug", "🐛 Bugs"], ["suggestion", "💡 Suggestions"]] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTypeFilter(val)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm transition-colors",
                typeFilter === val ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
          {([["all", "Tous"], ["new", "Nouveaux"], ["in_progress", "En cours"], ["done", "Résolus"]] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm transition-colors",
                statusFilter === val ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
              {val === "new" && newCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                  {newCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} feedback{filtered.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-display">Aucun feedback pour le moment.</p>
          <p className="text-sm mt-1">C'est bon signe… ou pas 😅</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(fb => {
            const profile = profiles[fb.user_id];
            const userName = profile?.prenom || profile?.email || fb.user_id.slice(0, 8);
            return (
              <div key={fb.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-lg">{fb.type === "bug" ? "🐛" : "💡"}</span>
                    {fb.type === "bug" && fb.severity && (
                      <Badge className={cn("text-[10px] px-1.5 py-0", SEVERITY_COLORS[fb.severity] || "bg-muted")}>
                        {fb.severity}
                      </Badge>
                    )}
                    <span className="text-sm font-medium text-foreground font-mono">{userName}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(fb.created_at), { addSuffix: true, locale: fr })}
                    </span>
                  </div>
                  <Badge className={cn("text-[10px] shrink-0", statusBadgeClass(fb.status))}>
                    {STATUS_OPTIONS.find(o => o.value === fb.status)?.label || fb.status}
                  </Badge>
                </div>

                {/* Content */}
                <p className="text-sm text-foreground font-mono leading-relaxed">{fb.content}</p>
                {fb.details && (
                  <p className="text-xs text-muted-foreground font-mono leading-relaxed">{fb.details}</p>
                )}

                {/* Page URL */}
                {fb.page_url && (
                  <a
                    href={fb.page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline truncate max-w-xs"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    {fb.page_url.replace(/^https?:\/\/[^/]+/, "").slice(0, 60)}
                  </a>
                )}

                {/* Screenshot */}
                {fb.screenshot_url && (
                  <button
                    onClick={() => setLightboxUrl(fb.screenshot_url)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    <img
                      src={fb.screenshot_url}
                      alt="Screenshot"
                      className="h-16 rounded-lg border border-border object-cover cursor-pointer hover:opacity-80 transition-opacity"
                    />
                  </button>
                )}

                {/* Admin actions */}
                <div className="flex items-end gap-3 pt-2 border-t border-border/50">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Statut</label>
                    <select
                      value={fb.status}
                      onChange={e => updateStatus(fb.id, e.target.value)}
                      className="text-xs bg-transparent border border-border rounded-md px-2 py-1.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {STATUS_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Notes admin</label>
                    <input
                      type="text"
                      value={noteDrafts[fb.id] ?? ""}
                      onChange={e => setNoteDrafts(prev => ({ ...prev, [fb.id]: e.target.value }))}
                      onBlur={() => saveNotes(fb.id)}
                      placeholder="Ajouter une note…"
                      className="text-xs bg-transparent border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white hover:text-white/80"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Screenshot agrandie"
            className="max-w-full max-h-[90vh] rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
