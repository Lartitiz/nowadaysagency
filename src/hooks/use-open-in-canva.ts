import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useAuth } from "@/contexts/AuthContext";
import { useSocialConnections } from "@/hooks/use-social-connections";
import { versConnexions } from "@/lib/retour-apres-detour";
import { budgetExportMs } from "@/lib/export-budget";

// Identifiant du bandeau d'avancement : un seul message, mis à jour sur place
// (« slide 3 sur 10 ») plutôt qu'une pile de toasts.
const TOAST_ID = "canva-export";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Pont Canva réutilisable (atelier /creer ET calendrier).
 *
 * Exporte un carrousel en PPTX hybride (via le `buildBlob` fourni par l'appelant,
 * qui connaît ses propres slides/photos/charte), l'envoie en base64 à l'edge
 * `social-canva-import` qui le dépose côté serveur puis l'importe dans le Canva
 * connecté, et ouvre l'URL d'édition.
 *
 * Retourne `{ openInCanva, openingCanva }`.
 */
export function useOpenInCanva() {
  const workspaceId = useWorkspaceId();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isConnected, known, refresh } = useSocialConnections();
  const [openingCanva, setOpeningCanva] = useState(false);

  // false = on SAIT (réponse serveur) qu'aucun Canva n'est connecté ;
  // null = statut encore inconnu (chargement ou échec réseau) → on ne bloque pas.
  const canvaConnected: boolean | null = known ? isConnected("canva") : null;

  const promptToConnect = useCallback(() => {
    toast.error("Ton compte Canva n'est pas encore connecté.", {
      description:
        "Connecte-le une fois, et on te ramène tout de suite à ton contenu — tu ne perds rien.",
      action: {
        label: "Connecter Canva",
        // On note d'où l'on part : la page des connexions y ramènera.
        onClick: () => versConnexions(navigate),
      },
      duration: 15000,
    });
    // Si la connexion vient d'être faite dans un autre onglet, ce refresh
    // resynchronise le statut pour le prochain clic.
    refresh();
  }, [navigate, refresh]);

  const openInCanva = useCallback(
    async (
      buildBlob: (
        onProgress?: (faites: number, total: number) => void,
      ) => Promise<Blob>,
      title: string,
      opts?: { etapes?: number },
    ) => {
      if (openingCanva) return;
      // Garde AVANT tout travail : sans Canva connecté, inutile de préparer le
      // fichier pendant plusieurs minutes pour échouer à la fin.
      if (canvaConnected === false) {
        promptToConnect();
        return;
      }
      // ⚠️ On n'ouvre PLUS d'onglet d'attente avant de travailler. Il prenait le
      // focus, donc l'app passait en arrière-plan — où Chrome ralentit fortement
      // les minuteries dont dépend toute la fabrication du PPTX. L'app créait
      // elle-même la panne, puis affichait « reste sur l'onglet de l'app ».
      // L'onglet Canva s'ouvre à la fin, depuis le bouton du message de succès
      // (un clic = geste utilisateur → jamais bloqué par le pop-up blocker).
      setOpeningCanva(true);
      try {
        toast.loading("Préparation de ton carrousel…", {
          id: TOAST_ID,
          description: "Reste sur cet onglet : ça peut prendre une à trois minutes.",
        });
        // Filet de sécurité : la construction du PPTX peut se figer sur certains
        // contenus. Le budget se DÉDUIT des garde-fous internes du fabricant
        // (25 s par capture, 3 slides de front) au lieu d'être un nombre écrit à
        // côté : à 90 s en dur, un carrousel de 10 slides échouait par
        // construction, avant même que ces garde-fous puissent jouer.
        const blob = await Promise.race([
          buildBlob((faites, total) => {
            toast.loading(`Préparation de ton carrousel… (${faites}/${total})`, {
              id: TOAST_ID,
              description: "Reste sur cet onglet : ça peut prendre une à trois minutes.",
            });
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    "La préparation du carrousel a pris trop de temps. Réessaie, ou retire quelques photos si le carrousel est très chargé.",
                  ),
                ),
              budgetExportMs(opts?.etapes ?? 0),
            ),
          ),
        ]);
        const fileBase64 = await blobToBase64(blob);

        toast.loading("Import dans Canva en cours…", {
          id: TOAST_ID,
          description: "Canva traite ton fichier.",
        });
        const { data, error } = await invokeWithTimeout(
          "social-canva-import",
          {
            body: {
              file_base64: fileBase64,
              title,
              workspace_id:
                workspaceId && workspaceId !== user?.id ? workspaceId : undefined,
            },
          },
          120000,
        );

        // Filet serveur (statut local périmé ou inconnu) : même invitation à connecter.
        if ((data as any)?.error === "not_connected") {
          toast.dismiss(TOAST_ID);
          promptToConnect();
          return;
        }
        if (error) throw new Error(error.message);
        if ((data as any)?.error) throw new Error((data as any).error);

        const editUrl = (data as any)?.editUrl;
        if (!editUrl) throw new Error("URL d'édition Canva manquante.");

        // L'onglet s'ouvre ICI, sur clic : un geste utilisateur n'est jamais
        // bloqué par le pop-up blocker, et l'app garde le focus tant qu'elle
        // travaille. Message persistant tant qu'elle n'a pas cliqué.
        toast.success("Ton carrousel est prêt dans Canva 🎨", {
          id: TOAST_ID,
          description: "Clique pour l'ouvrir et finir le visuel.",
          action: {
            label: "Ouvrir dans Canva",
            onClick: () => window.open(editUrl, "_blank", "noopener"),
          },
          duration: Infinity,
        });
      } catch (e: any) {
        toast.error(e?.message || "Impossible d'ouvrir dans Canva.", { id: TOAST_ID });
      } finally {
        setOpeningCanva(false);
      }
    },
    [openingCanva, workspaceId, user?.id, canvaConnected, promptToConnect],
  );

  return { openInCanva, openingCanva, canvaConnected };
}
