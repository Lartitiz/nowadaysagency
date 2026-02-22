import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ContentPreviewProps {
  contentData: any;
  contentType?: string;
  contentDraft?: string | null;
  compact?: boolean;
  editable?: boolean;
  onContentChange?: (updatedData: any) => void;
}

export function ContentPreview({ contentData, contentType, contentDraft, compact = false, editable = false, onContentChange }: ContentPreviewProps) {
  const data = parseData(contentData);

  if (!data && contentDraft) {
    const parsed = tryParseJSON(contentDraft);
    if (parsed) {
      return <ContentPreview contentData={parsed} contentType={contentType} compact={compact} editable={editable} onContentChange={onContentChange} />;
    }
    if (editable && onContentChange) {
      return <EditableText value={contentDraft} onSave={(v) => onContentChange(v)} />;
    }
    return <p className="text-sm text-foreground whitespace-pre-wrap">{contentDraft}</p>;
  }

  if (!data) return null;

  const detectedType = contentType || detectType(data);

  if (detectedType === "reel") return <ReelPreview data={data} compact={compact} editable={editable} onContentChange={onContentChange} />;
  if (detectedType === "stories") return <StoriesPreview data={data} compact={compact} editable={editable} onContentChange={onContentChange} />;
  if (detectedType === "post_instagram" || detectedType === "post_linkedin") return <PostPreview data={data} editable={editable} onContentChange={onContentChange} />;

  return <FallbackPreview data={data} editable={editable} onContentChange={onContentChange} />;
}

