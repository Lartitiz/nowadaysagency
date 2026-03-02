import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw, RotateCcw, CalendarDays, Save } from "lucide-react";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useState } from "react";

interface Props {
  result: any;
  onCopy: () => void;
  onRegenerate: () => void;
  onReset: () => void;
  onSave?: () => void;
  onCalendar?: () => void;
}

export default function StoryResult({ result, onCopy, onRegenerate, onReset, onSave, onCalendar }: Props) {
  const stories = result?.stories || result?.sequences || result?.slides || [];

  const fullText = stories
    .map((s: any) => s.text || s.texte || s.content || "")
    .filter(Boolean)
    .join("\n\n");

  const [checkedText, setCheckedText] = useState(fullText);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Stories sequence */}
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

      {/* Red flags */}
      <RedFlagsChecker content={checkedText} onFix={setCheckedText} />

      <AiGeneratedMention />

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onCopy} className="gap-1.5">
          <Copy className="h-3.5 w-3.5" /> Copier
        </Button>
        <Button variant="outline" size="sm" onClick={onRegenerate} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Regénérer
        </Button>
        {onSave && (
          <Button variant="outline" size="sm" onClick={onSave} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> Sauvegarder
          </Button>
        )}
        {onCalendar && (
          <Button variant="outline" size="sm" onClick={onCalendar} className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> Planifier
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5 ml-auto">
          <RotateCcw className="h-3.5 w-3.5" /> Nouveau contenu
        </Button>
      </div>
    </div>
  );
}
