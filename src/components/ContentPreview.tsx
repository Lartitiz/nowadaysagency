import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ContentPreviewProps {
  contentData: any;
  contentType?: string;
  contentDraft?: string | null;
  compact?: boolean;
}

export function ContentPreview({ contentData, contentType, contentDraft, compact = false }: ContentPreviewProps) {
  const data = parseData(contentData);

  if (!data && contentDraft) {
    // If contentDraft is plain text (not JSON), show it directly
    const parsed = tryParseJSON(contentDraft);
    if (parsed) {
      return <ContentPreview contentData={parsed} contentType={contentType} compact={compact} />;
    }
    return <p className="text-sm text-foreground whitespace-pre-wrap">{contentDraft}</p>;
  }

  if (!data) return null;

  // Detect type from data structure if contentType not provided
  const detectedType = contentType || detectType(data);

  if (detectedType === "reel") return <ReelPreview data={data} compact={compact} />;
  if (detectedType === "stories") return <StoriesPreview data={data} compact={compact} />;
  if (detectedType === "post_instagram" || detectedType === "post_linkedin") return <PostPreview data={data} />;

  return <FallbackPreview data={data} />;
}

/* ─── Reel Preview ─── */
function ReelPreview({ data, compact }: { data: any; compact: boolean }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(!compact);

  const handleCopyScript = () => {
    const text = data.script?.map((s: any) =>
      `[${s.timing}] ${s.section?.toUpperCase()}\n"${s.texte_parle}"${s.texte_overlay ? `\n📝 ${s.texte_overlay}` : ""}`
    ).join("\n\n───\n\n") || "";
    navigator.clipboard.writeText(text);
    toast({ title: "Script copié !" });
  };

  const handleCopyCaption = () => {
    if (data.caption) {
      navigator.clipboard.writeText(`${data.caption.text}\n\n${data.caption.cta}\n\n${data.hashtags?.join(" ") || ""}`);
      toast({ title: "Caption copiée !" });
    }
  };

  if (compact) {
    // Compact: show hook + format info
    const hook = data.script?.find((s: any) => s.section === "hook");
    return (
      <div className="text-sm">
        <p className="text-xs text-muted-foreground mb-1">
          🎬 {data.format_label || data.format_type || "Reel"} · {data.duree_cible || ""}
        </p>
        {hook?.texte_parle && (
          <p className="text-foreground/70 line-clamp-2 italic">🎤 "{hook.texte_parle}"</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono-ui font-semibold text-muted-foreground">🎬 SCRIPT DU REEL</p>
        {data.duree_cible && (
          <span className="text-xs text-muted-foreground">{data.format_label || data.format_type} · {data.duree_cible}</span>
        )}
      </div>

      {data.script?.map((section: any, idx: number) => {
        const icon = section.section === "hook" ? "🎤" : section.section === "cta" ? "📣" : "📖";
        return (
          <div key={idx} className="border-b border-border pb-3 last:border-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                {icon} {section.section} {section.timing && `(${section.timing})`}
              </span>
            </div>
            {section.texte_parle && (
              <p className="text-sm text-foreground mb-1">"{section.texte_parle}"</p>
            )}
            {section.format_visuel && (
              <p className="text-xs text-muted-foreground italic">{section.format_visuel}</p>
            )}
            {section.texte_overlay && (
              <div className="mt-1 inline-block bg-foreground text-background text-xs px-2 py-0.5 rounded font-bold">
                {section.texte_overlay}
              </div>
            )}
            {section.cut && (
              <p className="text-xs text-muted-foreground mt-1">✂️ CUT → {section.cut}</p>
            )}
            {section.tip && (
              <p className="text-xs text-accent-foreground mt-1">💡 {section.tip}</p>
            )}
          </div>
        );
      })}

      {data.caption && (
        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">📝 CAPTION</p>
          <p className="text-sm text-foreground whitespace-pre-line">{data.caption.text}</p>
          {data.caption.cta && <p className="text-sm text-primary font-medium">{data.caption.cta}</p>}
          {data.hashtags && <p className="text-xs text-muted-foreground">{data.hashtags.join(" ")}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleCopyScript} className="rounded-pill text-xs gap-1.5">
          <Copy className="h-3 w-3" /> Copier le script
        </Button>
        {data.caption && (
          <Button variant="outline" size="sm" onClick={handleCopyCaption} className="rounded-pill text-xs gap-1.5">
            <Copy className="h-3 w-3" /> Copier la caption
          </Button>
        )}
      </div>
    </div>
  );
}

/* ─── Stories Preview ─── */
function StoriesPreview({ data, compact }: { data: any; compact: boolean }) {
  const { toast } = useToast();
  const stories = data.stories || data.sequence || [];

  if (compact) {
    return (
      <div className="text-sm">
        <p className="text-xs text-muted-foreground mb-1">
          📱 {stories.length} stories · {data.structure_type || data.sequence_type || ""}
        </p>
        {stories[0]?.text && (
          <p className="text-foreground/70 line-clamp-2 italic">"{stories[0].text}"</p>
        )}
      </div>
    );
  }

  const handleCopyAll = () => {
    const text = stories.map((s: any) =>
      `${s.timing_emoji || ""} STORY ${s.number} · ${s.role || s.format || ""}\n${s.format_label || s.format || ""}\n\n${s.text}${s.sticker ? `\n🎯 ${s.sticker.label}${s.sticker.options ? ` → ${s.sticker.options.join(" / ")}` : ""}` : ""}`
    ).join("\n\n───\n\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Séquence copiée !" });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-mono-ui font-semibold text-muted-foreground">📱 SÉQUENCE STORIES</p>

      {stories.map((story: any, idx: number) => (
        <div key={idx} className="border-b border-border pb-3 last:border-0">
          <p className="text-xs font-semibold text-muted-foreground mb-1">
            {story.timing_emoji || "📱"} Story {story.number || idx + 1} · {story.timing || ""} · {story.format_label || story.format || ""}
          </p>
          {story.duration_seconds && (
            <p className="text-xs text-muted-foreground">({story.duration_seconds}s)</p>
          )}
          <p className="text-sm text-foreground mt-1">"{story.text}"</p>
          {story.sticker && (
            <div className="mt-1.5 rounded-lg border border-primary/20 bg-rose-pale px-2 py-1">
              <p className="text-xs font-semibold text-primary">🎯 {story.sticker.label || story.sticker.type}</p>
              {story.sticker.options && (
                <p className="text-xs text-muted-foreground">{story.sticker.options.join(" / ")}</p>
              )}
            </div>
          )}
          {story.tip && (
            <p className="text-xs text-muted-foreground italic mt-1">💡 {story.tip}</p>
          )}
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={handleCopyAll} className="rounded-pill text-xs gap-1.5">
        <Copy className="h-3 w-3" /> Copier tout
      </Button>
    </div>
  );
}

/* ─── Post Preview ─── */
function PostPreview({ data }: { data: any }) {
  const text = typeof data === "string" ? data : data.content || data.contenu || data.text || "";
  if (!text) return <FallbackPreview data={data} />;
  return <p className="text-sm text-foreground whitespace-pre-wrap">{text}</p>;
}

/* ─── Fallback: extract text values ─── */
function FallbackPreview({ data }: { data: any }) {
  if (typeof data === "string") {
    return <p className="text-sm text-foreground whitespace-pre-wrap">{data}</p>;
  }

  const entries = Object.entries(data)
    .filter(([_, val]) => typeof val === "string" && (val as string).length > 5)
    .slice(0, 10);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      {entries.map(([key, val]) => (
        <div key={key}>
          <span className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")} :</span>
          <p className="text-sm text-foreground">{val as string}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Helpers ─── */
function parseData(contentData: any): any | null {
  if (!contentData) return null;
  if (typeof contentData === "object") return contentData;
  return tryParseJSON(contentData);
}

function tryParseJSON(str: string): any | null {
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function detectType(data: any): string {
  if (data.script && Array.isArray(data.script)) return "reel";
  if (data.stories && Array.isArray(data.stories)) return "stories";
  if (data.sequence && Array.isArray(data.sequence)) return "stories";
  return "post";
}