/* ─── Inline Editable Text ─── */
function EditableText({ value, onSave, className = "", placeholder = "" }: { value: string; onSave: (v: string) => void; className?: string; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      autoResize(textareaRef.current);
    }
  }, [editing]);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  const handleSave = useCallback(() => {
    if (draft !== value) {
      onSave(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setEditing(false);
  }, [draft, value, onSave]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setDraft(value); setEditing(false); }
  };

  if (editing) {
    return (
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); autoResize(e.target); }}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:border-primary transition-colors ${className}`}
        />
        <button
          onMouseDown={(e) => { e.preventDefault(); handleSave(); }}
          className="absolute bottom-2 right-2 text-primary hover:text-primary/80 transition-colors"
          aria-label="Valider"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <span className="relative inline">
      <span
        onClick={() => setEditing(true)}
        className={`cursor-text rounded px-0.5 -mx-0.5 transition-colors hover:bg-[hsl(270,50%,97%)] ${className}`}
      >
        {value || <span className="italic text-muted-foreground">{placeholder || "Cliquer pour éditer"}</span>}
      </span>
      {saved && (
        <span className="ml-2 text-xs text-primary animate-fade-in">✓ Modifié</span>
      )}
    </span>
  );
}

/* ─── Reel Preview ─── */
function ReelPreview({ data, compact, editable, onContentChange }: { data: any; compact: boolean; editable?: boolean; onContentChange?: (d: any) => void }) {
  const { toast } = useToast();
  const [localData, setLocalData] = useState(data);

  useEffect(() => { setLocalData(data); }, [data]);

  const updateField = useCallback((path: string[], value: string) => {
    const updated = JSON.parse(JSON.stringify(localData));
    let obj = updated;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    obj[path[path.length - 1]] = value;
    setLocalData(updated);
    onContentChange?.(updated);
  }, [localData, onContentChange]);

  const handleCopyScript = () => {
    const text = localData.script?.map((s: any) =>
      `[${s.timing}] ${s.section?.toUpperCase()}\n"${s.texte_parle}"${s.texte_overlay ? `\n📝 ${s.texte_overlay}` : ""}`
    ).join("\n\n───\n\n") || "";
    navigator.clipboard.writeText(text);
    toast({ title: "Script copié !" });
  };

  const handleCopyCaption = () => {
    if (localData.caption) {
      navigator.clipboard.writeText(`${localData.caption.text}\n\n${localData.caption.cta}\n\n${localData.hashtags?.join(" ") || ""}`);
      toast({ title: "Caption copiée !" });
    }
  };

  if (compact) {
    const hook = localData.script?.find((s: any) => s.section === "hook");
    return (
      <div className="text-sm">
        <p className="text-xs text-muted-foreground mb-1">
          🎬 {localData.format_label || localData.format_type || "Reel"} · {localData.duree_cible || ""}
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
        {localData.duree_cible && (
          <span className="text-xs text-muted-foreground">{localData.format_label || localData.format_type} · {localData.duree_cible}</span>
        )}
      </div>

      {localData.script?.map((section: any, idx: number) => {
        const icon = section.section === "hook" ? "🎤" : section.section === "cta" ? "📣" : "📖";
        return (
          <div key={idx} className="border-b border-border pb-3 last:border-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                {icon} {section.section} {section.timing && `(${section.timing})`}
              </span>
            </div>
            {section.format_visuel != null && (
              editable ? (
                <EditableText
                  value={section.format_visuel || ""}
                  onSave={(v) => updateField(["script", String(idx), "format_visuel"], v)}
                  className="text-xs text-muted-foreground italic"
                />
              ) : (
                section.format_visuel && <p className="text-xs text-muted-foreground italic">{section.format_visuel}</p>
              )
            )}
            {section.texte_parle != null && (
              editable ? (
                <div className="my-1">
                  <EditableText
                    value={section.texte_parle || ""}
                    onSave={(v) => updateField(["script", String(idx), "texte_parle"], v)}
                    className="text-sm text-foreground"
                  />
                </div>
              ) : (
                section.texte_parle && <p className="text-sm text-foreground mb-1">"{section.texte_parle}"</p>
              )
            )}
            {section.texte_overlay != null && (
              editable ? (
                <div className="mt-1">
                  <span className="text-xs text-muted-foreground mr-1">📝</span>
                  <EditableText
                    value={section.texte_overlay || ""}
                    onSave={(v) => updateField(["script", String(idx), "texte_overlay"], v)}
                    className="text-xs font-bold"
                  />
                </div>
              ) : (
                section.texte_overlay && (
                  <div className="mt-1 inline-block bg-foreground text-background text-xs px-2 py-0.5 rounded font-bold">
                    {section.texte_overlay}
                  </div>
                )
              )
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

      {localData.caption && (
        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">📝 CAPTION</p>
          {editable ? (
            <>
              <EditableText
                value={localData.caption.text || ""}
                onSave={(v) => updateField(["caption", "text"], v)}
                className="text-sm text-foreground"
              />
              {localData.caption.cta != null && (
                <EditableText
                  value={localData.caption.cta || ""}
                  onSave={(v) => updateField(["caption", "cta"], v)}
                  className="text-sm text-primary font-medium"
                />
              )}
              {localData.hashtags && (
                <EditableText
                  value={localData.hashtags.join(" ")}
                  onSave={(v) => {
                    const updated = JSON.parse(JSON.stringify(localData));
                    updated.hashtags = v.split(/\s+/).filter(Boolean);
                    setLocalData(updated);
                    onContentChange?.(updated);
                  }}
                  className="text-xs text-muted-foreground"
                />
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-foreground whitespace-pre-line">{localData.caption.text}</p>
              {localData.caption.cta && <p className="text-sm text-primary font-medium">{localData.caption.cta}</p>}
              {localData.hashtags && <p className="text-xs text-muted-foreground">{localData.hashtags.join(" ")}</p>}
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleCopyScript} className="rounded-pill text-xs gap-1.5">
          <Copy className="h-3 w-3" /> Copier le script
        </Button>
        {localData.caption && (
          <Button variant="outline" size="sm" onClick={handleCopyCaption} className="rounded-pill text-xs gap-1.5">
            <Copy className="h-3 w-3" /> Copier la caption
          </Button>
        )}
      </div>
    </div>
  );
}

/* ─── Stories Preview ─── */
function StoriesPreview({ data, compact, editable, onContentChange }: { data: any; compact: boolean; editable?: boolean; onContentChange?: (d: any) => void }) {
  const { toast } = useToast();
  const [localData, setLocalData] = useState(data);
  const storiesKey = localData.stories ? "stories" : "sequence";
  const stories = localData[storiesKey] || [];

  useEffect(() => { setLocalData(data); }, [data]);

  const updateStoryField = useCallback((storyIdx: number, field: string, value: string) => {
    const updated = JSON.parse(JSON.stringify(localData));
    updated[storiesKey][storyIdx][field] = value;
    setLocalData(updated);
    onContentChange?.(updated);
  }, [localData, storiesKey, onContentChange]);

  const updateStickerField = useCallback((storyIdx: number, field: string, value: string) => {
    const updated = JSON.parse(JSON.stringify(localData));
    if (field === "options") {
      updated[storiesKey][storyIdx].sticker.options = value.split(" / ").map((s: string) => s.trim()).filter(Boolean);
    } else {
      updated[storiesKey][storyIdx].sticker[field] = value;
    }
    setLocalData(updated);
    onContentChange?.(updated);
  }, [localData, storiesKey, onContentChange]);

  if (compact) {
    return (
      <div className="text-sm">
        <p className="text-xs text-muted-foreground mb-1">
          📱 {stories.length} stories · {localData.structure_type || localData.sequence_type || ""}
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
          {editable ? (
            <div className="mt-1">
              <EditableText
                value={story.text || ""}
                onSave={(v) => updateStoryField(idx, "text", v)}
                className="text-sm text-foreground"
              />
            </div>
          ) : (
            <p className="text-sm text-foreground mt-1">"{story.text}"</p>
          )}
          {story.sticker && (
            <div className="mt-1.5 rounded-lg border border-primary/20 bg-rose-pale px-2 py-1">
              {editable ? (
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-xs">🎯</span>
                    <EditableText
                      value={story.sticker.label || story.sticker.type || ""}
                      onSave={(v) => updateStickerField(idx, "label", v)}
                      className="text-xs font-semibold text-primary"
                    />
                  </div>
                  {story.sticker.options && (
                    <EditableText
                      value={story.sticker.options.join(" / ")}
                      onSave={(v) => updateStickerField(idx, "options", v)}
                      className="text-xs text-muted-foreground"
                    />
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold text-primary">🎯 {story.sticker.label || story.sticker.type}</p>
                  {story.sticker.options && (
                    <p className="text-xs text-muted-foreground">{story.sticker.options.join(" / ")}</p>
                  )}
                </>
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
function PostPreview({ data, editable, onContentChange }: { data: any; editable?: boolean; onContentChange?: (d: any) => void }) {
  const text = typeof data === "string" ? data : data.content || data.contenu || data.text || "";
  if (!text && !editable) return <FallbackPreview data={data} />;

  if (editable && onContentChange) {
    const key = typeof data === "string" ? null : data.content ? "content" : data.contenu ? "contenu" : "text";
    return (
      <EditableText
        value={text}
        onSave={(v) => {
          if (typeof data === "string") { onContentChange(v); return; }
          const updated = { ...data, [key || "content"]: v };
          onContentChange(updated);
        }}
        className="text-sm text-foreground"
      />
    );
  }

  return <p className="text-sm text-foreground whitespace-pre-wrap">{text}</p>;
}

/* ─── Fallback: extract text values ─── */
function FallbackPreview({ data, editable, onContentChange }: { data: any; editable?: boolean; onContentChange?: (d: any) => void }) {
  if (typeof data === "string") {
    if (editable && onContentChange) {
      return <EditableText value={data} onSave={(v) => onContentChange(v)} className="text-sm text-foreground" />;
    }
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
          {editable && onContentChange ? (
            <EditableText
              value={val as string}
              onSave={(v) => { onContentChange({ ...data, [key]: v }); }}
              className="text-sm text-foreground"
            />
          ) : (
            <p className="text-sm text-foreground">{val as string}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Revert Button ─── */
export function RevertToOriginalButton({ onRevert }: { onRevert: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Revenir à la version IA ? Tes modifs seront perdues.</span>
        <Button variant="outline" size="sm" className="rounded-pill text-xs h-7" onClick={onRevert}>Oui</Button>
        <Button variant="ghost" size="sm" className="rounded-pill text-xs h-7" onClick={() => setConfirming(false)}>Non</Button>
      </div>
    );
  }
  return (
    <button onClick={() => setConfirming(true)} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
      <RotateCcw className="h-3 w-3" /> Revenir à la version générée par l'IA
    </button>
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
