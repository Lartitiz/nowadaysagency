// Reel monté : la vidéo (MP4 durable) reste liée au script qui l'a produite.
// Sorti à l'identique de CreerUnifie.tsx (lot G1, docs/robustesse/gros-fichiers.md, fiche 1).
// ⚠️ src/test/reel-editor-scope.test.tsx exécute le corps de ce hook (de la
// déclaration de reelSource jusqu'au return final) en injectant ses paramètres
// par leur nom : garder ces noms, et un seul return en fin de hook.
import { useCallback, useEffect, useRef, useState } from "react";
import { isDurableReelUrl, reelSourceKey } from "@/lib/reel-publication";

type ReelArtifactInput = {
  result: any;
  workspaceId: string | null | undefined;
  creationId: string;
  ps: any;
  saveFlowState: (state: { reelMp4Url?: string | null; reelSourceKey?: string }) => void;
  setPublishingInstagram: (value: boolean) => void;
};

export function useReelArtifact({ result, workspaceId, creationId, ps, saveFlowState, setPublishingInstagram }: ReelArtifactInput) {
  // Reel monté : URL durable (bucket `calendar-media`) remontée par ReelResult.
  // Vaut `null` tant qu'aucune vidéo n'est rattachable — voir `archiveReelMp4`.
  const reelSource = reelSourceKey(result?.raw || result);
  const reelScope = `${workspaceId}:${creationId}:${reelSource}`;
  const activeReelScope = useRef(reelScope);
  activeReelScope.current = reelScope;
  useEffect(() => {
    activeReelScope.current = reelScope;
    return () => { activeReelScope.current = "unmounted"; };
  }, [reelScope]);
  // Au rechargement, le résultat arrive après le 1er rendu : la vidéo suit le script sauvegardé.
  const [reelArtifact, setReelArtifact] = useState(() => { const source = result ? reelSource : reelSourceKey(ps?.result?.raw || ps?.result); return { scope: `${workspaceId}:${creationId}:${source}`, url: ps?.reelSourceKey === source ? ps?.reelMp4Url || null : null }; });
  const reelMp4Url = reelArtifact.scope === reelScope && isDurableReelUrl(reelArtifact.url) ? reelArtifact.url : null;
  const setReelMp4Url = useCallback((url: string | null) => {
    if (activeReelScope.current === reelScope) setReelArtifact({ scope: reelScope, url });
  }, [reelScope]);
  useEffect(() => { saveFlowState({ reelMp4Url, reelSourceKey: reelSource }); }, [reelMp4Url, reelSource]);
  const instagramInFlight = useRef<{ scope: string } | null>(null);
  useEffect(() => { setPublishingInstagram(false); }, [reelScope]);

  return { reelSource, reelScope, activeReelScope, reelMp4Url, setReelMp4Url, instagramInFlight };
}
