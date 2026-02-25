import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Copy, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface BioHistoryEntry {
  id: string;
  bio_text: string;
  score: number | null;
  structure_type: string | null;
  source: string | null;
  created_at: string;
}

interface BioHistoryDrawerProps {
  platform: "instagram" | "linkedin";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReuse?: (text: string) => void;
}

export default function BioHistoryDrawer({ platform, open, onOpenChange, onReuse }: BioHistoryDrawerProps) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const [entries, setEntries] = useState<BioHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    (supabase.from("bio_versions") as any)
      .select("id, bio_text, score, structure_type, source, created_at")
      .eq(column, value)
      .eq("platform", platform)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }: any) => {
        setEntries(data || []);
        setLoading(false);
      });
  }, [open, user?.id]);

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>📜 Historique de tes bios</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="flex gap-1">
                <div className="h-2 w-2 rounded-full bg-primary animate-bounce" />
                <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.15s" }} />
                <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.3s" }} />
              </div>
            </div>
          )}

          {!loading && entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Pas encore d'historique. Valide ta première bio pour commencer !
            </p>
          )}

          {entries.map((entry) => {
            const lines = entry.bio_text.split("\n");
            const isLong = lines.length > 3;
            const isExpanded = expanded === entry.id;
            const displayText = isLong && !isExpanded ? lines.slice(0, 3).join("\n") + "…" : entry.bio_text;

            return (
              <div key={entry.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  </span>
                  {entry.score != null && (
                    <span className={cn(
                      "text-xs font-bold px-2 py-0.5 rounded-full",
                      entry.score >= 70 ? "text-green-700 bg-green-50" : entry.score >= 40 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50"
                    )}>
                      {entry.score}/100
                    </span>
                  )}
                  {entry.structure_type && (
                    <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                      {entry.structure_type}
                    </span>
                  )}
                </div>

                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{displayText}</p>
                {isLong && !isExpanded && (
                  <button onClick={() => setExpanded(entry.id)} className="text-xs text-primary hover:underline">
                    Voir plus
                  </button>
                )}
                {isExpanded && (
                  <button onClick={() => setExpanded(null)} className="text-xs text-primary hover:underline">
                    Réduire
                  </button>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-pill gap-1 text-xs h-7" onClick={() => copy(entry.bio_text, entry.id)}>
                    {copied === entry.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied === entry.id ? "Copié" : "Copier"}
                  </Button>
                  {onReuse && (
                    <Button variant="ghost" size="sm" className="rounded-pill gap-1 text-xs h-7" onClick={() => { onReuse(entry.bio_text); onOpenChange(false); }}>
                      <RotateCcw className="h-3 w-3" /> Réutiliser
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
