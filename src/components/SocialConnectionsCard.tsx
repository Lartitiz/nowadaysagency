import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Instagram, Linkedin, Loader2, CheckCircle2, ExternalLink, Palette } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";

type Connection = {
  platform: "instagram" | "linkedin" | "canva" | "pinterest";
  connected: boolean;
  accountName?: string | null;
  expiresAt?: string | null;
};

function PinterestIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 0a12 12 0 0 0-4.37 23.17c-.1-.94-.2-2.4.04-3.43.22-.93 1.4-5.94 1.4-5.94s-.36-.72-.36-1.78c0-1.67.97-2.92 2.18-2.92 1.03 0 1.52.77 1.52 1.7 0 1.03-.66 2.58-1 4.01-.28 1.2.6 2.18 1.78 2.18 2.14 0 3.78-2.26 3.78-5.51 0-2.88-2.07-4.9-5.03-4.9-3.42 0-5.43 2.57-5.43 5.22 0 1.03.4 2.14.89 2.74.1.12.11.22.08.34l-.33 1.36c-.05.22-.17.27-.4.16-1.5-.7-2.43-2.88-2.43-4.64 0-3.78 2.75-7.25 7.92-7.25 4.16 0 7.39 2.96 7.39 6.93 0 4.13-2.6 7.46-6.22 7.46-1.21 0-2.35-.63-2.74-1.37l-.75 2.85c-.27 1.04-1 2.35-1.49 3.15A12 12 0 1 0 12 0z" />
    </svg>
  );
}

export default function SocialConnectionsCard() {
  const { session } = useAuth();
  const workspaceId = useWorkspaceId();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connections, setConnections] = useState<Record<string, Connection>>({});

  const wsParam =
    workspaceId && session?.user && workspaceId !== session.user.id ? workspaceId : undefined;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("social-status", {
        body: { workspace_id: wsParam },
      });
      if (error) throw error;
      const map: Record<string, Connection> = {};
      ((data as any)?.connections || []).forEach((c: Connection) => {
        map[c.platform] = c;
      });
      setConnections(map);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [wsParam]);

  useEffect(() => {
    reload();
    // Toast au retour OAuth
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    if (
      connected === "instagram" ||
      connected === "linkedin" ||
      connected === "canva" ||
      connected === "pinterest"
    ) {
      toast.success(
        connected === "linkedin" ? "LinkedIn connecté !"
          : connected === "canva" ? "Canva connecté !"
          : connected === "pinterest" ? "Pinterest connecté !"
          : "Instagram connecté !",
      );
      params.delete("connected");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    } else if (connected === "error") {
      toast.error(params.get("message") || "Échec de la connexion.");
      params.delete("connected");
      params.delete("message");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, [reload]);

  const handleConnect = async (platform: "instagram" | "linkedin" | "canva" | "pinterest") => {
    setConnecting(platform);
    try {
      const { data, error } = await supabase.functions.invoke("social-oauth-start", {
        body: {
          platform,
          workspace_id: wsParam,
          return_to: window.location.origin,
        },
      });
      if (error) throw error;
      const url = (data as any)?.url;
      if (!url) throw new Error("URL d'autorisation manquante.");
      window.location.assign(url);
    } catch (e: any) {
      toast.error(e?.message || "Impossible de démarrer la connexion.");
      setConnecting(null);
    }
  };

  const handleDisconnect = async (platform: string) => {
    setDisconnecting(platform);
    try {
      const { data, error } = await supabase.functions.invoke("social-disconnect", {
        body: { platform, workspace_id: wsParam },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Déconnecté.");
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Échec de la déconnexion.");
    } finally {
      setDisconnecting(null);
    }
  };

  const ig = connections.instagram;
  const li = connections.linkedin;
  const canva = connections.canva;
  const pin = connections.pinterest;

  return (
    <section className="mb-6">
      <h2 className="font-display text-sm font-bold text-foreground mb-2">🌐 Réseaux sociaux</h2>
      <div className="rounded-xl border border-border bg-card divide-y">
        {/* Instagram */}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-fuchsia-500 to-orange-400 text-white flex items-center justify-center shrink-0">
              <Instagram className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Instagram</p>
              {loading ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
                </p>
              ) : ig?.connected ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  Connecté : @{ig.accountName}
                  {ig.expiresAt && (
                    <span className="ml-1">
                      · expire le {new Date(ig.expiresAt).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Non connecté</p>
              )}
            </div>
          </div>
          {ig?.connected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDisconnect("instagram")}
              disabled={disconnecting === "instagram"}
            >
              {disconnecting === "instagram" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Déconnecter"}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => handleConnect("instagram")}
              disabled={connecting === "instagram"}
              className="gap-1.5"
            >
              {connecting === "instagram" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              Connecter Instagram
            </Button>
          )}
        </div>

        {/* LinkedIn */}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-[#0a66c2] text-white flex items-center justify-center shrink-0">
              <Linkedin className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">LinkedIn</p>
              {loading ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
                </p>
              ) : li?.connected ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  Connecté : {li.accountName}
                  {li.expiresAt && (
                    <span className="ml-1">
                      · expire le {new Date(li.expiresAt).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Non connecté</p>
              )}
            </div>
          </div>
          {li?.connected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDisconnect("linkedin")}
              disabled={disconnecting === "linkedin"}
            >
              {disconnecting === "linkedin" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Déconnecter"}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => handleConnect("linkedin")}
              disabled={connecting === "linkedin"}
              className="gap-1.5"
            >
              {connecting === "linkedin" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              Connecter LinkedIn
            </Button>
          )}
        </div>

        {/* Canva — pour ouvrir/éditer un carrousel dans Canva */}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 text-white flex items-center justify-center shrink-0">
              <Palette className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Canva</p>
              {loading ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
                </p>
              ) : canva?.connected ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  Connecté{canva.accountName ? ` : ${canva.accountName}` : ""}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Non connecté — pour ouvrir tes carrousels dans Canva
                </p>
              )}
            </div>
          </div>
          {canva?.connected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDisconnect("canva")}
              disabled={disconnecting === "canva"}
            >
              {disconnecting === "canva" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Déconnecter"}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => handleConnect("canva")}
              disabled={connecting === "canva"}
              className="gap-1.5"
            >
              {connecting === "canva" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              Connecter Canva
            </Button>
          )}
        </div>

        {/* Pinterest */}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-[#e60023] text-white flex items-center justify-center shrink-0">
              <PinterestIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Pinterest</p>
              {loading ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
                </p>
              ) : pin?.connected ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  Connecté : @{pin.accountName}
                  {pin.expiresAt && (
                    <span className="ml-1">
                      · expire le {new Date(pin.expiresAt).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Non connecté</p>
              )}
            </div>
          </div>
          {pin?.connected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDisconnect("pinterest")}
              disabled={disconnecting === "pinterest"}
            >
              {disconnecting === "pinterest" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Déconnecter"}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => handleConnect("pinterest")}
              disabled={connecting === "pinterest"}
              className="gap-1.5"
            >
              {connecting === "pinterest" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              Connecter Pinterest
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
