// Publication d'une épingle depuis la fenêtre « Publier » de /creer : tableaux du
// compte connecté, choix du tableau, rendu du visuel en PNG, publication.
// Appelé par use-creer-publish.ts (un fichier = une mission).
import { useEffect, useRef, useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { PINTEREST_PUBLISH_FOR_ALL } from "@/config/feature-flags";
import { versConnexions } from "@/lib/retour-apres-detour";
import { listPinterestBoards, publishPinToPinterest, uploadPinImage, isPinterestNotConnectedError, type PinterestBoard } from "@/lib/pinterest-publish";
import { canPublishToPinterest, defaultPinterestBoardId, extractPinterestText, pinterestDestinationLink, pinterestPublishDisabledReason } from "@/features/creer/pinterest-publish-guards";

export type PinterestBoardsState = {
  boards: PinterestBoard[];
  loading: boolean;
  error: string | null;
  selectedBoardId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
};

type Input = {
  session: any;
  result: any;
  selectedFormat: string | null;
  pinterestPinHtml?: string | null;
  pinterestData?: { link?: string; boardName?: string } | null;
  publishableImageUrl: string | null;
  charterData: any;
  workspaceId: string | null | undefined;
  /** La fenêtre est ouverte ET le compte Pinterest connecté : on lit les tableaux. */
  shouldLoadBoards: boolean;
  recordImmediatePublication: (input: { canal: string; caption: string; postId?: string }) => Promise<unknown>;
  navigate: NavigateFunction;
};

export function useCreerPinterestPublish({
  session, result, selectedFormat, pinterestPinHtml, pinterestData, publishableImageUrl, charterData,
  workspaceId, shouldLoadBoards, recordImmediatePublication, navigate,
}: Input) {
  const { isAdmin } = useAuth();
  const enabled = canPublishToPinterest({ selectedFormat, isAdmin: !!isAdmin });
  const userId: string | undefined = session?.user?.id;

  const [boards, setBoards] = useState<PinterestBoard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const inFlight = useRef(false);
  const scopeKey = `${userId}|${workspaceId}`;
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !shouldLoadBoards || !userId) return;
    const key = `${scopeKey}|${reloadKey}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    let alive = true;
    setLoading(true);
    setError(null);
    listPinterestBoards({ workspaceId, userId })
      .then((list) => {
        if (!alive) return;
        setBoards(list);
        setSelectedBoardId((prev) => (prev && list.some((b) => b.id === prev) ? prev : defaultPinterestBoardId(list, pinterestData?.boardName)));
      })
      .catch((e: any) => {
        if (!alive) return;
        loadedFor.current = null;
        setBoards([]);
        setError(e?.message || "Impossible de lire tes tableaux Pinterest.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [enabled, shouldLoadBoards, userId, workspaceId, scopeKey, reloadKey, pinterestData?.boardName]);

  const raw = result?.raw || result;
  const pinHtml = pinterestPinHtml || raw?.pin_html || null;
  const disabledReason = enabled
    ? pinterestPublishDisabledReason({ raw, hasPinHtml: !!pinHtml, publishableImageUrl, boardId: selectedBoardId, checkBoard: shouldLoadBoards }) ||
      (shouldLoadBoards && loading ? "Lecture de tes tableaux Pinterest…" : null)
    : null;

  const handlePublish = async () => {
    if (inFlight.current) return;
    if (!userId) {
      toast.error("Tu dois être connectée.");
      return;
    }
    if (disabledReason) {
      toast.error(disabledReason);
      return;
    }
    inFlight.current = true;
    setPublishing(true);
    try {
      let imageUrl = publishableImageUrl;
      if (pinHtml) {
        const [{ renderPinterestVisualToBlob }, { getIncludeLogoPref }] = await Promise.all([
          import("@/lib/export-carousel-png"),
          import("@/lib/export-logo"),
        ]);
        const logoUrl = getIncludeLogoPref() ? charterData?.logo_url : null;
        const blob = await renderPinterestVisualToBlob(pinHtml, logoUrl);
        imageUrl = await uploadPinImage(blob, userId);
      }
      const { title, description } = extractPinterestText(raw);
      const res = await publishPinToPinterest({
        boardId: selectedBoardId!,
        imageUrl: imageUrl!,
        title: title || undefined,
        description: description || undefined,
        link: pinterestDestinationLink(pinterestData?.link, raw?.link, raw?.pin_data?.link),
        workspaceId,
        userId,
      });
      await recordImmediatePublication({ canal: "pinterest", caption: [title, description].filter(Boolean).join("\n\n"), postId: res.postId });
      toast.success("Épingle publiée sur Pinterest !", {
        description: PINTEREST_PUBLISH_FOR_ALL
          ? undefined
          : "Accès d'essai Pinterest : l'épingle n'est visible que par toi pour l'instant.",
        ...(res.permalink ? { action: { label: "Voir sur Pinterest", onClick: () => window.open(res.permalink, "_blank") } } : {}),
      });
      return true;
    } catch (e: any) {
      const msg = e?.message || "Échec de la publication Pinterest.";
      if (isPinterestNotConnectedError(msg)) {
        toast.error(msg, { action: { label: "Connecter", onClick: () => versConnexions(navigate) } });
      } else {
        toast.error(msg);
      }
      return false;
    } finally {
      inFlight.current = false;
      setPublishing(false);
    }
  };

  const boardsState: PinterestBoardsState = {
    boards,
    loading,
    error,
    selectedBoardId,
    onSelect: setSelectedBoardId,
    onRetry: () => setReloadKey((k) => k + 1),
  };

  return { enabled, disabledReason, publishing, handlePublish, boardsState };
}
