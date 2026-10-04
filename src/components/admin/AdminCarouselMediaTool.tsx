import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// Étape 3 du chantier images : range les photos collées des contenus existants
// (idées, posts du calendrier) via l'edge function carousel-media-backfill.
// « Simuler » ne modifie rien ; la conversion garde l'original en sauvegarde.

type Table = "saved_ideas" | "calendar_posts";
const TABLES: { id: Table; label: string }[] = [
  { id: "saved_ideas", label: "Idées" },
  { id: "calendar_posts", label: "Posts du calendrier" },
];

interface BatchReport {
  processed: number; converted: number; unchanged: number; conflicts: number; images: number;
  bytesBefore: number; bytesAfter: number; failed: { id: string; reasons: string[] }[];
  next: string | null; done: boolean;
}
interface Totals { converted: number; conflicts: number; images: number; bytesBefore: number; bytesAfter: number; failed: { id: string; reasons: string[] }[] }
const empty = (): Totals => ({ converted: 0, conflicts: 0, images: 0, bytesBefore: 0, bytesAfter: 0, failed: [] });
const mo = (bytes: number) => bytes < 1_000_000
  ? `${Math.round(bytes / 1000).toLocaleString("fr-FR")} Ko`
  : `${(bytes / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;

export default function AdminCarouselMediaTool() {
  const [running, setRunning] = useState<null | "dry" | "apply">(null);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{ dryRun: boolean; totals: Record<Table, Totals> } | null>(null);
  const [error, setError] = useState("");
  const stop = useRef(false);

  const run = async (dryRun: boolean) => {
    setRunning(dryRun ? "dry" : "apply"); setError(""); setResult(null); stop.current = false;
    const totals = { saved_ideas: empty(), calendar_posts: empty() } as Record<Table, Totals>;
    try {
      for (const table of TABLES) {
        let after: string | null = null;
        for (let batch = 1; batch <= 200 && !stop.current; batch++) {
          setProgress(`${table.label} : paquet ${batch}…`);
          const { data, error: invokeError } = await supabase.functions.invoke("carousel-media-backfill", {
            body: { table: table.id, after, limit: 5, dryRun },
          });
          if (invokeError) throw invokeError;
          const report = data as BatchReport;
          const t = totals[table.id];
          t.converted += report.converted; t.conflicts += report.conflicts; t.images += report.images;
          t.bytesBefore += report.bytesBefore; t.bytesAfter += report.bytesAfter; t.failed.push(...report.failed);
          setResult({ dryRun, totals: { ...totals } });
          if (report.done || !report.next || report.next === after) break;
          after = report.next;
        }
      }
      setProgress(stop.current ? "Arrêté." : "Terminé.");
    } catch (e: any) {
      setError(e?.message || "La conversion s'est arrêtée.");
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        Range dans le stockage d'images les photos encore collées dans les contenus existants : chaque contenu ne garde
        qu'un lien vers ses photos. La date « modifiée le » ne change pas, et l'original est gardé en sauvegarde.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!!running} onClick={() => run(true)}>
          {running === "dry" && <Loader2 className="h-4 w-4 animate-spin" />} Simuler (ne modifie rien)
        </Button>
        <Button disabled={!!running || !result?.dryRun} onClick={() => run(false)}>
          {running === "apply" && <Loader2 className="h-4 w-4 animate-spin" />} Lancer la conversion
        </Button>
        {running && <Button variant="ghost" onClick={() => { stop.current = true; }}>Arrêter après ce paquet</Button>}
      </div>
      {progress && <p role="status" className="text-muted-foreground">{progress}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {result && (
        <ul className="space-y-2" aria-label={result.dryRun ? "Résultat de la simulation" : "Résultat de la conversion"}>
          {TABLES.map(({ id, label }) => {
            const t = result.totals[id];
            return (
              <li key={id} className="rounded-xl border border-border p-3">
                <p className="font-semibold">{label}</p>
                <p>
                  {result.dryRun
                    ? `${t.converted} contenu(s) à convertir, ${t.images} photo(s), ${mo(t.bytesBefore)} aujourd'hui.`
                    : `${t.converted} contenu(s) convertis, ${t.images} photo(s) rangées : ${mo(t.bytesBefore)} → ${mo(t.bytesAfter)}.`}
                </p>
                {t.conflicts > 0 && <p>{t.conflicts} contenu(s) modifié(s) pendant la conversion, laissés tels quels (relancer plus tard).</p>}
                {t.failed.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-destructive">{t.failed.length} contenu(s) non convertis (laissés intacts)</summary>
                    <ul className="mt-1 text-xs">{t.failed.map((f) => <li key={f.id}>{f.id.slice(0, 8)} : {f.reasons.join(" ; ")}</li>)}</ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
