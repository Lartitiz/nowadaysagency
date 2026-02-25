import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Trash2, Loader2, Link2, Plus, AlertTriangle, FileSpreadsheet, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";
import * as XLSX from "xlsx";

interface Share {
  id: string;
  share_token: string;
  label: string | null;
  guest_name: string | null;
  canal_filter: string;
  show_content_draft: boolean;
  guest_can_edit_status: boolean;
  guest_can_edit_wording: boolean;
  view_mode: string;
  show_columns: string[];
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  unresolved_count?: number;
  edit_count?: number;
  to_validate_count?: number;
  edit_logs?: EditLog[];
}

interface EditLog {
  author_name: string;
  content: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EXPIRY_OPTIONS = [
  { label: "Jamais", days: null },
  { label: "7 jours", days: 7 },
  { label: "30 jours", days: 30 },
  { label: "90 jours", days: 90 },
];

const CANAL_OPTIONS = [
  { id: "all", label: "Tout" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "pinterest", label: "Pinterest" },
];

const VIEW_MODE_OPTIONS = [
  { id: "table", label: "Table" },
  { id: "calendar", label: "Calendrier" },
  { id: "both", label: "Les deux" },
];

const COLUMN_OPTIONS = [
  { id: "theme", label: "Thème", default: true },
  { id: "status", label: "Statut", default: true },
  { id: "date", label: "Date", default: true },
  { id: "wording", label: "Wording", default: true },
  { id: "canal", label: "Canal", default: true },
  { id: "format", label: "Format", default: true },
  { id: "phase", label: "Phase", default: true },
  { id: "description", label: "Description", default: false },
  { id: "notes", label: "Notes", default: false },
];

const STATUS_LABELS: Record<string, string> = {
  idea: "Pas commencé",
  a_rediger: "À rédiger",
  drafting: "En cours",
  ready: "À valider",
  draft_ready: "Validé",
  published: "Posté",
};

export function CalendarShareDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const { toast } = useToast();
  const [tab, setTab] = useState<"list" | "create">("list");
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedShare, setExpandedShare] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Create form
  const [label, setLabel] = useState("");
  const [canal, setCanal] = useState("all");
  const [showDraft, setShowDraft] = useState(false);
  const [guestCanEditStatus, setGuestCanEditStatus] = useState(true);
  const [guestCanEditWording, setGuestCanEditWording] = useState(false);
  const [viewMode, setViewMode] = useState("table");
  const [showColumns, setShowColumns] = useState<string[]>(
    COLUMN_OPTIONS.filter(c => c.default).map(c => c.id)
  );
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const toggleColumn = (colId: string) => {
    setShowColumns(prev =>
      prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId]
    );
  };

  const fetchShares = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await (supabase.from("calendar_shares") as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) {
      const shareIds = data.map((s: any) => s.id);
      if (shareIds.length > 0) {
        // Fetch comments (unresolved + edits)
        const { data: comments } = await (supabase.from("calendar_comments") as any)
          .select("share_id, content, is_resolved, author_name, created_at")
          .in("share_id", shareIds)
          .order("created_at", { ascending: false });

        const unresolvedCounts: Record<string, number> = {};
        const editCounts: Record<string, number> = {};
        const editLogs: Record<string, EditLog[]> = {};

        (comments || []).forEach((c: any) => {
          if (!c.is_resolved && !c.content.startsWith("[EDIT]")) {
            unresolvedCounts[c.share_id] = (unresolvedCounts[c.share_id] || 0) + 1;
          }
          if (c.content.startsWith("[EDIT]")) {
            editCounts[c.share_id] = (editCounts[c.share_id] || 0) + 1;
            if (!editLogs[c.share_id]) editLogs[c.share_id] = [];
            if (editLogs[c.share_id].length < 5) {
              editLogs[c.share_id].push({
                author_name: c.author_name,
                content: c.content,
                created_at: c.created_at,
              });
            }
          }
        });

        // Fetch "ready" post counts per share's user+workspace
        // We need to count posts with status "ready" for each share
        for (const s of data) {
          s.unresolved_count = unresolvedCounts[s.id] || 0;
          s.edit_count = editCounts[s.id] || 0;
          s.edit_logs = editLogs[s.id] || [];
          s.show_columns = s.show_columns || COLUMN_OPTIONS.filter(c => c.default).map(c => c.id);
        }

        // Get to_validate counts (posts with status "ready")
        let postsQuery = (supabase.from("calendar_posts") as any)
          .select("id, status")
          .eq("user_id", user.id)
          .eq("status", "ready");
        if (workspaceId) postsQuery = postsQuery.eq("workspace_id", workspaceId);
        const { data: readyPosts } = await postsQuery;
        const readyCount = (readyPosts || []).length;
        data.forEach((s: any) => { s.to_validate_count = readyCount; });
      }
      setShares(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      fetchShares();
      setTab("list");
      setCreatedToken(null);
    }
  }, [open, user]);

  const getShareUrl = (token: string) => `${window.location.origin}/calendrier/partage/${token}`;

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(getShareUrl(token));
    toast({ title: "Lien copié !" });
  };

  const toggleActive = async (share: Share) => {
    await (supabase.from("calendar_shares") as any)
      .update({ is_active: !share.is_active })
      .eq("id", share.id);
    setShares(prev => prev.map(s => s.id === share.id ? { ...s, is_active: !s.is_active } : s));
  };

  const deleteShare = async (id: string) => {
    await (supabase.from("calendar_shares") as any).delete().eq("id", id);
    setShares(prev => prev.filter(s => s.id !== id));
    setConfirmDeleteId(null);
    toast({ title: "Lien supprimé" });
  };

  const handleCreate = async () => {
    if (!user) return;
    setCreating(true);
    const expiresAt = expiryDays
      ? new Date(Date.now() + expiryDays * 86400000).toISOString()
      : null;

    const { data, error } = await (supabase.from("calendar_shares") as any)
      .insert({
        user_id: user.id,
        workspace_id: workspaceId || null,
        label: label.trim() || null,
        canal_filter: canal,
        show_content_draft: showDraft,
        guest_can_edit_status: guestCanEditStatus,
        guest_can_edit_wording: guestCanEditWording,
        view_mode: viewMode,
        show_columns: showColumns,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erreur lors de la création", variant: "destructive" });
    } else {
      setCreatedToken(data.share_token);
      setShares(prev => [{ ...data, unresolved_count: 0, edit_count: 0, to_validate_count: 0, edit_logs: [] }, ...prev]);
      toast({ title: "Lien créé !" });
    }
    setCreating(false);
  };

  // ── Excel Export ──

  const handleExportExcel = async () => {
    if (!user) return;
    setExporting(true);

    try {
      let postsQuery = (supabase.from("calendar_posts") as any)
        .select("date, theme, status, content_draft, notes, canal, format, category, audience_phase, objectif")
        .eq("user_id", user.id)
        .order("date");
      if (workspaceId) postsQuery = postsQuery.eq("workspace_id", workspaceId);

      const { data: posts } = await postsQuery;
      if (!posts || posts.length === 0) {
        toast({ title: "Aucun post à exporter" });
        setExporting(false);
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("prenom")
        .eq("user_id", user.id)
        .maybeSingle();

      const prenom = (profileData as any)?.prenom || "calendrier";
      const dateStr = format(new Date(), "yyyy-MM-dd");
      const fileName = `calendrier-${prenom}-${dateStr}.xlsx`;

      const socialPosts = posts.filter((p: any) => !["email", "newsletter"].includes(p.canal));
      const emailPosts = posts.filter((p: any) => ["email", "newsletter"].includes(p.canal));

      const mapRow = (p: any) => ({
        "Date": p.date ? format(new Date(p.date), "d MMM yyyy", { locale: fr }) : "",
        "Idée / Thème": p.theme || "",
        "Statut": STATUS_LABELS[p.status] || p.status || "",
        "Wording": p.content_draft || "",
        "Description": p.objectif || "",
        "Phase": p.category || p.audience_phase || "",
        "Canal": p.canal || "",
        "Format": p.format || "",
        "Notes": p.notes || "",
      });

      const wb = XLSX.utils.book_new();

      // Social media sheet
      const socialSheet = XLSX.utils.json_to_sheet(socialPosts.map(mapRow));
      // Bold headers
      const range = XLSX.utils.decode_range(socialSheet["!ref"] || "A1");
      for (let col = range.s.c; col <= range.e.c; col++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c: col });
        if (socialSheet[addr]) {
          socialSheet[addr].s = { font: { bold: true } };
        }
      }
      // Column widths
      socialSheet["!cols"] = [
        { wch: 14 }, { wch: 35 }, { wch: 14 }, { wch: 50 }, { wch: 25 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 30 },
      ];
      XLSX.utils.book_append_sheet(wb, socialSheet, "Social Media");

      // Email sheet
      if (emailPosts.length > 0) {
        const emailSheet = XLSX.utils.json_to_sheet(emailPosts.map(mapRow));
        emailSheet["!cols"] = socialSheet["!cols"];
        XLSX.utils.book_append_sheet(wb, emailSheet, "Email");
      }

      XLSX.writeFile(wb, fileName);
      toast({ title: "Export téléchargé !" });
    } catch {
      toast({ title: "Erreur lors de l'export", variant: "destructive" });
    }
    setExporting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">🔗 Partager le calendrier</DialogTitle>
          <DialogDescription className="sr-only">Gérer les liens de partage du calendrier éditorial</DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex rounded-full border border-border overflow-hidden mb-4">
          <button
            onClick={() => { setTab("list"); setCreatedToken(null); }}
            className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${tab === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Mes liens
          </button>
          <button
            onClick={() => { setTab("create"); setCreatedToken(null); }}
            className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${tab === "create" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Créer un lien
          </button>
        </div>

        {/* ═══════ LIST TAB ═══════ */}
        {tab === "list" && (
          <div className="space-y-3">
            {/* Export button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full rounded-full gap-1.5 text-xs"
              onClick={handleExportExcel}
              disabled={exporting}
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
              📊 Exporter en Excel
            </Button>

            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : shares.length === 0 ? (
              <div className="text-center py-8">
                <Link2 className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Tu n'as pas encore de lien de partage.</p>
                <Button size="sm" className="mt-3 rounded-full gap-1.5" onClick={() => setTab("create")}>
                  <Plus className="h-3.5 w-3.5" /> Créer un lien
                </Button>
              </div>
            ) : (
              shares.map(share => {
                const isExpanded = expandedShare === share.id;
                return (
                  <div key={share.id} className={`rounded-xl border p-3 transition-colors ${share.is_active ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {share.label || "Sans nom"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Créé {formatDistanceToNow(new Date(share.created_at), { addSuffix: true, locale: fr })}
                          {share.canal_filter !== "all" && ` · ${share.canal_filter}`}
                          {share.guest_name && ` · ${share.guest_name}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {(share.edit_count || 0) > 0 && (
                          <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                            ✏️ {share.edit_count}
                          </span>
                        )}
                        {(share.to_validate_count || 0) > 0 && (
                          <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                            ⏳ {share.to_validate_count}
                          </span>
                        )}
                        {(share.unresolved_count || 0) > 0 && (
                          <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            💬 {share.unresolved_count}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" size="sm" className="rounded-full text-xs gap-1 h-7" onClick={() => copyLink(share.share_token)}>
                        <Copy className="h-3 w-3" /> Copier
                      </Button>
                      {(share.edit_logs || []).length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full text-xs gap-1 h-7 text-muted-foreground"
                          onClick={() => setExpandedShare(isExpanded ? null : share.id)}
                        >
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          Historique
                        </Button>
                      )}
                      <div className="flex items-center gap-1.5 ml-auto">
                        <Switch checked={share.is_active} onCheckedChange={() => toggleActive(share)} className="scale-75" />
                        {confirmDeleteId === share.id ? (
                          <div className="flex items-center gap-1">
                            <Button variant="destructive" size="sm" className="h-7 text-xs rounded-full" onClick={() => deleteShare(share.id)}>Confirmer</Button>
                            <Button variant="outline" size="sm" className="h-7 text-xs rounded-full" onClick={() => setConfirmDeleteId(null)}>Annuler</Button>
                          </div>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDeleteId(share.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Edit logs */}
                    {isExpanded && (share.edit_logs || []).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border space-y-1.5">
                        {share.edit_logs!.map((log, i) => (
                          <p key={i} className="text-[11px] text-muted-foreground leading-snug">
                            <span className="font-medium text-foreground">{log.author_name}</span>{" "}
                            {log.content.replace("[EDIT] ", "").toLowerCase()}{" "}
                            <span className="text-muted-foreground/60">
                              {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: fr })}
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ═══════ CREATE TAB ═══════ */}
        {tab === "create" && !createdToken && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nom du lien</label>
              <Input placeholder="Ex: Planning Mars — Marie" value={label} onChange={e => setLabel(e.target.value)} />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Canal</label>
              <div className="flex flex-wrap gap-1.5">
                {CANAL_OPTIONS.map(c => (
                  <button key={c.id} onClick={() => setCanal(c.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${canal === c.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Permissions */}
            <div className="space-y-3 rounded-xl border border-border p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Permissions client·e</p>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium block">Montrer les brouillons</label>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    Le/la client·e verra le texte de tes posts
                  </p>
                </div>
                <Switch checked={showDraft} onCheckedChange={setShowDraft} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium block">Peut changer les statuts</label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Valider, mettre en révision, etc.</p>
                </div>
                <Switch checked={guestCanEditStatus} onCheckedChange={setGuestCanEditStatus} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium block">Peut modifier les textes</label>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    Le/la client·e pourra éditer le wording
                  </p>
                </div>
                <Switch checked={guestCanEditWording} onCheckedChange={setGuestCanEditWording} />
              </div>
            </div>

            {/* View mode */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Vue par défaut</label>
              <div className="flex flex-wrap gap-1.5">
                {VIEW_MODE_OPTIONS.map(v => (
                  <button key={v.id} onClick={() => setViewMode(v.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${viewMode === v.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Columns */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Colonnes visibles</label>
              <div className="grid grid-cols-3 gap-2">
                {COLUMN_OPTIONS.map(col => (
                  <label key={col.id} className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                    <Checkbox
                      checked={showColumns.includes(col.id)}
                      onCheckedChange={() => toggleColumn(col.id)}
                      className="h-3.5 w-3.5"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Expiry */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Expire dans</label>
              <div className="flex flex-wrap gap-1.5">
                {EXPIRY_OPTIONS.map(o => (
                  <button key={o.label} onClick={() => setExpiryDays(o.days)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${expiryDays === o.days ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={handleCreate} disabled={creating || showColumns.length === 0} className="w-full rounded-full gap-1.5">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Créer le lien de partage
            </Button>
          </div>
        )}

        {/* ═══════ CREATED ═══════ */}
        {tab === "create" && createdToken && (
          <div className="space-y-4 text-center py-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Link2 className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">Lien de partage créé !</p>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground break-all">{getShareUrl(createdToken)}</p>
            </div>
            <Button onClick={() => copyLink(createdToken)} className="w-full rounded-full gap-1.5" size="lg">
              <Copy className="h-4 w-4" /> 📋 Copier le lien
            </Button>
            <p className="text-xs text-muted-foreground">
              Envoie ce lien à ton/ta client·e. Iel pourra voir ton calendrier et laisser des commentaires sur chaque post.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
