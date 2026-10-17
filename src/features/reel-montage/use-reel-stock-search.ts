// Banque libre (Pexels) de l'écran de montage d'un reel : mots-clés, résultats,
// recherche initiale UNE fois par montage du composant, recherche manuelle.
// Sorti de ReelMontage.tsx à l'identique (fiche 16 de
// docs/robustesse/gros-fichiers.md, lot 4). L'état `clips` reste dans le
// composant ; l'annulation lit `activeRender.current.mounted` (la ref, pas une copie).
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { toast } from "sonner";
import { readableError } from "@/lib/error-messages";
import { searchStockVideos, suggestStockKeywords, type StockVideo } from "@/lib/stock-videos";
import { stockKeywordLabel, stockSearchFor } from "@/lib/stock-photos";
import { fromStock, set, type MontageMode, type Section, type SelectedClip } from "./types";

interface StockSearchArgs {
  spoken: Section[];
  subject?: string;
  montageMode: MontageMode | null;
  setClips: Dispatch<SetStateAction<(SelectedClip | null)[]>>;
  activeRender: MutableRefObject<{ key: string; generation: number; mounted: boolean }>;
}

export function useReelStockSearch({ spoken, subject, montageMode, setClips, activeRender }: StockSearchArgs) {
  const [keywords, setKeywords] = useState<string[]>(() => spoken.map(() => ""));
  const [results, setResults] = useState<StockVideo[][]>(() => spoken.map(() => []));
  const [loading, setLoading] = useState<boolean[]>(() => spoken.map(() => true));
  // Libellés français affichés dans les champs ; Pexels reçoit la requête anglaise.
  const labels = useRef<Record<string, string>>({});

  // Suggestion initiale : un clip par section. Uniquement en mode "cache" — le
  // mode "filme" n'utilise pas la banque libre, seulement les prises perso.
  const stockSearchStarted = useRef(false);
  useEffect(() => {
    if (montageMode !== "cache" || stockSearchStarted.current) return;
    stockSearchStarted.current = true;
    // This one-time search belongs to the mounted editor, not the mode tab.
    // Leaving and returning must not discard a paid keyword response.
    const cancelled = () => !activeRender.current.mounted;
    (async () => {
      let kws: string[] = [];
      try {
        const { keywords: k, primary, labels: l } = await suggestStockKeywords({
          subject: subject || spoken.map((s) => s.texte_parle).join(" ").slice(0, 120),
          slides: spoken.map((s) => s.texte_parle || ""),
        });
        labels.current = l ?? {};
        kws = spoken.map((_, i) => {
          const kw = k[i] || primary;
          return kw ? stockKeywordLabel(kw, labels.current) : subject || "";
        });
      } catch {
        kws = spoken.map(() => subject || "");
      }
      if (cancelled()) return;
      setKeywords(kws);
      await Promise.all(kws.map((kw, i) => runSearch(i, kw, { cancelledRef: cancelled })));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montageMode]);

  async function runSearch(i: number, kw: string, o?: { cancelledRef?: () => boolean }) {
    const { term, locale } = stockSearchFor(kw, labels.current);
    setLoading((L) => set(L, i, true));
    try {
      const vids = term
        ? await searchStockVideos(term, { perPage: 6, orientation: "portrait", locale })
        : [];
      if (o?.cancelledRef?.()) return;
      setResults((R) => set(R, i, vids));
      // Préserve les clips choisis explicitement dans la bibliothèque ou le Studio.
      setClips((C) =>
        set(C, i, C[i]?.source === "mine" || C[i]?.source === "studio" ? C[i] : vids[0] ? fromStock(vids[0]) : C[i]),
      );
    } catch (e) {
      if (!o?.cancelledRef?.()) toast.error(readableError(e, "La recherche de vidéos n’a pas abouti. Réessaie dans un instant."));
    } finally {
      if (!o?.cancelledRef?.()) setLoading((L) => set(L, i, false));
    }
  }

  return { keywords, setKeywords, results, loading, runSearch };
}
