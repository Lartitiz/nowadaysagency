// Aperçu immédiat du reel « sans voix » (14/11/2026) : la page de montage est
// jouée par le lecteur officiel HyperFrames, sans fabriquer de MP4. Dessous :
// les retouches (boutons bornés + demande libre) et la fabrication du MP4,
// seulement au clic « Télécharger ma vidéo » / « Ranger cette vidéo ».
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { readableError } from "@/lib/error-messages";
import { askReelTweak } from "./reel-tweak-api";
import { DEFAULT_TWEAKS, PLAYER_SCRIPT, biggerText, isDefaultTweaks, sanitizeTweaks, shorter, toggleCalm, toggleSounds, type ReelTweaks } from "./reel-preview";

let playerScript: Promise<void> | null = null;
function loadPlayer(): Promise<void> {
  if (typeof customElements !== "undefined" && customElements.get("hyperframes-player")) return Promise.resolve();
  playerScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PLAYER_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { playerScript = null; reject(new Error("player")); };
    document.head.appendChild(script);
  });
  return playerScript;
}

/** Le lecteur, créé à la main (élément web, hors de React) et nourri par `srcdoc`. */
function HyperframesPlayer({ html }: { html: string }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadPlayer().then(() => {
      if (!alive || !host.current || player.current) return;
      const el = document.createElement("hyperframes-player");
      el.setAttribute("controls", "");
      el.setAttribute("width", "1080");
      el.setAttribute("height", "1920");
      el.style.display = "block";
      el.style.width = "100%";
      el.style.height = "100%";
      host.current.appendChild(el);
      player.current = el;
      el.setAttribute("srcdoc", html);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
    // Le lecteur est créé une fois ; le montage change par l'effet ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (player.current && player.current.getAttribute("srcdoc") !== html) player.current.setAttribute("srcdoc", html);
  }, [html]);
  useEffect(() => () => { player.current?.remove(); player.current = null; }, []);
  if (failed) return <p className="text-xs text-destructive p-3">L’aperçu ne s’affiche pas sur ce navigateur. Tu peux quand même télécharger ta vidéo.</p>;
  return <div ref={host} data-testid="reel-preview-player" className="mx-auto aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-lg bg-black" />;
}

interface ReelPreviewProps {
  html: string;
  duration: number;
  tweaks: ReelTweaks;
  setTweaks: (t: ReelTweaks) => void;
  passages: { duration: number; text: string }[];
  workspaceId?: string;
  busy: boolean;
  tick: number;
  onDownload: () => void;
  onSave: () => void;
}

export function ReelPreview({ html, duration, tweaks, setTweaks, passages, workspaceId, busy, tick, onDownload, onSave }: ReelPreviewProps) {
  const [request, setRequest] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState("");
  const n = passages.length;
  const apply = (next: ReelTweaks, said = "") => { setTweaks(sanitizeTweaks(next, n)); setAnswer(said); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = request.trim();
    if (text.length < 2 || asking) return;
    setAsking(true);
    setAnswer("");
    try {
      const result = await askReelTweak({ request: text, current: tweaks, passages, workspaceId });
      if (result.understood) { setTweaks(result.tweaks); setRequest(""); }
      setAnswer(result.message);
    } catch (e) {
      toast.error(readableError(e, "Je n'ai pas réussi à comprendre la demande. Réessaie avec d'autres mots."));
    } finally {
      setAsking(false);
    }
  }

  const locked = busy || asking;
  return (
    <section aria-label="Aperçu de ton reel" className="space-y-3 rounded-lg border border-border bg-background p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Aperçu de ton reel</p>
        <span className="text-2xs text-muted-foreground">{Math.round(duration)} s</span>
      </div>
      <HyperframesPlayer html={html} />

      <div className="flex flex-wrap gap-1.5">
        <Button type="button" variant="outline" size="sm" disabled={locked || tweaks.durationScale <= 0.5} onClick={() => apply(shorter(tweaks))}>Plus court</Button>
        <Button type="button" variant="outline" size="sm" disabled={locked || tweaks.textScale >= 1.4} onClick={() => apply(biggerText(tweaks))}>Texte plus grand</Button>
        <Button type="button" variant="outline" size="sm" aria-pressed={tweaks.calm} disabled={locked} onClick={() => apply(toggleCalm(tweaks))}>{tweaks.calm ? "Plus dynamique" : "Plus calme"}</Button>
        <Button type="button" variant="outline" size="sm" aria-pressed={!tweaks.sounds} disabled={locked} onClick={() => apply(toggleSounds(tweaks))}>{tweaks.sounds ? "Sans sons" : "Avec les sons"}</Button>
        {!isDefaultTweaks(tweaks) && (
          <Button type="button" variant="ghost" size="sm" disabled={locked} onClick={() => apply(DEFAULT_TWEAKS)}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />Montage de départ
          </Button>
        )}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="reel-tweak-request" className="sr-only">Dis ce que tu veux changer</label>
        <input id="reel-tweak-request" value={request} onChange={(e) => setRequest(e.target.value)} maxLength={500} disabled={locked}
          placeholder="Dis ce que tu veux changer (ex. : passage 2 plus long)"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
        <Button type="submit" size="sm" variant="secondary" disabled={locked || request.trim().length < 2}>
          {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          <span className="sr-only sm:not-sr-only sm:ml-1">Changer</span>
        </Button>
      </form>
      {answer && <p role="status" className="text-xs text-muted-foreground">{answer}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button type="button" size="sm" disabled={locked} onClick={onDownload}>
          {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
          Télécharger ma vidéo
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={locked} onClick={onSave}>Ranger cette vidéo</Button>
      </div>
      <p className="text-2xs text-muted-foreground">
        {busy
          ? `Fabrication de ta vidéo… (≈ ${Math.max(1, tick * 6)} s, environ 2 minutes)`
          : "Retouche autant que tu veux : l’aperçu est immédiat. La vidéo n’est fabriquée qu’au téléchargement (environ 2 minutes)."}
      </p>
    </section>
  );
}
