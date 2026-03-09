import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import MicButton from "@/components/MicButton";

/* ── ChoiceCard ── */
export function ChoiceCard({ emoji, label, selected, onClick }: {
  emoji: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left rounded-xl border-2 px-5 py-4 transition-all duration-200 ${
        selected ? "border-primary bg-secondary shadow-sm" : "border-border bg-card hover:border-primary/40 hover:bg-secondary/30"
      }`}>
      <span className="flex items-center gap-3">
        <span className="text-xl">{emoji}</span>
        <span className="text-sm font-medium text-foreground flex-1">{label}</span>
        {selected && <span className="text-primary font-bold">✓</span>}
      </span>
    </button>
  );
}

/* ── VoiceInput ── */
export function VoiceInput({ value, onChange, placeholder, onEnter, autoFocus = true, multiline = false, showVoiceTip = false }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onEnter?: () => void;
  autoFocus?: boolean;
  multiline?: boolean;
  showVoiceTip?: boolean;
}) {
  const { isListening, isSupported, toggle, error } = useSpeechRecognition(
    (transcript) => onChange(value ? value + " " + transcript : transcript),
  );

  if (multiline) {
    return (
      <div className="relative w-full space-y-3">
        {showVoiceTip && !value.trim() && (
          <div className="flex items-start gap-2.5 bg-secondary/80 border border-primary/15 rounded-xl px-4 py-3 animate-fade-in">
            <span className="text-lg shrink-0 mt-0.5">🎤</span>
            <p className="text-xs text-foreground/80 leading-relaxed">
              <span className="font-semibold text-foreground">Astuce :</span> tu vois le petit micro en bas à droite ? Clique dessus et parle.
            </p>
          </div>
        )}
        <div className="relative">
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            autoFocus={autoFocus}
            rows={4}
            className="w-full text-base p-4 pr-12 border-2 border-border rounded-xl focus:border-primary outline-none bg-card transition-colors text-foreground placeholder:text-muted-foreground/50 resize-none"
          />
          <button
            type="button"
            onClick={toggle}
            className={`absolute right-3 bottom-3 p-2 rounded-full transition-all ${
              isListening
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "bg-muted text-muted-foreground hover:bg-secondary"
            }`}
          >
            🎤
          </button>
        </div>
        {error && !isListening && (
          <p className="mt-1 text-xs text-destructive">{error}</p>
        )}
      </div>
    );
  }

  return (
    <>
      {showVoiceTip && !value.trim() && (
        <div className="flex items-start gap-2.5 bg-secondary/80 border border-primary/15 rounded-xl px-4 py-3 animate-fade-in mb-2">
          <span className="text-lg shrink-0 mt-0.5">🎤</span>
          <p className="text-xs text-foreground/80 leading-relaxed">
            <span className="font-semibold text-foreground">Astuce :</span> tu vois le petit micro à droite ? Clique dessus et parle.
          </p>
        </div>
      )}
      <div className="relative w-full">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && onEnter) onEnter(); }}
          placeholder={placeholder}
          aria-label={placeholder}
          autoFocus={autoFocus}
          className="w-full text-xl p-4 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50"
        />
        <button
          type="button"
          onClick={toggle}
          className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all ${
            isListening
              ? "bg-destructive text-destructive-foreground animate-pulse"
              : "bg-muted text-muted-foreground hover:bg-secondary"
          }`}
        >
          🎤
        </button>
      </div>
      {error && !isListening && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}
    </>
  );
}

/* ── InputIndicator ── */
export function InputIndicator({ status }: { status: "valid" | "warn" | "none" }) {
  if (status === "none") return null;
  return (
    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">
      {status === "valid" ? "✅" : "⚠️"}
    </span>
  );
}

/* ── URL helpers ── */
export function normalizeInstagramHandle(input: string): string {
  let v = input.trim();
  v = v.replace(/^https?:\/\/(www\.)?instagram\.com\//, "");
  v = v.replace(/^@/, "");
  v = v.replace(/\/$/, "");
  v = v.split("/")[0].split("?")[0];
  return v;
}

export function isValidUrl(input: string): boolean {
  return /^https?:\/\/.+\..+/.test(input.trim());
}

export function addHttpsIfNeeded(input: string): string {
  const v = input.trim();
  if (!v) return v;
  if (/^https?:\/\//.test(v)) return v;
  if (v.includes(".")) return "https://" + v;
  return v;
}
