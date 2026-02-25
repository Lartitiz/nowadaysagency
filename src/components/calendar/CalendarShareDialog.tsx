import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Trash2, Loader2, Link2, Plus, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

interface Share {
  id: string;
  share_token: string;
  label: string | null;
  guest_name: string | null;
  canal_filter: string;
  show_content_draft: boolean;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  unresolved_count?: number;
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

export function CalendarShareDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const { toast } = useToast();
  const [tab, setTab] = useState<"list" | "create">("list");
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);

  // Create form
  const [label, setLabel] = useState("");
  const [canal, setCanal] = useState("all");
  const [showDraft, setShowDraft] = useState(false);
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchShares = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await (supabase.from("calendar_shares") as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) {
      // Get unresolved comment counts
      const shareIds = data.map((s: any) => s.id);
      if (shareIds.length > 0) {
        const { data: comments } = await (supabase.from("calendar_comments") as any)
          .select("share_id")
          .in("share_id", shareIds)
          .eq("is_resolved", false);

        const counts: Record<string, number> = {};
        (comments || []).forEach((c: any) => {
          counts[c.share_id] = (counts[c.share_id] || 0) + 1;
        });
        data.forEach((s: any) => { s.unresolved_count = counts[s.id] || 0; });
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

  const getShareUrl = (token: string) => {
    return `${window.location.origin}/calendrier/partage/${token}`;
  };

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
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erreur lors de la création", variant: "destructive" });
    } else {
      setCreatedToken(data.share_token);
      setShares(prev => [{ ...data, unresolved_count: 0 }, ...prev]);
      toast({ title: "Lien créé !" });
    }
    setCreating(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
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

        {tab === "list" && (
          <div className="space-y-3">
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
              shares.map(share => (
                <div key={share.id} className={`rounded-xl border p-3 transition-colors ${share.is_active ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {share.label || "Sans nom"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Créé {formatDistanceToNow(new Date(share.created_at), { addSuffix: true, locale: fr })}
                        {share.canal_filter !== "all" && ` · ${share.canal_filter}`}
                      </p>
                    </div>
                    {(share.unresolved_count || 0) > 0 && (
                      <span className="shrink-0 text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        💬 {share.unresolved_count}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="rounded-full text-xs gap-1 h-7" onClick={() => copyLink(share.share_token)}>
                      <Copy className="h-3 w-3" /> Copier
                    </Button>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Switch checked={share.is_active} onCheckedChange={() => toggleActive(share)} className="scale-75" />
                      {confirmDeleteId === share.id ? (
                        <div className="flex items-center gap-1">
                          <Button variant="destructive" size="sm" className="h-7 text-xs rounded-full" onClick={() => deleteShare(share.id)}>
                            Confirmer
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs rounded-full" onClick={() => setConfirmDeleteId(null)}>
                            Annuler
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDeleteId(share.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "create" && !createdToken && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nom du lien</label>
              <Input
                placeholder="Ex: Planning Mars — Marie"
                value={label}
                onChange={e => setLabel(e.target.value)}
              />
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

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium block">Montrer les brouillons</label>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  Si activé, le/la client·e verra le texte de tes posts
                </p>
              </div>
              <Switch checked={showDraft} onCheckedChange={setShowDraft} />
            </div>

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

            <Button onClick={handleCreate} disabled={creating} className="w-full rounded-full gap-1.5">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Créer le lien de partage
            </Button>
          </div>
        )}

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
