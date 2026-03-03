import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, RotateCcw, CalendarDays } from "lucide-react";
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

export default function ReelResult({ result, onCopy, onRegenerate, onReset, onSave, onCalendar }: Props) {
  const formatType = result?.format_type || result?.format;
  const dureeCible = result?.duree_cible || result?.duration;
  const sections = result?.sections || result?.script?.sections || [];
  const personalTip = result?.personal_tip || result?.conseil_personnalise;

  const fullText = sections
    .map((s: any) => [s.texte_parle, s.texte_overlay].filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n");

  const [checkedText, setCheckedText] = useState(fullText);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Format badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {formatType && (
          <Badge className="bg-primary/10 text-primary border-primary/20">{formatType}</Badge>
        )}
        {dureeCible && (
          <Badge variant="secondary" className="font-mono">{dureeCible}</Badge>
        )}
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {sections.map((section: any, i: number) => (
          <Card key={i} className="border-border">
            <CardContent className="p-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                {section.timing && (
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {section.timing}
                  </Badge>
                )}
                {section.label && (
                  <span className="text-xs font-semibold text-foreground">{section.label}</span>
                )}
              </div>
              {section.format_visuel && (
                <p className="text-xs italic text-muted-foreground">📹 {section.format_visuel}</p>
              )}
              {section.texte_parle && (
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{section.texte_parle}</p>
              )}
              {section.texte_overlay && (
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-normal">
                  📝 {section.texte_overlay}
                </Badge>
              )}
              {section.cut && (
                <p className="text-[10px] text-muted-foreground font-mono">Cut : {section.cut}</p>
              )}
              {section.tip && (
                <p className="text-xs text-muted-foreground">💡 {section.tip}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Personal tip */}
      {personalTip && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
          <p className="text-xs font-semibold text-primary mb-1">🎯 Conseil personnalisé</p>
          <p className="text-sm text-foreground">{personalTip}</p>
        </div>
      )}

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
