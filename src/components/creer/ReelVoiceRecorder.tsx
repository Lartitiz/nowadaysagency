/**
 * ReelVoiceRecorder — téléprompteur d'enregistrement de la voix, phrase par
 * phrase (une section du script = un enregistrement). Enregistrer par phrase
 * évite les grands blancs entre les phrases (chaque prise est posée sur sa
 * scène) et permet de ne réenregistrer QUE la phrase ratée.
 *
 * Remonte à son parent la liste des prises (URL publique + durée réelle, null
 * si pas encore enregistrée) via `onVoicesChange`. La durée compte : c'est elle
 * qui cale la scène au montage, sinon une lecture posée se fait couper.
 *
 * Règle d'écran, apprise d'un vrai usage (01/08) : après une prise, on RESTE
 * sur la phrase et on affiche le lecteur. Enchaîner tout seul sur la phrase
 * suivante faisait disparaître le lecteur à l'instant même où la prise
 * devenait écoutable — on ne s'entendait donc jamais, et ça se vivait comme un
 * micro qui n'enregistre pas. Le passage à la phrase suivante est explicite.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, CircleCheck, Circle, Loader2, Play, Pause, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { blobToWav, uploadVoiceClip, type VoiceClip } from "@/lib/reel-voice";

interface Props {
  /** Textes parlés, dans l'ordre des sections. */
  texts: string[];
  onVoicesChange: (clips: (VoiceClip | null)[]) => void;
}

type SectionState = "todo" | "recording" | "uploading" | "done";

/** Nombre de barres du vu-mètre. Purement visuel. */
const METER_BARS = 12;

