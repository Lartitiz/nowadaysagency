import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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

export default function LinkedInResult({ result, onCopy, onRegenerate, onReset, onSave, onCalendar }: Props) {
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
      {/* Hook */}
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

      {/* Body */}
      {body && (
        <Card className="border-border">
          <CardContent className="p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Corps</p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{body}</p>
          </CardContent>
        </Card>
      )}

      {/* CTA */}
      {cta && (
        <Card className="border-border">
          <CardContent className="p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">CTA</p>
            <p className="text-sm text-primary font-medium">{cta}</p>
          </CardContent>
        </Card>
      )}

      {/* Hashtags */}
      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(Array.isArray(hashtags) ? hashtags : [hashtags]).map((tag: string, i: number) => (
            <Badge key={i} variant="secondary" className="text-[10px]">
              {tag.startsWith("#") ? tag : `#${tag}`}
            </Badge>
          ))}
        </div>
      )}

      {/* Character count */}
      {characterCount && (
        <p className="text-xs text-muted-foreground">{characterCount} caractères</p>
      )}

      {/* Checklist */}
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

      {/* Hook alternatives */}
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
