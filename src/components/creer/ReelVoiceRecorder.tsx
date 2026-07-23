/**
 * ReelVoiceRecorder — téléprompteur d'enregistrement de la voix, phrase par
 * phrase (une section du script = un enregistrement). Enregistrer par phrase
 * évite les grands blancs entre les phrases (chaque prise est posée sur sa
 * scène) et permet de ne réenregistrer QUE la phrase ratée.
 *
 * Remonte à son parent la liste des URLs publiques (une par section, null si
 * pas encore enregistrée) via `onVoicesChange`.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, RotateCcw, CircleCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { blobToWav, uploadVoiceClip } from "@/lib/reel-voice";

interface Props {
  /** Textes parlés, dans l'ordre des sections. */
  texts: string[];
  onVoicesChange: (urls: (string | null)[]) => void;
}

type SectionState = "todo" | "recording" | "uploading" | "done";

export default function ReelVoiceRecorder({ texts, onVoicesChange }: Props) {
  const [current, setCurrent] = useState(0);
  const [states, setStates] = useState<SectionState[]>(() => texts.map(() => "todo"));
  const [urls, setUrls] = useState<(string | null)[]>(() => texts.map(() => null));
  const [previews, setPreviews] = useState<(string | null)[]>(() => texts.map(() => null));
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Coupe proprement micro et minuteur si l'écran se ferme en cours de prise.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const setAt = <T,>(arr: T[], i: number, v: T): T[] => {
    const c = arr.slice();
    c[i] = v;
    return c;
  };

  async function startRecording(i: number) {
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
    } catch (err) {
      console.error("[ReelVoiceRecorder] accès micro refusé:", err);
      toast.error("Impossible d'accéder au micro. Autorise-le dans ton navigateur.");
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  }

  async function handleStopped(i: number, stream: MediaStream) {
    stream.getTracks().forEach((t) => t.stop());
    const raw = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || "audio/webm" });
    setStates((s) => setAt(s, i, "uploading"));
    try {
      const wav = await blobToWav(raw);
      const url = await uploadVoiceClip(wav, i);
      setPreviews((p) => setAt(p, i, URL.createObjectURL(wav)));
      setUrls((u) => {
        const next = setAt(u, i, url);
        onVoicesChange(next);
        return next;
      });
      setStates((s) => setAt(s, i, "done"));
      // Enchaîne sur la phrase suivante non faite, pour un parcours fluide.
      const nextTodo = texts.findIndex((_, j) => j > i && !urls[j]);
      if (nextTodo !== -1) setCurrent(nextTodo);
    } catch (e) {
      setStates((s) => setAt(s, i, "todo"));
      toast.error(e instanceof Error ? e.message : "L'enregistrement a échoué.");
    }
  }

  const recording = states[current] === "recording";
  const doneCount = urls.filter(Boolean).length;

  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-3">
      <p className="text-2xs text-muted-foreground uppercase tracking-wide font-medium">
        Phrase {current + 1} sur {texts.length} · je lis à voix haute
      </p>
      <div className="rounded-md bg-primary/10 px-4 py-3">
        <p className="text-sm leading-relaxed text-foreground">« {texts[current]} »</p>
      </div>

      <div className="flex items-center justify-center gap-3">
        {recording ? (
          <Button variant="destructive" size="sm" onClick={stopRecording}>
            <Square className="h-4 w-4 mr-1.5" />
            Stop ({elapsed}s)
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => startRecording(current)}
            disabled={states[current] === "uploading"}
          >
            {states[current] === "uploading" ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Mic className="h-4 w-4 mr-1.5" />
            )}
            {urls[current] ? "Réenregistrer" : "Enregistrer"}
          </Button>
        )}
        {previews[current] && !recording && (
          <audio src={previews[current] ?? undefined} controls className="h-8 max-w-[180px]" />
        )}
      </div>

      <div className="space-y-1">
        {texts.map((t, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setCurrent(i)}
            className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs ${
              i === current ? "bg-muted font-medium" : "text-muted-foreground"
            }`}
          >
            {urls[i] ? (
              <CircleCheck className="h-3.5 w-3.5 shrink-0 text-green-600" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5 shrink-0 opacity-40" />
            )}
            <span className="truncate">
              {i + 1} · {t}
            </span>
          </button>
        ))}
      </div>

      <p className="text-2xs text-muted-foreground">
        {doneCount}/{texts.length} phrase{doneCount > 1 ? "s" : ""} enregistrée{doneCount > 1 ? "s" : ""}
        {doneCount < texts.length && " — les phrases manquantes seront lues par la voix générée."}
      </p>
    </div>
  );
}
