import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useState } from "react";

interface Props {
  result: any;
}

export default function StoryResult({ result }: Props) {
  const stories = result?.stories || result?.sequences || result?.slides || [];

  const fullText = stories
    .map((s: any) => s.text || s.texte || s.content || "")
    .filter(Boolean)
    .join("\n\n");

  const [checkedText, setCheckedText] = useState(fullText);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="space-y-2">
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
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {story.text || story.texte || story.content}
                </p>
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
