import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useState } from "react";

interface Props {
  result: any;
  content?: string;
}

export default function PostResult({ result, content }: Props) {
  const postText = content || result?.content || result?.post || result?.text || "";
  const accroche = result?.accroche || result?.hook || "";
  const format = result?.format || result?.content_type;
  const objective = result?.objective || result?.objectif;

  const [checkedText, setCheckedText] = useState(postText);

  const bodyText = accroche && postText.startsWith(accroche)
    ? postText.slice(accroche.length).trim()
    : postText;

  return (
    <div className="space-y-4 animate-fade-in">
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

      <RedFlagsChecker content={checkedText} onFix={setCheckedText} />

      <AiGeneratedMention />
    </div>
  );
}
