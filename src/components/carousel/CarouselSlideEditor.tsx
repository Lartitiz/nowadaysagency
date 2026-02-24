interface Slide {
  slide_number: number;
  role: string;
  title: string;
  body: string;
  visual_suggestion: string;
  word_count: number;
}

interface CarouselSlideEditorProps {
  slide: Slide;
  index: number;
  onUpdate: (index: number, field: "title" | "body", value: string) => void;
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function wordColor(count: number) {
  if (count > 50) return "text-red-500";
  if (count > 40) return "text-yellow-600";
  return "text-muted-foreground";
}

export default function CarouselSlideEditor({ slide, index, onUpdate }: CarouselSlideEditorProps) {
  const wc = countWords(`${slide.title} ${slide.body || ""}`);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${slide.role === "hook" ? "bg-primary/10 text-primary border-primary/20" : slide.role === "cta" ? "bg-green-100 text-green-700 border-green-200" : "bg-accent/50 text-accent-foreground border-accent"}`}>
            {slide.role === "hook" ? "🎯" : slide.role === "cta" ? "📣" : slide.role === "recap" ? "🔑" : "📌"} SLIDE {slide.slide_number} · {slide.role.toUpperCase()}
          </span>
        </div>
        <span className={`text-xs font-mono ${wordColor(wc)}`}>
          {wc} mots {wc > 50 ? "🔴" : wc > 40 ? "🟡" : "🟢"}
        </span>
      </div>

      <textarea
        value={slide.title}
        onChange={(e) => onUpdate(index, "title", e.target.value)}
        className="w-full bg-transparent font-display font-bold text-foreground text-[15px] resize-none border-none outline-none leading-snug"
        rows={1}
      />
      {(slide.body || slide.role !== "hook") && (
        <textarea
          value={slide.body || ""}
          onChange={(e) => onUpdate(index, "body", e.target.value)}
          className="w-full bg-transparent text-sm text-muted-foreground resize-none border-none outline-none leading-relaxed"
          rows={2}
          placeholder="Texte complémentaire..."
        />
      )}

      {slide.visual_suggestion && (
        <p className="text-xs text-muted-foreground italic">💡 {slide.visual_suggestion}</p>
      )}
      {slide.role === "hook" && wc > 12 && (
        <p className="text-xs text-red-500">⚠️ Max 12 mots pour le hook. Raccourcis !</p>
      )}
      {wc > 50 && (
        <p className="text-xs text-red-500">🔴 Trop long. Découpe en 2 slides ou raccourcis.</p>
      )}
    </div>
  );
}
