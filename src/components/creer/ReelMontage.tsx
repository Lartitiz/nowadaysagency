/**
 * ReelMontage — écran de montage d'un reel (Phase 1, beta).
 *
 * À partir des sections du script, propose UN clip libre de droit par section
 * (recherche Pexels via `searchStockVideos`), laisse relancer la recherche par
 * section, puis assemble le tout en MP4 via le moteur `reel-render`.
 *
 * (Commit de synchro : pousse l'état complet de main vers Lovable.)
 * Limite volontaire de cette 1re version : la voix est une voix de SYNTHÈSE
 * (test) et les clips viennent de la banque libre. La voix de la créatrice
 * (enregistrement) et ses propres vidéos arrivent aux lots suivants.
 */

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Film, Download } from "lucide-react";
import { toast } from "sonner";
import {
  searchStockVideos,
  suggestStockKeywords,
  type StockVideo,
} from "@/lib/stock-videos";
import {
  buildRenderPlan,
  submitReelRender,
  pollReelRender,
  sectionDuration,
} from "@/lib/reel-render";

interface Section {
  timing?: string;
  texte_parle?: string;
  format_visuel?: string;
}

interface Props {
  sections: Section[];
  subject?: string;
}

type Phase = "idle" | "rendering" | "done" | "error";

export default function ReelMontage({ sections, subject }: Props) {
  const spoken = sections.filter((s) => typeof s.texte_parle === "string" && s.texte_parle.trim());

  const [keywords, setKeywords] = useState<string[]>(() => spoken.map(() => ""));
  const [results, setResults] = useState<StockVideo[][]>(() => spoken.map(() => []));
  const [clips, setClips] = useState<(StockVideo | null)[]>(() => spoken.map(() => null));
  const [loading, setLoading] = useState<boolean[]>(() => spoken.map(() => true));

  const [phase, setPhase] = useState<Phase>("idle");
  const [tick, setTick] = useState(0);
  const [mp4Url, setMp4Url] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Suggestion initiale : un clip par section.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let kws: string[] = [];
      try {
        const { keywords: k, primary } = await suggestStockKeywords({
          subject: subject || spoken.map((s) => s.texte_parle).join(" ").slice(0, 120),
          slides: spoken.map((s) => s.texte_parle || ""),
        });
        kws = spoken.map((_, i) => k[i] || primary || subject || "");
      } catch {
        kws = spoken.map(() => subject || "");
      }
      if (cancelled) return;
      setKeywords(kws);
      await Promise.all(kws.map((kw, i) => runSearch(i, kw, { cancelledRef: () => cancelled })));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(i: number, kw: string, o?: { cancelledRef?: () => boolean }) {
    const term = kw.trim();
    setLoading((L) => set(L, i, true));
    try {
      const vids = term
        ? await searchStockVideos(term, { perPage: 6, orientation: "portrait", locale: "en-US" })
        : [];
      if (o?.cancelledRef?.()) return;
      setResults((R) => set(R, i, vids));
      setClips((C) => set(C, i, vids[0] ?? C[i]));
    } catch (e) {
      if (!o?.cancelledRef?.()) toast.error(e instanceof Error ? e.message : "Recherche impossible.");
    } finally {
      if (!o?.cancelledRef?.()) setLoading((L) => set(L, i, false));
    }
  }

  async function handleAssemble() {
    const chosen = clips.map((c) => c?.url ?? null);
    if (!chosen.some(Boolean)) {
      toast.error("Choisis au moins un clip avant d'assembler.");
      return;
    }
    setPhase("rendering");
    setTick(0);
    setMp4Url(null);
    setErrorMsg("");
    try {
      const plan = buildRenderPlan(spoken, chosen, { voice_mode: "tts" });
      const project = await submitReelRender(plan);
      const url = await pollReelRender(project, { onTick: setTick });
      setMp4Url(url);
      setPhase("done");
      toast.success("Ton reel est monté !");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Le montage a échoué.");
      setPhase("error");
    }
  }

  const ready = clips.filter(Boolean).length;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-primary uppercase tracking-wide">
          <Film className="inline h-3.5 w-3.5 mr-1" /> Monter la vidéo
        </span>
        <Badge variant="secondary" className="text-2xs">beta</Badge>
      </div>
      <p className="text-2xs text-muted-foreground">
        Un clip libre de droit par phrase. Voix de synthèse pour ce test — ta voix et tes propres
        vidéos arrivent bientôt.
      </p>

      <div className="space-y-2">
        {spoken.map((s, i) => (
          <Card key={i} className="border-border">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {s.timing && <Badge variant="secondary" className="font-mono text-2xs">{s.timing}</Badge>}
                <span className="text-2xs text-muted-foreground">≈ {sectionDuration(s)} s</span>
              </div>
              {s.texte_parle && (
                <p className="text-xs text-foreground leading-snug line-clamp-2">{s.texte_parle}</p>
              )}

              <div className="flex gap-1.5">
                <Input
                  value={keywords[i] ?? ""}
                  onChange={(e) => setKeywords((K) => set(K, i, e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && runSearch(i, keywords[i] ?? "")}
                  placeholder="mots-clés du plan (ex: mains savon atelier)"
                  className="h-8 text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => runSearch(i, keywords[i] ?? "")}
                  disabled={loading[i]}
                >
                  {loading[i] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                </Button>
              </div>

              {results[i]?.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {results[i].map((v) => {
                    const selected = clips[i]?.id === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setClips((C) => set(C, i, v))}
                        className={`relative shrink-0 rounded-md overflow-hidden border-2 ${
                          selected ? "border-primary" : "border-transparent"
                        }`}
                        aria-label={selected ? "Clip sélectionné" : "Choisir ce clip"}
                      >
                        <img src={v.thumbnail} alt="" className="h-24 w-[54px] object-cover" loading="lazy" />
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-2xs text-muted-foreground">
          {ready} clip{ready > 1 ? "s" : ""} sur {spoken.length} prêt{ready > 1 ? "s" : ""}
        </span>
        <Button size="sm" onClick={handleAssemble} disabled={phase === "rendering" || ready === 0}>
          {phase === "rendering" ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Montage en cours…
            </>
          ) : (
            <>
              <Film className="h-4 w-4 mr-1.5" />
              Assembler mon reel
            </>
          )}
        </Button>
      </div>

      {phase === "rendering" && (
        <p className="text-2xs text-muted-foreground text-center">
          Assemblage des clips, incrustation des sous-titres et de la voix… (≈ {Math.max(1, tick * 6)} s)
        </p>
      )}

      {phase === "error" && (
        <p className="text-xs text-destructive">{errorMsg}</p>
      )}

      {phase === "done" && mp4Url && (
        <div className="space-y-2">
          <video src={mp4Url} controls playsInline className="w-full max-h-[420px] rounded-lg bg-black" />
          <a href={mp4Url} download className="inline-flex">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1.5" />
              Télécharger le MP4
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}

// Petit helper immuable : remplace l'index i d'un tableau.
function set<T>(arr: T[], i: number, v: T): T[] {
  const copy = arr.slice();
  copy[i] = v;
  return copy;
}
