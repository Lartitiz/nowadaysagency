import { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Plus, Mail, ExternalLink, Lock, Copy, Check, Loader2, Globe, Instagram, Linkedin, X, LinkIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace, Workspace } from "@/contexts/WorkspaceContext";
import { useUserPlan } from "@/hooks/use-user-plan";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/error-messages";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface ExtraLink {
  type: string;
  url: string;
}

const EXTRA_LINK_TYPES = ["Pinterest", "TikTok", "YouTube", "Autre"];

export default function ClientsPage() {
  const { user, isAdmin, adminLoading } = useAuth();
  const { workspaces, switchWorkspace, loading, activeRole } = useWorkspace();
  const { plan, loading: planLoading, isPilot } = useUserPlan();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [extraLinks, setExtraLinks] = useState<ExtraLink[]>([]);
  const [creating, setCreating] = useState(false);

  // Invite dialog state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteWorkspace, setInviteWorkspace] = useState<Workspace | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("owner");
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  const resetForm = () => {
    setName("");
    setEmail("");
    setWebsiteUrl("");
    setInstagramUrl("");
    setLinkedinUrl("");
    setExtraLinks([]);
  };

  const addExtraLink = () => {
    if (extraLinks.length >= 5) {
      toast.error("5 liens supplémentaires maximum.");
      return;
    }
    setExtraLinks([...extraLinks, { type: "Autre", url: "" }]);
  };

  const updateExtraLink = (index: number, field: "type" | "url", value: string) => {
    setExtraLinks((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };

  const removeExtraLink = (index: number) => {
    setExtraLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !user?.id) return;
    setCreating(true);
    try {
      const insertData: Record<string, any> = {
        name: name.trim(),
        created_by: user.id,
      };
      if (websiteUrl.trim()) insertData.website_url = websiteUrl.trim();
      if (instagramUrl.trim()) insertData.instagram_url = instagramUrl.trim();
      if (linkedinUrl.trim()) insertData.linkedin_url = linkedinUrl.trim();
      const validExtra = extraLinks.filter((l) => l.url.trim());
      if (validExtra.length > 0) insertData.extra_links = validExtra;

      const { data: ws, error: wsErr } = await supabase
        .from("workspaces" as any)
        .insert(insertData as any)
        .select("id")
        .single();

      if (wsErr || !ws) throw wsErr || new Error("Erreur création workspace");

      const { error: memErr } = await supabase
        .from("workspace_members" as any)
        .insert({ workspace_id: (ws as any).id, user_id: user.id, role: "manager" } as any);

      if (memErr) throw memErr;

      toast.success(`Espace "${name.trim()}" créé !`);
      resetForm();
      setDialogOpen(false);
      window.location.reload();
    } catch (e: any) {
      console.error(e);
      toast.error(friendlyError(e));
    } finally {
      setCreating(false);
    }
  }, [name, user?.id, websiteUrl, instagramUrl, linkedinUrl, extraLinks]);

  const handleOpen = (wsId: string) => {
    switchWorkspace(wsId);
    navigate("/dashboard");
  };

  const openInviteDialog = (ws: Workspace) => {
    setInviteWorkspace(ws);
    setInviteEmail("");
    setInviteRole("owner");
    setInviteLink("");
    setCopied(false);
    setInviteDialogOpen(true);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteWorkspace) return;
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-to-workspace", {
        body: {
          workspace_id: inviteWorkspace.id,
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
        },
      });

      if (error) throw error;

      if (data?.error) {
        if (data.error.includes("déjà membre") || data.error.includes("déjà en attente")) {
          toast.error("Cette personne est déjà membre de cet espace.");
        } else {
          toast.error(data.error);
        }
        setInviting(false);
        return;
      }

      const token = data?.token;
      if (token) {
        const link = `${window.location.origin}/invite/${token}`;
        setInviteLink(link);
        toast.success("Invitation envoyée !");
      }
    } catch (e: any) {
      console.error("Invite error:", e);
      toast.error("Erreur lors de l'envoi de l'invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success("Lien copié !");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier");
    }
  };

  // Gatekeeping: only studio, now_pilot, or users who manage a workspace
  const hasManagerRole = workspaces.length > 0 && activeRole === "manager";
  const canAccess = isAdmin || plan === "studio" || plan === "now_pilot" || isPilot || hasManagerRole;

  if (!planLoading && !adminLoading && !canAccess) {
    return (
      <div className="min-h-screen bg-background pb-24 md:pb-8">
        <AppHeader />
        <main className="mx-auto max-w-[1100px] px-4 sm:px-6 py-12">
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="font-display text-lg font-bold text-foreground mb-2">Fonctionnalité accompagnement</h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
              Le mode multi-clients est disponible avec l'accompagnement binôme. Gère plusieurs client·es depuis un seul compte.
            </p>
            <Button asChild className="rounded-full">
              <Link to="/parametres">Découvrir l'accompagnement →</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <AppHeader />
      <main className="mx-auto max-w-[1100px] px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">Mes client·es</h1>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nouveau client
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-primary animate-bounce" />
              <div className="h-3 w-3 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.15s" }} />
              <div className="h-3 w-3 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.3s" }} />
            </div>
          </div>
        ) : workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <p className="text-4xl">👥</p>
            <p className="text-muted-foreground text-sm max-w-sm">
              Tu n'as pas encore de client·es. Crée un premier espace pour commencer.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Créer un espace client
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces.map((ws) => {
              const wsAny = ws as any;
              const hasWebsite = !!wsAny.website_url;
              const hasInstagram = !!wsAny.instagram_url;
              const hasLinkedin = !!wsAny.linkedin_url;
              const hasLinks = hasWebsite || hasInstagram || hasLinkedin;

              return (
                <Card key={ws.id} className="p-5 space-y-3 rounded-[20px] border border-border hover:border-primary/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <h3 className="font-display text-base font-bold text-foreground">{ws.name}</h3>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {ws.plan === "free" ? "Gratuit" : ws.plan}
                    </Badge>
                  </div>
                  {hasLinks && (
                    <div className="flex items-center gap-2">
                      {hasWebsite && (
                        <a href={wsAny.website_url.startsWith("http") ? wsAny.website_url : `https://${wsAny.website_url}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors" title="Site web">
                          <Globe className="h-4 w-4" />
                        </a>
                      )}
                      {hasInstagram && (
                        <a href={wsAny.instagram_url.startsWith("http") ? wsAny.instagram_url : `https://instagram.com/${wsAny.instagram_url.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors" title="Instagram">
                          <Instagram className="h-4 w-4" />
                        </a>
                      )}
                      {hasLinkedin && (
                        <a href={wsAny.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors" title="LinkedIn">
                          <Linkedin className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="flex-1" onClick={() => handleOpen(ws.id)}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ouvrir
                    </Button>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => openInviteDialog(ws)}>
                      <Mail className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Nouvel espace client</DialogTitle>
              <DialogDescription className="sr-only">Créer un nouvel espace de travail pour un·e client·e</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="client-name">Nom du/de la client·e *</Label>
                <Input
                  id="client-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex : Marie Dupont"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-email">Email (optionnel)</Label>
                <Input
                  id="client-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="marie@exemple.com"
                />
                <p className="text-[11px] text-muted-foreground">L'invitation par email sera disponible prochainement.</p>
              </div>

              {/* Links section */}
              <div className="space-y-3 pt-2 border-t border-border">
                <Label className="text-sm font-medium">🔗 Liens utiles (optionnel)</Label>
                <p className="text-[11px] text-muted-foreground -mt-1">Ces liens seront analysés pour pré-remplir le branding automatiquement.</p>

                <div className="space-y-2">
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="https://monsite.com"
                      className="pl-9"
                    />
                  </div>
                  <div className="relative">
                    <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={instagramUrl}
                      onChange={(e) => setInstagramUrl(e.target.value)}
                      placeholder="@compte ou https://instagram.com/compte"
                      className="pl-9"
                    />
                  </div>
                  <div className="relative">
                    <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      placeholder="URL du profil LinkedIn"
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Extra links */}
                {extraLinks.map((link, i) => (
                  <div key={i} className="flex gap-2">
                    <Select value={link.type} onValueChange={(v) => updateExtraLink(i, "type", v)}>
                      <SelectTrigger className="w-[120px] shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXTRA_LINK_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={link.url}
                      onChange={(e) => updateExtraLink(i, "url", e.target.value)}
                      placeholder="https://..."
                      className="flex-1"
                    />
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => removeExtraLink(i)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                {extraLinks.length < 5 && (
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={addExtraLink}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter un autre lien
                  </Button>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={!name.trim() || creating}>
                {creating ? "Création..." : "Créer l'espace"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Invite dialog */}
        <Dialog open={inviteDialogOpen} onOpenChange={(open) => { setInviteDialogOpen(open); if (!open) setInviteLink(""); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display">
                Inviter un·e client·e à {inviteWorkspace?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email *</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="client@exemple.com"
                  autoFocus
                  disabled={!!inviteLink}
                />
              </div>
              <div className="space-y-2">
                <Label>Rôle</Label>
                <Select value={inviteRole} onValueChange={setInviteRole} disabled={!!inviteLink}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Propriétaire (accès complet)</SelectItem>
                    <SelectItem value="viewer">Lecteur·ice (lecture seule)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {inviteLink && (
                <div className="space-y-2">
                  <Label>Lien d'invitation</Label>
                  <div className="flex gap-2">
                    <Input value={inviteLink} readOnly className="text-xs" />
                    <Button size="sm" variant="outline" onClick={handleCopy} className="shrink-0">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Partage ce lien avec ton/ta client·e pour qu'il/elle rejoigne l'espace.</p>
                </div>
              )}
            </div>
            <DialogFooter>
              {!inviteLink ? (
                <Button onClick={handleInvite} disabled={!inviteEmail.trim() || inviting}>
                  {inviting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Envoi…
                    </>
                  ) : (
                    "Envoyer l'invitation"
                  )}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                  Fermer
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
