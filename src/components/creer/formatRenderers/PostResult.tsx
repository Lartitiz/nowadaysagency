import { Badge } from "@/components/ui/badge";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import FeedPreview from "@/components/creer/formatRenderers/FeedPreview";
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
  const hashtags = Array.isArray(result?.hashtags) ? result.hashtags : undefined;

  const [checkedText, setCheckedText] = useState(postText);

  // Légende complète telle qu'elle sera publiée (accroche incluse une seule fois).
  const caption = accroche && !checkedText.startsWith(accroche)
    ? `${accroche}\n\n${checkedText}`
    : checkedText;

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

      {/* Aperçu réaliste « comme dans le feed » */}
      <FeedPreview variant="instagram" text={caption} hashtags={hashtags} />

      <RedFlagsChecker content={checkedText} onFix={setCheckedText} />

      <AiGeneratedMention />
    </div>
  );
}
