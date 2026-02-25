import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Sparkles, X } from "lucide-react";

interface RedFlag {
  pattern: RegExp;
  label: string;
  fix: string;
}

const AI_RED_FLAGS: RedFlag[] = [
  { pattern: /—/g, label: "tiret cadratin", fix: ":" },
  { pattern: /[Dd]ans un monde où/g, label: "intro IA cliché", fix: "" },
  { pattern: /[Nn]'hésitez? pas/g, label: "expression IA", fix: "Si ça te parle" },
  { pattern: /[Ii]l est important de noter/g, label: "expression IA", fix: "" },
  { pattern: /[Pp]longeons dans/g, label: "expression IA", fix: "" },
  { pattern: /[Ss]ans plus attendre/g, label: "expression IA", fix: "" },
  { pattern: /[Ee]n outre/g, label: "connecteur IA", fix: "Et" },
  { pattern: /[Pp]ar conséquent/g, label: "connecteur IA", fix: "Du coup" },
  { pattern: /[Cc]ela étant dit/g, label: "connecteur IA", fix: "Sauf que" },
  { pattern: /[Ff]orce est de constater/g, label: "expression IA", fix: "" },
  { pattern: /[Ii]l convient de/g, label: "expression IA", fix: "" },
  { pattern: /[Ee]n définitive/g, label: "expression IA", fix: "" },
  { pattern: /[Dd]écortiquons/g, label: "expression IA", fix: "" },
  { pattern: /[Ee]xplorons/g, label: "expression IA", fix: "" },
  { pattern: /[Dd]écouvrons/g, label: "expression IA", fix: "" },
  { pattern: /[Pp]assons à/g, label: "transition IA", fix: "" },
  { pattern: /[Aa]bordons/g, label: "transition IA", fix: "" },
];

interface DetectedFlag {
  match: string;
  label: string;
  fix: string;
  line: number;
}

interface RedFlagsCheckerProps {
  content: string;
  onFix: (fixedContent: string) => void;
}

export default function RedFlagsChecker({ content, onFix }: RedFlagsCheckerProps) {
  const [flags, setFlags] = useState<DetectedFlag[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [fixApplied, setFixApplied] = useState(false);
  const [fixCount, setFixCount] = useState(0);

  useEffect(() => {
    if (!fixApplied) return;
    const t = setTimeout(() => setFixApplied(false), 3000);
    return () => clearTimeout(t);
  }, [fixApplied]);

  useEffect(() => {
    if (!content) return;
    const detected: DetectedFlag[] = [];
    const lines = content.split("\n");
    
    for (const flag of AI_RED_FLAGS) {
      // Reset lastIndex for global regex
      flag.pattern.lastIndex = 0;
      lines.forEach((line, lineIdx) => {
        flag.pattern.lastIndex = 0;
        let m;
        while ((m = flag.pattern.exec(line)) !== null) {
          detected.push({
            match: m[0],
            label: flag.label,
            fix: flag.fix,
            line: lineIdx + 1,
          });
        }
      });
    }
    setFlags(detected);
    setDismissed(false);
  }, [content]);

  if (fixApplied) {
    return (
      <div className="rounded-xl border border-green-300/50 bg-green-50/50 dark:bg-green-900/10 px-4 py-3 animate-fade-in">
        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
          ✅ {fixCount} expression{fixCount > 1 ? "s" : ""} corrigée{fixCount > 1 ? "s" : ""}
        </p>
      </div>
    );
  }

  if (flags.length === 0 || dismissed) return null;

  const handleAutoFix = () => {
    const count = flags.length;
    let fixed = content;
    for (const flag of AI_RED_FLAGS) {
      flag.pattern.lastIndex = 0;
      fixed = fixed.replace(flag.pattern, flag.fix);
    }
    fixed = fixed.replace(/  +/g, " ").replace(/\n\s*\n\s*\n/g, "\n\n");
    setFixCount(count);
    setFixApplied(true);
    onFix(fixed);
  };

  return (
    <div className="rounded-xl border border-yellow-300/50 bg-yellow-50/50 dark:bg-yellow-900/10 px-4 py-3 animate-fade-in">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          {flags.length} expression{flags.length > 1 ? "s" : ""} "robot" détectée{flags.length > 1 ? "s" : ""}
        </p>
        <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1 mb-3">
        {flags.slice(0, 5).map((f, i) => (
          <p key={i} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Ligne {f.line} :</span>{" "}
            "<span className="text-yellow-700 dark:text-yellow-400">{f.match}</span>"
            {f.fix ? ` → ${f.fix}` : " → supprimer"}
          </p>
        ))}
        {flags.length > 5 && (
          <p className="text-xs text-muted-foreground italic">+ {flags.length - 5} autre(s)...</p>
        )}
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={handleAutoFix} className="rounded-pill gap-1.5 text-xs">
          <Sparkles className="h-3 w-3" /> Corriger automatiquement
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)} className="rounded-pill text-xs">
          Ignorer
        </Button>
      </div>
    </div>
  );
}
