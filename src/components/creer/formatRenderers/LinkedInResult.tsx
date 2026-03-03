import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useState } from "react";

interface Props {
  result: any;
}

export default function LinkedInResult({ result }: Props) {
  const hook = result?.hook || result?.accroche || "";
  const body = result?.body || result?.content || result?.text || "";
  const cta = result?.cta || result?.call_to_action || "";
  const hashtags = result?.hashtags || [];
  const characterCount = result?.character_count || result?.char_count;
  const checklist = result?.checklist || result?.quality_checklist || [];
  const hookAlternatives = result?.hook_alternatives || result?.alternatives || [];

  const fullText = [hook, body, cta].filter(Boolean).join("\n\n");
  const [checkedText, setCheckedText] = useState(fullText);

  const hookTruncated = hook.length > 210;

  return (
    <div className="space-y-4 animate-fade-in">
      {hook && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Accroche</p>
            <p className="text-sm font-bold text-foreground">{hook}</p>
            {hookTruncated && (
              <p className="text-[10px] text-amber-600">⚠️ {hook.length} caractères — LinkedIn tronque à ~210 car.</p>
            )}
          </CardContent>
        </Card>
      )}

      {body && (
        <Card className="border-border">
          <CardContent className="p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Corps</p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{body}</p>
          </CardContent>
        </Card>
      )}

      {cta && (
        <Card className="border-border">
          <CardContent className="p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">CTA</p>
            <p className="text-sm text-primary font-medium">{cta}</p>
          </CardContent>
        </Card>
      )}

      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(Array.isArray(hashtags) ? hashtags : [hashtags]).map((tag: string, i: number) => (
            <Badge key={i} variant="secondary" className="text-[10px]">
              {tag.startsWith("#") ? tag : `#${tag}`}
            </Badge>
          ))}
        </div>
      )}

      {characterCount && (
        <p className="text-xs text-muted-foreground">{characterCount} caractères</p>
      )}

      {checklist.length > 0 && (
        <Card className="border-border">
          <CardContent className="p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Checklist qualité</p>
            <ul className="space-y-1">
              {checklist.map((item: any, i: number) => {
                const label = typeof item === "string" ? item : item.label || item.text;
                const ok = typeof item === "object" ? item.ok ?? item.checked ?? true : true;
                return (
                  <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                    <span>{ok ? "✅" : "❌"}</span>
                    <span>{label}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {hookAlternatives.length > 0 && (
        <Accordion type="single" collapsible>
          <AccordionItem value="alternatives" className="border-border">
            <AccordionTrigger className="text-xs font-semibold py-2">
              Accroches alternatives ({hookAlternatives.length})
            </AccordionTrigger>
            <AccordionContent className="space-y-1.5 pb-2">
              {hookAlternatives.map((alt: any, i: number) => {
                const text = typeof alt === "string" ? alt : alt.hook || alt.text || alt.label;
                return (
                  <div key={i} className="rounded-lg border border-border bg-card p-2">
                    <p className="text-sm text-foreground">{text}</p>
                  </div>
                );
              })}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      <RedFlagsChecker content={checkedText} onFix={setCheckedText} />

      <AiGeneratedMention />
    </div>
  );
}
