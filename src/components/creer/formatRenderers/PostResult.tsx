import { Badge } from "@/components/ui/badge";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import FeedPreview from "@/components/creer/formatRenderers/FeedPreview";
import { stripCoachingHint } from "@/features/creer/build-calendar-content";
import { useState } from "react";

interface Props {
  result: any;
  content?: string;
  photos?: { preview?: string; base64?: string; name?: string }[];
}

const FORMAT_LABELS: Record<string, string> = {
  caption_instagram: "Caption Instagram",
  post_instagram: "Post Instagram",
  post_linkedin: "Post LinkedIn",
  caption_linkedin: "Caption LinkedIn",
  carousel: "Carrousel",
  reel: "Reel",
  story: "Story",
  newsletter: "Newsletter",
  pinterest: "Pinterest",
};

/** Libellé humain pour un format technique (« caption_instagram » → « Caption Instagram »). */
function humanFormat(raw: string): string {
  if (FORMAT_LABELS[raw]) return FORMAT_LABELS[raw];
  const words = raw.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default function PostResult({ result, content, photos }: Props) {
  // Filet : le conseil d'incarnation vit dans personal_tip, jamais dans le texte.
  const postText = stripCoachingHint(content || result?.content || result?.post || result?.text || "");
  const personalTip = result?.personal_tip;
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
            <Badge className="bg-primary/10 text-primary border-primary/20">{humanFormat(String(format))}</Badge>
          )}
          {objective && (
            <Badge variant="secondary">{objective}</Badge>
          )}
        </div>
      )}

      {/* Aperçu réaliste « comme dans le feed » */}
      <FeedPreview variant="instagram" text={caption} hashtags={hashtags} photos={photos} />

      {personalTip && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
          <p className="text-sm text-foreground">{personalTip}</p>
        </div>
      )}

      <RedFlagsChecker content={checkedText} onFix={setCheckedText} />

      <AiGeneratedMention />
    </div>
  );
}
