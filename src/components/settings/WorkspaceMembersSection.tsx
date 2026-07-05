import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users, Loader2, Copy, Check, X, Mail } from "lucide-react";

interface Member {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  prenom: string | null;
  email: string | null;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
  invite_url: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Propriétaire",
  manager: "Manager",
  editor: "Éditeur·ice",
  viewer: "Lecture seule",
};

// Section « Membres de l'espace » des paramètres : liste des membres,
// invitation par lien (l'edge ne poste pas d'email — le lien se partage à la
// main) et gestion des invitations en attente. Visible owner/manager only.
export default function WorkspaceMembersSection() {
  const { user } = useAuth();
  const { activeWorkspace, activeRole } = useWorkspace();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  // Lien de la dernière invitation créée, mis en avant juste après l'envoi
  const [freshInviteUrl, setFreshInviteUrl] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const canManage = activeRole === "owner" || activeRole === "manager";
  const workspaceId = activeWorkspace?.id;

  const loadMembers = useCallback(async () => {
    if (!workspaceId) return;
    setLoadError(null);
    const { data, error } = await invokeWithTimeout(
      "invite-to-workspace",
      { body: { action: "list", workspace_id: workspaceId } },
      20000,
    );
    if (error || !data?.success) {
      console.error("[membres] list error:", error, data);
      setLoadError(error?.message || "Impossible de charger les membres. Réessaie.");
    } else {
      setMembers(data.members || []);
      setInvitations(data.invitations || []);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !canManage) return;
    setLoading(true);
    setFreshInviteUrl(null);
    loadMembers();
  }, [workspaceId, canManage, loadMembers]);

  if (!canManage || !workspaceId) return null;

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Email invalide", { description: "Vérifie l'adresse saisie." });
      return;
    }
    setInviting(true);
    setFreshInviteUrl(null);
    const { data, error } = await invokeWithTimeout(
      "invite-to-workspace",
      { body: { workspace_id: workspaceId, email, role: "manager" } },
      20000,
    );
    setInviting(false);
    if (error || !data?.invite_url) {
      console.error("[membres] invite error:", error, data);
      toast.error("Invitation impossible", {
        description: error?.message || "Une erreur est survenue. Réessaie.",
      });
      return;
    }
    setInviteEmail("");
    setFreshInviteUrl(data.invite_url);
    toast.success("Invitation créée ✓", {
      description: "Copie le lien et envoie-le toi-même : aucun email n'est envoyé automatiquement.",
    });
    loadMembers();
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      toast.success("Lien copié ✓");
      setTimeout(() => setCopiedUrl(null), 2500);
    } catch {
      toast.error("Copie impossible", { description: "Sélectionne et copie le lien à la main." });
    }
  };

  const handleRevoke = async (invitation: PendingInvitation) => {
    setRevokingId(invitation.id);
    const { data, error } = await invokeWithTimeout(
      "invite-to-workspace",
      { body: { action: "revoke", workspace_id: workspaceId, invitation_id: invitation.id } },
      20000,
    );
    setRevokingId(null);
    if (error || !data?.success) {
      console.error("[membres] revoke error:", error, data);
      toast.error("Révocation impossible", {
        description: error?.message || "Une erreur est survenue. Réessaie.",
      });
      return;
    }
    if (freshInviteUrl === invitation.invite_url) setFreshInviteUrl(null);
    toast.success("Invitation révoquée", { description: `Le lien envoyé à ${invitation.email} ne fonctionne plus.` });
    loadMembers();
  };

  return (
    <div className="rounded-2xl bg-card border border-border p-6 mb-4">
      <h2 className="font-display text-lg font-bold text-foreground mb-1 flex items-center gap-2">
        <Users className="h-4 w-4" /> Membres de l'espace
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Les personnes qui ont accès à l'espace
        {activeWorkspace?.name ? ` «\u00A0${activeWorkspace.name}\u00A0»` : " actif"}.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
        </div>
      ) : loadError ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setLoading(true); loadMembers(); }}>
            Réessayer
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ─── Liste des membres ─── */}
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {m.prenom || m.email || "Membre"}
                    {m.user_id === user?.id && <span className="text-muted-foreground font-normal"> (toi)</span>}
                  </p>
                  {m.email && <p className="text-xs text-muted-foreground truncate">{m.email}</p>}
                </div>
                <Badge variant={m.role === "owner" ? "default" : "secondary"} className="shrink-0 text-xs">
                  {ROLE_LABELS[m.role] || m.role}
                </Badge>
              </div>
            ))}
          </div>

          {/* ─── Invitations en attente ─── */}
          {invitations.length > 0 && (
            <div>
              <p className="text-xs font-mono-ui text-muted-foreground uppercase tracking-wide mb-2">
                Invitations en attente
              </p>
              <div className="space-y-2">
                {invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-dashed border-border">
                    <div className="min-w-0">
                      {/* truncate sur un conteneur flex ne produit pas d'ellipsis : il faut le span interne */}
                      <p className="text-sm font-medium text-foreground flex items-center gap-1.5 min-w-0">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{inv.email}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ROLE_LABELS[inv.role] || inv.role} · expire le {new Date(inv.expires_at).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full h-8 px-3"
                        onClick={() => handleCopy(inv.invite_url)}
                        aria-label={`Copier le lien d'invitation pour ${inv.email}`}
                      >
                        {copiedUrl === inv.invite_url ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full h-8 px-3 text-destructive hover:text-destructive"
                        onClick={() => handleRevoke(inv)}
                        disabled={revokingId === inv.id}
                        aria-label={`Révoquer l'invitation de ${inv.email}`}
                      >
                        {revokingId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Formulaire d'invitation ─── */}
          <div className="pt-4 border-t border-border space-y-3">
            <div>
              <label htmlFor="invite-member-email" className="text-sm font-medium mb-1.5 block">
                Inviter un·e manager
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Un·e manager peut gérer cet espace avec toi (branding, contenus, calendrier). Tu recevras un lien à lui transmettre — on n'envoie pas d'email à ta place.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="invite-member-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="prenom@exemple.fr"
                  className="rounded-[10px] h-11 flex-1"
                  onKeyDown={(e) => { if (e.key === "Enter" && !inviting && inviteEmail) handleInvite(); }}
                />
                <Button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="rounded-full bg-primary text-primary-foreground hover:bg-bordeaux h-11"
                >
                  {inviting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Création...</>
                  ) : (
                    "Créer l'invitation"
                  )}
                </Button>
              </div>
            </div>

            {freshInviteUrl && (
              <div className="rounded-xl bg-rose-pale/50 border border-primary/20 p-3 space-y-2">
                <p className="text-sm font-medium text-foreground">✉️ Lien d'invitation prêt</p>
                <p className="text-xs text-muted-foreground break-all font-mono-ui">{freshInviteUrl}</p>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => handleCopy(freshInviteUrl)}>
                  {copiedUrl === freshInviteUrl ? (
                    <><Check className="h-3.5 w-3.5 mr-1.5" /> Copié</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copier le lien</>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
