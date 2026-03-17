import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useState, useCallback, useRef, useEffect } from "react";

interface Props {
  result: any;
  onStoriesUpdate?: (stories: any[]) => void;
}

export default function StoryResult({ result, onStoriesUpdate }: Props) {
  const rawStories: any[] = result?.stories || result?.sequences || result?.slides || [];
  const [stories, setStories] = useState(rawStories);

  const prevSignature = useRef(JSON.stringify(rawStories.map((_: any, i: number) => i)));

  useEffect(() => {
    const newSig = JSON.stringify(rawStories.map((_: any, i: number) => i));
    if (newSig !== prevSignature.current) {
      setStories(rawStories);
      prevSignature.current = newSig;
    }
  }, [result]);

  const fullText = stories
    .map((s: any) => s.text || s.texte || s.content || "")
    .filter(Boolean)
    .join("\n\n");

  const [checkedText, setCheckedText] = useState(fullText);

  const getTextField = (story: any): "text" | "texte" | "content" => {
    if ("text" in story) return "text";
    if ("texte" in story) return "texte";
    return "content";
  };

  const updateStoryText = useCallback((index: number, newValue: string) => {
    setStories(prev => {
      const updated = [...prev];
      const field = getTextField(updated[index]);
      updated[index] = { ...updated[index], [field]: newValue };
      onStoriesUpdate?.(updated);
      return updated;
    });
  }, [onStoriesUpdate]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="space-y-2" data-selection-enabled="true">
        {stories.map((story: any, i: number) => (
          <Card key={i} className="border-border">
            <CardContent className="p-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="font-mono text-[10px]">
                  Story {i + 1}
                </Badge>
                {story.timing && (
                  <Badge variant="outline" className="font-mono text-[10px]">{story.timing}</Badge>
                )}
                {story.role && (
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-mono">
                    {story.role}
                  </Badge>
                )}
                {story.format && (
                  <Badge variant="outline" className="text-[10px]">{story.format}</Badge>
                )}
              </div>
              {(story.text || story.texte || story.content) && (
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const newText = e.currentTarget.textContent || "";
                    const oldText = story.text || story.texte || story.content || "";
                    if (newText !== oldText) {
                      updateStoryText(i, newText);
                    }
                  }}
                  className="text-sm text-foreground leading-relaxed whitespace-pre-wrap rounded px-1 -mx-1 transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-text"
                >
                  {story.text || story.texte || story.content}
                </div>
              )}
              {story.sticker && (
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    {story.sticker.type || "Sticker"}
                  </Badge>
                  {story.sticker.label && (
                    <span className="text-xs text-muted-foreground">{story.sticker.label}</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <RedFlagsChecker content={checkedText} onFix={setCheckedText} />

      <AiGeneratedMention />
    </div>
  );
}
