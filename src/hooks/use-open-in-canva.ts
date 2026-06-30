import { useCallback, useState } from "react";
import { toast } from "sonner";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useAuth } from "@/contexts/AuthContext";

// Onglet d'attente affiché PENDANT que Canva traite le fichier (1-2 min).
// On l'ouvre dans le contexte du clic pour éviter le bloqueur de pop-up ;
// on bascule ensuite sur l'URL d'édition Canva quand l'import est prêt.
const PLACEHOLDER_HTML =
  `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Préparation… · Canva</title></head><body style="margin:0;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#FFF4F8;color:#1A1A2E"><div style="text-align:center;padding:24px;max-width:420px"><div style="font-size:40px;margin-bottom:12px">🎨</div><div style="font-size:18px;font-weight:600">Préparation de ton carrousel dans Canva…</div><div style="margin-top:10px;color:#6b6b80;line-height:1.5">Ça peut prendre une à deux minutes (Canva traite ton fichier).<br>Ne ferme pas cet onglet : ton carrousel va apparaître ici tout seul.</div></div></body></html>`;

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
  const [openingCanva, setOpeningCanva] = useState(false);

  const openInCanva = useCallback(
    async (buildBlob: () => Promise<Blob>, title: string) => {
      if (openingCanva) return;
      // Onglet ouvert TOUT DE SUITE (geste utilisateur) pour ne pas être bloqué
      // par le pop-up blocker après les ~1-2 min d'import.
      const canvaTab = window.open("", "_blank");
      if (canvaTab) {
        try {
          canvaTab.document.write(PLACEHOLDER_HTML);
          canvaTab.document.close();
        } catch {
          /* noop */
        }
      }
      setOpeningCanva(true);
      try {
        toast.info("Préparation du carrousel pour Canva…");
        // Filet de sécurité : la construction du PPTX (html2canvas) peut se figer
        // si l'onglet reste en arrière-plan trop longtemps. On borne l'attente
        // pour surfacer une erreur claire au lieu de rester coincé sur
        // « Préparation… » indéfiniment.
        const blob = await Promise.race([
          buildBlob(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    "La préparation du carrousel a échoué. Reste sur l'onglet de l'app pendant l'export, puis réessaie.",
                  ),
                ),
              90000,
            ),
          ),
        ]);
        const fileBase64 = await blobToBase64(blob);

        toast.info("Import dans Canva en cours…");
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

        if ((data as any)?.error === "not_connected") {
          if (canvaTab && !canvaTab.closed) canvaTab.close();
          toast.error(
            "Connecte d'abord ton compte Canva dans Paramètres → Réseaux sociaux.",
          );
          return;
        }
        if (error) throw new Error(error.message);
        if ((data as any)?.error) throw new Error((data as any).error);

        const editUrl = (data as any)?.editUrl;
        if (!editUrl) throw new Error("URL d'édition Canva manquante.");

        // Best-effort : naviguer l'onglet pré-ouvert (peu fiable sur import long,
        // Chrome throttle/discarde l'onglet d'arrière-plan).
        if (canvaTab && !canvaTab.closed) {
          try {
            canvaTab.location.href = editUrl;
          } catch {
            /* onglet discardé : on s'appuie sur le bouton du toast ci-dessous */
          }
        }
        // Bouton « Ouvrir » TOUJOURS proposé (clic = geste utilisateur → jamais
        // bloqué), au cas où l'onglet auto reste figé sur « Préparation… ».
        toast.success("Ton carrousel est prêt dans Canva 🎨", {
          description:
            "L'onglet Canva devrait s'ouvrir tout seul. S'il reste sur « Préparation… », clique ici :",
          action: {
            label: "Ouvrir dans Canva",
            onClick: () => window.open(editUrl, "_blank", "noopener"),
          },
          duration: 60000,
        });
      } catch (e: any) {
        if (canvaTab && !canvaTab.closed) canvaTab.close();
        toast.error(e?.message || "Impossible d'ouvrir dans Canva.");
      } finally {
        setOpeningCanva(false);
      }
    },
    [openingCanva, workspaceId, user?.id],
  );

  return { openInCanva, openingCanva };
}
