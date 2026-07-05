import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useState } from "react";

interface Props {
  result: any;
}

export default function ReelResult({ result }: Props) {
  const formatType = result?.format_type || result?.format;
  const dureeCible = result?.duree_cible || result?.duration;
  const sections = result?.sections || (Array.isArray(result?.script) ? result.script : result?.script?.sections) || [];
  const personalTip = result?.personal_tip || result?.conseil_personnalise;
  const lectureTest = result?.lecture_test;
  // Shot list de tournage (chantier « scripts Reels ») — champ additif : les
  // contenus générés avant ce chantier ne l'ont pas, la section ne s'affiche pas.
  const planTournage = Array.isArray(result?.plan_tournage) ? result.plan_tournage : [];

  const fullText = sections
    .map((s: any) => [s.texte_parle, s.texte_overlay].filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n");

  const [checkedText, setCheckedText] = useState(fullText);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 flex-wrap">
        {formatType && (
          <Badge className="bg-primary/10 text-primary border-primary/20">{formatType}</Badge>
        )}
        {dureeCible && (
          <Badge variant="secondary" className="font-mono">{dureeCible}</Badge>
        )}
      </div>

      {lectureTest && (
        <div className="rounded-lg bg-accent/30 border border-accent p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-foreground uppercase tracking-wide">📖 Lecture face cam</span>
            <Badge variant="secondary" className="text-2xs">monologue continu</Badge>
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{lectureTest}</p>
          <p className="text-2xs text-muted-foreground italic">Lis ce texte d'une traite à voix haute. S'il sonne fluide → tu peux tourner. S'il sonne robotique → relance la génération.</p>
        </div>
      )}

      <div className="space-y-2">
        {sections.map((section: any, i: number) => (
          <Card key={i} className="border-border">
            <CardContent className="p-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                {section.timing && (
                  <Badge variant="secondary" className="font-mono text-2xs">
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
                <Badge className="bg-primary/10 text-primary border-primary/20 text-2xs font-normal">
                  📝 {section.texte_overlay}
                </Badge>
              )}
              {section.cut && (
                <p className="text-2xs text-muted-foreground font-mono">Cut : {section.cut}</p>
              )}
              {section.tip && (
                <p className="text-xs text-muted-foreground">💡 {section.tip}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {planTournage.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-foreground uppercase tracking-wide">🎥 Ton plan de tournage</span>
            <Badge variant="secondary" className="text-2xs">{planTournage.length} plans</Badge>
          </div>
          <p className="text-2xs text-muted-foreground">
            Tout se tourne au téléphone, dans cet ordre — les prises face cam d'abord, les plans de coupe ensuite.
          </p>
          <div className="space-y-2">
            {planTournage.map((shot: any, i: number) => (
              <div key={i} className="flex gap-2.5 items-start rounded-lg bg-muted/30 p-2.5">
                <span className="font-mono text-2xs text-muted-foreground pt-0.5 shrink-0">{i + 1}.</span>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-2xs">
                      {shot.type === "face_cam" ? "🎤 Face cam" : shot.type === "insert" ? "🔍 Insert" : "🎬 B-roll"}
                    </Badge>
                    {shot.duree && <span className="font-mono text-2xs text-muted-foreground">{shot.duree}</span>}
                  </div>
                  {shot.plan && <p className="text-sm text-foreground leading-snug">{shot.plan}</p>}
                  {shot.sert_pour && (
                    <p className="text-2xs text-muted-foreground">Sert pour : {shot.sert_pour}</p>
                  )}
                  {shot.conseil && <p className="text-xs text-muted-foreground">💡 {shot.conseil}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {personalTip && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
          <p className="text-xs font-semibold text-primary mb-1">🎯 Conseil personnalisé</p>
          <p className="text-sm text-foreground">{personalTip}</p>
        </div>
      )}

      <RedFlagsChecker content={checkedText} onFix={setCheckedText} />

      <AiGeneratedMention />
    </div>
  );
}
