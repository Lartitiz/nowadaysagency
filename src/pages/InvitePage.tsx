import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface InvitationData {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  workspace_name: string;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "accepting" | "accepted">("loading");

  // Fetch invitation on mount
  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    async function fetchInvitation() {
      const { data, error } = await supabase
        .from("workspace_invitations" as any)
        .select("id, workspace_id, email, role, workspaces:workspace_id(name)")
        .eq("token", token)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (error || !data) {
        setStatus("invalid");
        return;
      }

      const row = data as any;
      setInvitation({
        id: row.id,
        workspace_id: row.workspace_id,
        email: row.email,
        role: row.role,
        workspace_name: row.workspaces?.name || "Espace inconnu",
      });
      setStatus("valid");
    }

    fetchInvitation();
  }, [token]);

  const handleAccept = async () => {
    if (!user || !invitation) return;
    setStatus("accepting");

    try {
      // Insert into workspace_members
      const { error: memberErr } = await supabase
        .from("workspace_members" as any)
        .insert({
          workspace_id: invitation.workspace_id,
          user_id: user.id,
          role: invitation.role,
        } as any);

      if (memberErr) {
        // Unique constraint = already a member
        if (memberErr.code === "23505") {
          toast.info("Tu fais déjà partie de cet espace !");
        } else {
          throw memberErr;
        }
      }

      // Mark invitation as accepted
      await supabase
        .from("workspace_invitations" as any)
        .update({ accepted_at: new Date().toISOString() } as any)
        .eq("id", invitation.id);

      setStatus("accepted");
      toast.success(`Tu as rejoint l'espace "${invitation.workspace_name}" !`);

      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (e: any) {
      console.error("Accept invitation error:", e);
      toast.error(friendlyError(e));
      setStatus("valid");
    }
  };

  // Loading states
  if (authLoading || status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.15s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.3s" }} />
        </div>
      </div>
    );
  }

  // Invalid or expired
  if (status === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full p-8 text-center rounded-2xl border border-border">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <XCircle className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="font-display text-lg font-bold text-foreground mb-2">
            Invitation invalide
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Cette invitation a expiré ou n'est plus valide.
          </p>
          <Button asChild className="rounded-full">
            <Link to="/">Retour à l'accueil</Link>
          </Button>
        </Card>
      </div>
    );
  }

  // Accepted confirmation
  if (status === "accepted") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full p-8 text-center rounded-2xl border border-border">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <h2 className="font-display text-lg font-bold text-foreground mb-2">
            Bienvenue dans l'espace !
          </h2>
          <p className="text-sm text-muted-foreground">
            Redirection vers le tableau de bord…
          </p>
        </Card>
      </div>
    );
  }

  // Valid invitation
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="max-w-md w-full p-8 text-center rounded-2xl border border-border">
        <div className="mx-auto mb-4 text-4xl">✉️</div>
        <h2 className="font-display text-lg font-bold text-foreground mb-2">
          Tu es invité·e à rejoindre l'espace
        </h2>
        <p className="text-xl font-display font-bold text-primary mb-6">
          {invitation!.workspace_name}
        </p>

        {user ? (
          <Button
            onClick={handleAccept}
            disabled={status === "accepting"}
            className="w-full rounded-full"
          >
            {status === "accepting" ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Acceptation…
              </>
            ) : (
              "Accepter l'invitation"
            )}
          </Button>
        ) : (
          <div className="space-y-3">
            <Button asChild className="w-full rounded-full">
              <Link to={`/login?redirect=/invite/${token}`}>
                J'ai déjà un compte
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full rounded-full">
              <Link to={`/login?tab=signup&redirect=/invite/${token}`}>
                Créer mon compte
              </Link>
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
