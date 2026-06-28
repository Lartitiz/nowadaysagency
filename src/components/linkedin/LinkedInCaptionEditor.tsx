import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import CharacterCounter from "@/components/linkedin/CharacterCounter";

interface LinkedInCaptionEditorProps {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  hashtagInput: string;
  onChangeHook: (v: string) => void;
  onChangeBody: (v: string) => void;
  onChangeCta: (v: string) => void;
  onChangeHashtags: (raw: string) => void;
  loading?: boolean;
}

export default function LinkedInCaptionEditor({
  hook,
  body,
  cta,
  hashtags,
  hashtagInput,
  onChangeHook,
  onChangeBody,
  onChangeCta,
  onChangeHashtags,
  loading = false,
}: LinkedInCaptionEditorProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">📝 Post LinkedIn (légende)</p>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">✍️ Rédaction de la légende LinkedIn…</span>
        </div>
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="border-border">
            <CardContent className="p-3 space-y-2">
              <div className="h-3 w-24 rounded bg-muted/70 animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-3 w-full rounded bg-muted/50 animate-pulse" />
                <div className="h-3 w-11/12 rounded bg-muted/50 animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-muted/50 animate-pulse" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const hookLen = (hook || "").length;
  const bodyLen = (body || "").length;
  const ctaLen = (cta || "").length;
  const hashtagsCount = hashtags.length;

  const hookTruncated = hookLen > 210;
  const bodyAmber = bodyLen > 2500 && bodyLen <= 3000;
  const bodyOver = bodyLen > 3000;
  const tagsTooMany = hashtagsCount > 5;

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">📝 Post LinkedIn (légende)</p>

      {/* Accroche */}
      <Card className="border-border">
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Accroche</label>
            <CharacterCounter count={hookLen} max={210} sweetSpot={{ min: 100, max: 210 }} />
          </div>
          <Textarea
            value={hook || ""}
            onChange={(e) => onChangeHook(e.target.value)}
            className="resize-none min-h-[56px] font-bold text-sm"
            rows={2}
            placeholder="Phrase choc qui s'affiche avant le « voir plus »"
          />
          {hookTruncated && (
            <p className="text-[10px] text-warning">
              ⚠️ LinkedIn tronque à ~210 car. dans le feed — la fin sera coupée.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Corps */}
      <Card className="border-border">
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Corps du post</label>
            <span
              className={`text-xs font-medium tabular-nums ${
                bodyOver
                  ? "text-destructive"
                  : bodyAmber
                  ? "text-warning"
                  : bodyLen >= 300 && bodyLen <= 1200
                  ? "text-success"
                  : "text-muted-foreground"
              }`}
            >
              {bodyLen} car.
              {bodyLen >= 300 && bodyLen <= 1200 && " ✨ Sweet spot"}
              {bodyAmber && " — Long"}
              {bodyOver && " — Trop long (max 3000)"}
            </span>
          </div>
          <Textarea
            value={body || ""}
            onChange={(e) => onChangeBody(e.target.value)}
            className="resize-none min-h-[140px] text-sm"
            rows={7}
            placeholder="Le récit, l'envers du décor, l'émotion (~300-1200 car. = sweet spot LinkedIn)"
          />
        </CardContent>
      </Card>

      {/* CTA */}
      <Card className="border-border">
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">CTA</label>
            <span className="text-xs font-medium text-muted-foreground tabular-nums">{ctaLen} car.</span>
          </div>
          <Textarea
            value={cta || ""}
            onChange={(e) => onChangeCta(e.target.value)}
            className="resize-none min-h-[48px] text-sm"
            rows={2}
            placeholder="Invitation à commenter / partager"
          />
        </CardContent>
      </Card>

      {/* Hashtags */}
      <Card className="border-border">
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hashtags</label>
            <span
              className={`text-xs font-medium tabular-nums ${
                tagsTooMany ? "text-warning" : hashtagsCount >= 3 && hashtagsCount <= 5 ? "text-success" : "text-muted-foreground"
              }`}
            >
              {hashtagsCount} / 3-5 max
            </span>
          </div>
          <div className="flex flex-wrap gap-1 mb-1">
            {hashtags.map((tag, i) => (
              <Badge key={i} variant="secondary" className="text-[10px]">
                {tag.startsWith("#") ? tag : `#${tag}`}
              </Badge>
            ))}
          </div>
          <Input
            value={hashtagInput}
            onChange={(e) => onChangeHashtags(e.target.value)}
            placeholder="#hashtag1 #hashtag2 #hashtag3"
            className="text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            💡 3-5 hashtags max sur LinkedIn (au-delà = effet spammy).
            {tagsTooMany && <span className="text-warning"> Tu en as {hashtagsCount}, pense à réduire.</span>}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
