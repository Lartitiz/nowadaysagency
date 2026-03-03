import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, RotateCcw, CalendarDays } from "lucide-react";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useState } from "react";

interface Props {
  result: any;
  content?: string;
  onCopy: () => void;
  onRegenerate: () => void;
  onReset: () => void;
  onSave?: () => void;
  onCalendar?: () => void;
}

export default function PostResult({ result, content, onCopy, onRegenerate, onReset, onSave, onCalendar }: Props) {
  const postText = content || result?.content || result?.post || result?.text || "";
  const accroche = result?.accroche || result?.hook || "";
  const format = result?.format || result?.content_type;
  const objective = result?.objective || result?.objectif;

  const [checkedText, setCheckedText] = useState(postText);

  // Split accroche from body if accroche is the start of the text
  const bodyText = accroche && postText.startsWith(accroche)
    ? postText.slice(accroche.length).trim()
    : postText;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Badges */}
      {(format || objective) && (
        <div className="flex items-center gap-2 flex-wrap">
          {format && (
            <Badge className="bg-primary/10 text-primary border-primary/20">{format}</Badge>
          )}
          {objective && (
            <Badge variant="secondary">{objective}</Badge>
          )}
        </div>
      )}

      {/* Post content */}
      <Card className="border-border">
        <CardContent className="p-4 space-y-2">
          {accroche && !postText.startsWith(accroche) && (
            <p className="text-sm font-bold text-foreground leading-relaxed">{accroche}</p>
          )}
          {accroche && postText.startsWith(accroche) ? (
            <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              <span className="font-bold">{accroche}</span>
              {bodyText && <>{"\n\n"}{bodyText}</>}
            </div>
          ) : (
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{checkedText}</p>
          )}
        </CardContent>
      </Card>

      {/* Red flags */}
      <RedFlagsChecker content={checkedText} onFix={setCheckedText} />

      <AiGeneratedMention />

      {/* === ACTIONS === */}
      <div className="space-y-3 pt-2">
        {onCalendar && (
          <Button onClick={onCalendar} className="w-full gap-2 h-11 text-sm font-semibold">
            <CalendarDays className="h-4 w-4" /> Ajouter au calendrier
          </Button>
        )}
        <div className="flex items-center justify-center gap-3">
          <Button variant="ghost" size="sm" onClick={onCopy} className="gap-1.5 text-xs text-muted-foreground">
            <Copy className="h-3.5 w-3.5" /> Copier
          </Button>
          <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5 text-xs text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5" /> Nouveau contenu
          </Button>
        </div>
      </div>
    </div>
  );
}
