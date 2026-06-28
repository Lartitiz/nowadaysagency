import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Mail } from "lucide-react";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  result: any;
}

export default function NewsletterResult({ result }: Props) {
  const subject = result?.subject || "";
  const previewText = result?.preview_text || "";
  const body = result?.body || result?.content || result?.text || "";
  const wordCount = result?.word_count;
  const ctaSuggestion = result?.cta_suggestion;
  

  const fullText = [subject, body].filter(Boolean).join("\n\n");
  const [checkedText, setCheckedText] = useState(fullText);

  const copySubject = () => {
    navigator.clipboard.writeText(subject);
    toast.success("Objet copié !");
  };

  const copyAll = () => {
    const text = [
      subject ? `Objet : ${subject}` : null,
      previewText ? `Preview : ${previewText}` : null,
      body,
      ctaSuggestion ? `---\n${ctaSuggestion}` : null,
    ].filter(Boolean).join("\n\n");
    navigator.clipboard.writeText(text);
    toast.success("Newsletter copiée !");
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Subject line */}
      {subject && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> Objet de l'email
              </p>
              <Button variant="ghost" size="sm" onClick={copySubject} className="h-6 px-2 text-2xs gap-1 text-muted-foreground">
                <Copy className="h-3 w-3" /> Copier
              </Button>
            </div>
            <p className="text-sm font-bold text-foreground">{subject}</p>
          </CardContent>
        </Card>
      )}

      {/* Preview text */}
      {previewText && (
        <Card className="border-border">
          <CardContent className="p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview text</p>
            <p className="text-sm text-muted-foreground italic">{previewText}</p>
            <p className="text-2xs text-muted-foreground">{previewText.length} caractères</p>
          </CardContent>
        </Card>
      )}

      {/* Body */}
      {body && (
        <Card className="border-border">
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Contenu</p>
            <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto pr-1">
              {body}
            </div>
          </CardContent>
        </Card>
      )}

      {/* CTA suggestion */}
      {ctaSuggestion && (
        <Card className="border-accent/30 bg-accent/5">
          <CardContent className="p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Suggestion de CTA</p>
            <p className="text-sm text-foreground">{ctaSuggestion}</p>
          </CardContent>
        </Card>
      )}

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {wordCount && <span>{wordCount} mots</span>}
      </div>

      {/* Copy all */}
      <Button variant="outline" size="sm" onClick={copyAll} className="w-full gap-1.5">
        <Copy className="h-3.5 w-3.5" /> Copier la newsletter complète
      </Button>

      <RedFlagsChecker content={checkedText} onFix={setCheckedText} />
      <AiGeneratedMention />
    </div>
  );
}
