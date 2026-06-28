import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Instagram, Linkedin, Loader2, CheckCircle2, ExternalLink, Palette, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";

type Platform = "instagram" | "linkedin" | "canva" | "pinterest";

type Connection = {
  platform: Platform;
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

type PlatformMeta = {
  key: Platform;
  label: string;
  icon: React.ReactNode;
  iconWrapClass: string;
  /** Affiche @ devant le nom du compte (Instagram / Pinterest). */
  atHandle?: boolean;
  /** Texte « non connecté » spécifique (Canva). */
  notConnectedHint?: string;
};

const PLATFORMS: PlatformMeta[] = [
  {
    key: "instagram",
    label: "Instagram",
    icon: <Instagram className="h-4 w-4" />,
    iconWrapClass: "bg-gradient-to-br from-fuchsia-500 to-orange-400",
    atHandle: true,
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    icon: <Linkedin className="h-4 w-4" />,
    iconWrapClass: "bg-[#0a66c2]",
  },
  {
    key: "canva",
    label: "Canva",
    icon: <Palette className="h-4 w-4" />,
    iconWrapClass: "bg-gradient-to-br from-cyan-400 to-violet-500",
    notConnectedHint: "Non connecté — pour ouvrir tes carrousels dans Canva",
  },
  {
    key: "pinterest",
    label: "Pinterest",
    icon: <PinterestIcon className="h-4 w-4" />,
    iconWrapClass: "bg-[#e60023]",
    atHandle: true,
  },
];

export default function SocialConnectionsCard() {
  const { session } = useAuth();
  const workspaceId = useWorkspaceId();
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connections, setConnections] = useState<Record<string, Connection>>({});

  const wsParam =
    workspaceId && session?.user && workspaceId !== session.user.id ? workspaceId : undefined;

  const reload = useCallback(async () => {
    setLoading(true);
    setErrored(false);
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
      // Ne PAS afficher « Non connecté » sur une simple erreur réseau / cold start :
      // ce serait un faux négatif anxiogène (« mes comptes sont déconnectés ?! »).
      // On bascule sur un état d'erreur explicite avec « Réessayer ».
      console.error(e);
      setErrored(true);
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

  const handleConnect = async (platform: Platform) => {
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

  // Tant que le statut n'est pas connu (chargement OU erreur), on n'affiche NI
  // « Connecté » NI « Non connecté » NI le bouton Connecter/Déconnecter — pour ne
  // pas faire clignoter un faux « Non connecté + Connecter » avant la réponse.
  const statusUnknown = loading || errored;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-sm font-bold text-foreground">🌐 Réseaux sociaux</h2>
        {errored && (
          <Button variant="ghost" size="sm" onClick={() => reload()} className="gap-1.5 text-xs h-7">
            <RefreshCw className="h-3 w-3" /> Réessayer
          </Button>
        )}
      </div>
      <div className="rounded-xl border border-border bg-card divide-y">
        {PLATFORMS.map((p) => {
          const conn = connections[p.key];
          const isConnected = !statusUnknown && conn?.connected;
          return (
            <div key={p.key} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`h-9 w-9 rounded-lg ${p.iconWrapClass} text-white flex items-center justify-center shrink-0`}>
                  {p.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{p.label}</p>
                  {loading ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
                    </p>
                  ) : errored ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 text-warning" /> Statut indisponible
                    </p>
                  ) : isConnected ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-success" />
                      Connecté{conn?.accountName ? ` : ${p.atHandle ? "@" : ""}${conn.accountName}` : ""}
                      {conn?.expiresAt && (
                        <span className="ml-1">
                          · expire le {new Date(conn.expiresAt).toLocaleDateString("fr-FR")}
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {p.notConnectedHint || "Non connecté"}
                    </p>
                  )}
                </div>
              </div>

              {/* Pas de bouton tant que le statut est inconnu (évite le faux « Connecter »). */}
              {statusUnknown ? null : isConnected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDisconnect(p.key)}
                  disabled={disconnecting === p.key}
                >
                  {disconnecting === p.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Déconnecter"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handleConnect(p.key)}
                  disabled={connecting === p.key}
                  className="gap-1.5"
                >
                  {connecting === p.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5" />
                  )}
                  Connecter {p.label}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
