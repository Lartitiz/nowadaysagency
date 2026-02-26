import { Button } from "@/components/ui/button";
import { RefreshCw, Check, AlertTriangle } from "lucide-react";
import CarouselSlideEditor from "./CarouselSlideEditor";

interface Slide {
  slide_number: number; role: string; title: string; body: string; visual_suggestion: string; word_count: number;
}

interface Caption {
  hook: string; body: string; cta: string; hashtags: string[];
}

interface QualityCheck {
  hook_word_count: number; hook_ok: boolean; all_slides_under_50_words: boolean;
  single_cta: boolean; caption_different_from_hook: boolean; slide_2_works_as_standalone_hook: boolean; score: number;
}

interface CarouselPreviewProps {
  slides: Slide[];
  caption: Caption | null;
  qualityCheck: QualityCheck | null;
  publishingTip: string;
  typeLabel: string;
  typeEmoji: string;
  objectiveLabel: string;
  chosenAngle: { emoji: string; title: string } | null;
  onUpdateSlide: (index: number, field: "title" | "body", value: string) => void;
  onUpdateCaption: (field: keyof Caption, value: any) => void;
  onRegenerate: () => void;
  onNew: () => void;
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function CarouselPreview({
  slides, caption, qualityCheck, publishingTip,
  typeLabel, typeEmoji, objectiveLabel, chosenAngle,
  onUpdateSlide, onUpdateCaption, onRegenerate, onNew,
}: CarouselPreviewProps) {
  const fullCaptionText = caption ? `${caption.hook}\n\n${caption.body}\n\n${caption.cta}` : "";
  const captionWords = countWords(fullCaptionText);
  const hashtagCount = caption?.hashtags?.length || 0;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">🎠 Ton carrousel</h1>
          <p className="mt-1 text-sm text-muted-foreground">{typeEmoji} {typeLabel} · {slides.length} slides · Objectif : {objectiveLabel}</p>
          {chosenAngle && (
            <p className="text-xs text-primary mt-0.5">{chosenAngle.emoji} Angle : {chosenAngle.title}</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onNew} className="gap-1.5 text-xs">
          <RefreshCw className="h-3.5 w-3.5" /> Nouveau
        </Button>
      </div>

      {/* Slides */}
      <div className="space-y-4 mb-8">
        {slides.map((slide, idx) => (
          <CarouselSlideEditor key={idx} slide={slide} index={idx} onUpdate={onUpdateSlide} />
        ))}
      </div>

      {/* Caption */}
      {caption && (
        <div className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-3">
          <h2 className="font-display font-bold text-foreground text-base">📝 Caption</h2>
          <textarea
            value={`${caption.hook}\n\n${caption.body}\n\n${caption.cta}`}
            onChange={(e) => {
              const parts = e.target.value.split("\n\n");
              onUpdateCaption("hook", parts[0] || "");
              onUpdateCaption("body", parts.slice(1, -1).join("\n\n") || "");
              onUpdateCaption("cta", parts[parts.length - 1] || "");
            }}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground resize-vertical min-h-[120px]"
            rows={6}
          />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Mots : {captionWords}</span>
            <span>Hashtags : {hashtagCount}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {caption.hashtags.map((h, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">#{h}</span>
            ))}
          </div>
        </div>
      )}

      {/* Quality check */}
      {qualityCheck && (
        <div className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-foreground text-base">✅ Checklist qualité</h2>
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${qualityCheck.score >= 80 ? "bg-green-100 text-green-700" : qualityCheck.score >= 60 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
              {qualityCheck.score}/100 {qualityCheck.score >= 80 ? "🟢" : qualityCheck.score >= 60 ? "🟡" : "🔴"}
            </span>
          </div>
          <ul className="space-y-1.5 text-sm">
            <QualityItem ok={qualityCheck.hook_ok} label={`Hook slide 1 : ${qualityCheck.hook_word_count} mots (max 12)`} />
            <QualityItem ok={qualityCheck.all_slides_under_50_words} label="Toutes les slides < 50 mots" />
            <QualityItem ok={qualityCheck.single_cta} label="CTA unique en dernière slide" />
            <QualityItem ok={qualityCheck.caption_different_from_hook} label="Caption ≠ hook slide 1" />
            <QualityItem ok={qualityCheck.slide_2_works_as_standalone_hook} label="Slide 2 fonctionne comme hook autonome" />
          </ul>
        </div>
      )}

      {publishingTip && (
        <p className="text-xs text-muted-foreground italic mb-6">💡 {publishingTip}</p>
      )}

      {/* Actions */}
      <div className="rounded-2xl border border-border bg-muted/30 p-5 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onRegenerate} className="rounded-full gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Régénérer
          </Button>
        </div>
      </div>
    </>
  );
}

function QualityItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? <Check className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-yellow-600" />}
      <span className={ok ? "text-foreground" : "text-yellow-700"}>{ok ? "✅" : "⚠️"} {label}</span>
    </li>
  );
}