export default function ReelVoiceRecorder({ texts, onVoicesChange }: Props) {
  const [current, setCurrent] = useState(0);
  const [states, setStates] = useState<SectionState[]>(() => texts.map(() => "todo"));
  const [clips, setClips] = useState<(VoiceClip | null)[]>(() => texts.map(() => null));
  const [previews, setPreviews] = useState<(string | null)[]>(() => texts.map(() => null));
  const [elapsed, setElapsed] = useState(0);
  /** Niveau du micro pendant la prise, 0 → 1. Preuve visible qu'on est entendue. */
  const [level, setLevel] = useState(0);
  /** Index de la prise en cours de relecture dans la liste, null si silence. */
  const [playing, setPlaying] = useState<number | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const playerRef = useRef<HTMLAudioElement | null>(null);
  /** Les previews vivent aussi en ref, pour les libérer au démontage. */
  const previewsRef = useRef<(string | null)[]>([]);

  // Coupe proprement micro, minuteur, analyse et relecture si l'écran se ferme.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
      void audioCtxRef.current?.close();
      playerRef.current?.pause();
      previewsRef.current.forEach((u) => u && URL.revokeObjectURL(u));
    };
  }, []);

  const setAt = <T,>(arr: T[], i: number, v: T): T[] => {
    const c = arr.slice();
    c[i] = v;
    return c;
  };

  /** Branche un analyseur sur le flux micro pour animer le vu-mètre. */
  function startMeter(stream: MediaStream) {
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        // Écart quadratique moyen autour du silence (128) → niveau perçu.
        let sum = 0;
        for (const v of buf) {
          const d = (v - 128) / 128;
          sum += d * d;
        }
        const rms = Math.sqrt(sum / buf.length);
        setLevel(Math.min(1, rms * 4));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Vu-mètre indisponible : on enregistre quand même, sans animation.
    }
  }

  function stopMeter() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setLevel(0);
  }

  async function startRecording(i: number) {
    stopPlayback();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => void handleStopped(i, stream);
      rec.start();
      setCurrent(i);
      setStates((s) => setAt(s, i, "recording"));
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      startMeter(stream);
    } catch (err) {
      console.error("[ReelVoiceRecorder] accès micro refusé:", err);
      toast.error("Impossible d'accéder au micro. Autorise-le dans ton navigateur.");
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    stopMeter();
    recorderRef.current?.stop();
  }

  async function handleStopped(i: number, stream: MediaStream) {
    stream.getTracks().forEach((t) => t.stop());
    const raw = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || "audio/webm" });
    setStates((s) => setAt(s, i, "uploading"));
    try {
      const { wav, duration } = await blobToWav(raw);
      const url = await uploadVoiceClip(wav, i);
      const objectUrl = URL.createObjectURL(wav);
      setPreviews((p) => {
        const old = p[i];
        if (old) URL.revokeObjectURL(old);
        const next = setAt(p, i, objectUrl);
        previewsRef.current = next;
        return next;
      });
      setClips((c) => {
        const next = setAt(c, i, { url, duration });
        onVoicesChange(next);
        return next;
      });
      setStates((s) => setAt(s, i, "done"));
      // On RESTE sur la phrase : c'est ici que la prise devient écoutable.
      // Le passage à la suivante est un geste explicite (bouton dédié).
    } catch (e) {
      setStates((s) => setAt(s, i, "todo"));
      toast.error(e instanceof Error ? e.message : "L'enregistrement a échoué.");
    }
  }

  function stopPlayback() {
    playerRef.current?.pause();
    playerRef.current = null;
    setPlaying(null);
  }

  /** Relit la prise d'une phrase depuis la liste, sans changer de phrase courante. */
  function togglePlay(i: number) {
    if (playing === i) {
      stopPlayback();
      return;
    }
    const src = previews[i];
    if (!src) return;
    stopPlayback();
    const audio = new Audio(src);
    audio.onended = () => setPlaying(null);
    audio.onerror = () => setPlaying(null);
    playerRef.current = audio;
    setPlaying(i);
    void audio.play().catch(() => setPlaying(null));
  }

  const recording = states[current] === "recording";
  const uploading = states[current] === "uploading";
  const currentClip = clips[current];
  const doneCount = clips.filter(Boolean).length;
  const nextTodo = texts.findIndex((_, j) => j > current && !clips[j]);
  const litBars = Math.round(level * METER_BARS);

  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-3">
      <p className="text-2xs text-muted-foreground uppercase tracking-wide font-medium">
        Phrase {current + 1} sur {texts.length} · je lis à voix haute
      </p>
      <div className="rounded-md bg-primary/10 px-4 py-3">
        <p className="text-sm leading-relaxed text-foreground">« {texts[current]} »</p>
      </div>

      {recording ? (
        <div className="space-y-2">
          {/* Vu-mètre : la preuve visible que le micro entend. */}
          <div className="flex items-end justify-center gap-1 h-8" aria-hidden="true">
            {Array.from({ length: METER_BARS }, (_, b) => (
              <span
                key={b}
                className={`w-1.5 rounded-full transition-all duration-75 ${
                  b < litBars ? "bg-primary" : "bg-muted"
                }`}
                style={{ height: `${20 + b * 4}%` }}
              />
            ))}
          </div>
          <p className="text-center text-2xs text-muted-foreground" aria-live="polite">
            {litBars > 0 ? "Je t'entends…" : "Parle un peu plus fort"}
          </p>
          <div className="flex justify-center">
            <Button variant="destructive" size="sm" onClick={stopRecording}>
              <Square className="h-4 w-4 mr-1.5" />
              Stop ({elapsed}s)
            </Button>
          </div>
        </div>
      ) : currentClip ? (
        // Prise faite : on l'écoute AVANT de passer à la suite.
        <div className="space-y-2 rounded-md border border-green-600/30 bg-green-600/5 p-2.5">
          <p className="flex items-center gap-1.5 text-2xs font-medium text-green-700 dark:text-green-500">
            <CircleCheck className="h-3.5 w-3.5" />
            Prise enregistrée ({currentClip.duration.toFixed(1)} s) — écoute-la :
          </p>
          <audio src={previews[current] ?? undefined} controls className="h-8 w-full" />
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => startRecording(current)}
            >
              <Mic className="h-3.5 w-3.5 mr-1.5" />
              Refaire cette phrase
            </Button>
            {nextTodo !== -1 && (
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  stopPlayback();
                  setCurrent(nextTodo);
                }}
              >
                Phrase suivante
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex justify-center">
          <Button size="sm" onClick={() => startRecording(current)} disabled={uploading}>
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Mic className="h-4 w-4 mr-1.5" />
            )}
            {uploading ? "Envoi…" : "Enregistrer"}
          </Button>
        </div>
      )}

      <div className="space-y-1">
        {texts.map((t, i) => (
          <div
            key={i}
            className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs ${
              i === current ? "bg-muted font-medium" : "text-muted-foreground"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                stopPlayback();
                setCurrent(i);
              }}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              {clips[i] ? (
                <CircleCheck className="h-3.5 w-3.5 shrink-0 text-green-600" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 opacity-40" />
              )}
              <span className="truncate">
                {i + 1} · {t}
              </span>
            </button>
            {/* Réécoute directe, sans quitter la phrase en cours. */}
            {previews[i] && (
              <button
                type="button"
                onClick={() => togglePlay(i)}
                className="shrink-0 rounded p-1 hover:bg-background"
                aria-label={
                  playing === i ? `Arrêter la phrase ${i + 1}` : `Écouter la phrase ${i + 1}`
                }
              >
                {playing === i ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="text-2xs text-muted-foreground">
        {doneCount}/{texts.length} phrase{doneCount > 1 ? "s" : ""} enregistrée{doneCount > 1 ? "s" : ""}
        {doneCount < texts.length && " : les phrases manquantes seront lues par la voix générée."}
      </p>
    </div>
  );
}
