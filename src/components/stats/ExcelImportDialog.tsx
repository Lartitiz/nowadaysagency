import { useState, useRef } from "react";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { Upload, Check, AlertTriangle, Loader2, FileSpreadsheet, X } from "lucide-react";


const METRIC_LABELS: Record<string, { label: string; emoji: string }> = {
  objective: { label: "Objectif du mois", emoji: "🎯" },
  content_published: { label: "Contenu publié", emoji: "📝" },
  reach: { label: "Portée", emoji: "📣" },
  stories_coverage: { label: "Couverture stories", emoji: "📱" },
  views: { label: "Nb de vues", emoji: "👁️" },
  profile_visits: { label: "Visites profil", emoji: "👤" },
  website_clicks: { label: "Clics site web", emoji: "🔗" },
  interactions: { label: "Interactions", emoji: "💬" },
  accounts_engaged: { label: "Comptes qui ont interagi", emoji: "🤝" },
  followers_engaged: { label: "Followers qui ont interagi", emoji: "❤️" },
  followers: { label: "Abonné·es (total)", emoji: "👥" },
  followers_gained: { label: "Followers gagnés", emoji: "📈" },
  followers_lost: { label: "Followers perdus", emoji: "📉" },
  email_signups: { label: "Inscrits email", emoji: "📧" },
  newsletter_subscribers: { label: "Abonnés newsletter", emoji: "📰" },
  website_visitors: { label: "Visiteurs site", emoji: "🌐" },
  traffic_pinterest: { label: "Trafic Pinterest", emoji: "📌" },
  traffic_instagram: { label: "Trafic Instagram", emoji: "📷" },
  ga4_users: { label: "Utilisateurs GA4", emoji: "📊" },
  traffic_search: { label: "Trafic recherche", emoji: "🔍" },
  traffic_social: { label: "Trafic réseaux sociaux", emoji: "🌍" },
  ad_budget: { label: "Budget pub", emoji: "💶" },
  page_views_plan: { label: "Pages plan de com'", emoji: "📄" },
  page_views_academy: { label: "Pages Accompagnement", emoji: "🎓" },
  page_views_agency: { label: "Pages Agency", emoji: "🏢" },
  discovery_calls: { label: "Appels découverte", emoji: "📞" },
  clients_signed: { label: "Clients signés", emoji: "✍️" },
  revenue: { label: "CA", emoji: "💰" },
};

type MappingResult = {
  sheet: string;
  date_column: number;
  mapping: Record<string, number | null>;
  skip_columns: number[];
  date_format: string;
  start_row: number;
  confidence: string;
};

type ImportStep = "upload" | "analyzing" | "validate" | "correcting" | "preview" | "importing" | "done";
type PreviewRow = { monthDate: string; payload: Record<string, any> };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onImportComplete: () => void;
}

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthLabel(dateStr: string) {
  const d = new Date(dateStr);
  return `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

async function parseMonthDate(value: any, rowIndex: number, prevDate: Date | null): Promise<Date | null> {
  if (!value && value !== 0) return null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), 1);
  }

  if (typeof value === "number") {
    if (value > 40000 && value < 60000) {
      const d = new Date((value - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    try {
      const XLSX = await import("xlsx");
      const parsed = XLSX.SSF.parse_date_code(value) as any;
      if (parsed) return new Date(parsed.y, parsed.m - 1, 1);
    } catch { /* */ }
    return null;
  }

  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase().replace(/['']/g, "'");
  if (!text) return null;

  if (text.match(/^\d{4}-\d{2}-\d{2}/)) {
    const d = new Date(text);
    if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  const frMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (frMatch) {
    const d = new Date(parseInt(frMatch[3]), parseInt(frMatch[2]) - 1, 1);
    if (!isNaN(d.getTime())) return d;
  }

  if (/\d{4}/.test(value.trim())) {
    const iso = new Date(value.trim());
    if (!isNaN(iso.getTime())) return new Date(iso.getFullYear(), iso.getMonth(), 1);
  }

  const monthMap: Record<string, number> = {
    janvier: 0, jan: 0, janv: 0,
    "février": 1, fevrier: 1, fev: 1, "fév": 1,
    mars: 2, mar: 2,
    avril: 3, avr: 3,
    mai: 4,
    juin: 5,
    juillet: 6, juil: 6,
    aout: 7, "août": 7,
    septembre: 8, sept: 8, sep: 8,
    octobre: 9, oct: 9,
    novembre: 10, nov: 10,
    "décembre": 11, decembre: 11, dec: 11, "déc": 11,
  };

  let foundMonth: number | null = null;
  const sortedKeys = Object.keys(monthMap).sort((a, b) => b.length - a.length);
  for (const name of sortedKeys) {
    if (text.startsWith(name)) { foundMonth = monthMap[name]; break; }
  }
  if (foundMonth === null) return null;

  const yearMatch = text.match(/(\d{2,4})/);
  let foundYear: number | null = null;
  if (yearMatch) {
    let y = parseInt(yearMatch[1]);
    if (y < 100) y += 2000;
    foundYear = y;
  }

  if (foundYear === null && prevDate) {
    foundYear = foundMonth <= prevDate.getMonth() ? prevDate.getFullYear() + 1 : prevDate.getFullYear();
  }

  if (foundYear === null) {
    foundYear = rowIndex <= 12 ? 2024 : rowIndex <= 24 ? 2025 : 2026;
  }

  return new Date(foundYear, foundMonth, 1);
}

function safeNum(val: any): number | null {
  if (val == null || val === "" || val === "-" || val === "/" || val === "__" || val === "—" || val === "--") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  if (typeof val === "string") {
    const match = val.match(/[\d\s.,]+/);
    if (match) {
      const cleaned = match[0].replace(/[\s.]/g, "").replace(",", ".");
      const n = parseFloat(cleaned);
      return isNaN(n) ? null : n;
    }
  }
  return null;
}

function txt(val: any) {
  return (val != null && val !== "" && val !== "__" && val !== "--") ? String(val) : null;
}

export default function ExcelImportDialog({ open, onOpenChange, userId, onImportComplete }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const { column, value } = useWorkspaceFilter();

  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState("");
  const [workbook, setWorkbook] = useState<any>(null);
  const [sheetsInfo, setSheetsInfo] = useState<any[]>([]);
  const [aiMapping, setAiMapping] = useState<MappingResult | null>(null);
  const [editedMapping, setEditedMapping] = useState<Record<string, number | null>>({});
  const [editedDateCol, setEditedDateCol] = useState(0);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [allHeaders, setAllHeaders] = useState<(string | null)[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [corrections, setCorrections] = useState<string[]>([]);
  const [skippedRows, setSkippedRows] = useState<{ row: number; value: any; reason: string }[]>([]);
  const [importedCount, setImportedCount] = useState(0);

  const resetState = () => {
    setStep("upload");
    setFileName("");
    setWorkbook(null);
    setSheetsInfo([]);
    setAiMapping(null);
    setEditedMapping({});
    setEditedDateCol(0);
    setSelectedSheet("");
    setAllHeaders([]);
    setPreviewRows([]);
    setCorrections([]);
    setSkippedRows([]);
    setImportedCount(0);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setStep("analyzing");

    try {
      const ab = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const wb = XLSX.read(ab, { type: "array", cellDates: true, dateNF: "dd/mm/yyyy" });
      setWorkbook(wb);

      // Extract info from each sheet
      const infos = wb.SheetNames.map(name => {
        const ws = wb.Sheets[name];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false, dateNF: "yyyy-mm-dd" });
        const headers = (rows[0] || []).map((h: any) => h != null ? String(h) : null);
        const sampleRows = rows.slice(1, 4).map(r => (r || []).map((c: any) => c != null ? String(c) : null));
        return { name, headers, sampleRows, rowCount: rows.length - 1 };
      });
      setSheetsInfo(infos);

      // Check for saved mapping with same headers
      const { data: savedMappings } = await (supabase.from("import_mappings" as any) as any)
        .select("*")
        .eq(column, value)
        .order("created_at", { ascending: false })
        .limit(5);

      const savedMatch = (savedMappings as any[] || []).find((m: any) => {
        const savedHeaders = m.headers as string[];
        return infos.some(s => {
          if (savedHeaders.length !== s.headers.length) return false;
          return savedHeaders.every((h: string, i: number) => h === s.headers[i]);
        });
      });

      if (savedMatch) {
        // Reuse saved mapping
        const mapping: MappingResult = {
          sheet: savedMatch.sheet_name,
          date_column: savedMatch.date_column,
          mapping: savedMatch.column_mapping as Record<string, number | null>,
          skip_columns: [],
          date_format: savedMatch.date_format || "auto",
          start_row: savedMatch.start_row || 2,
          confidence: "high",
        };
        const sheetInfo = infos.find(s => s.name === savedMatch.sheet_name) || infos[0];
        setAllHeaders(sheetInfo.headers);
        setSelectedSheet(sheetInfo.name);
        setAiMapping(mapping);
        setEditedMapping({ ...mapping.mapping });
        setEditedDateCol(mapping.date_column);
        setStep("validate");
        toast({ title: "🔄 Mapping précédent réutilisé", description: "J'ai reconnu la structure de ton fichier." });
        return;
      }

      // Call AI to analyze
      const { data, error } = await invokeWithTimeout("analyze-excel-mapping", {
        body: { sheets: infos },
      }, 60000);

      if (error) throw new Error(error.message);

      const mapping = data as MappingResult;
      const sheetInfo = infos.find(s => s.name === mapping.sheet) || infos[0];
      setAllHeaders(sheetInfo.headers);
      setSelectedSheet(sheetInfo.name);
      setAiMapping(mapping);
      setEditedMapping({ ...mapping.mapping });
      setEditedDateCol(mapping.date_column);
      setStep("validate");
    } catch (err: any) {
      console.error("Import analysis error:", err);
      toast({ title: "Erreur d'analyse", description: err.message || "Impossible d'analyser le fichier.", variant: "destructive" });
      setStep("upload");
    }

    if (e.target) e.target.value = "";
  };

  const runImport = async (mapping: Record<string, number | null>, dateCol: number, sheetName: string) => {
    if (!workbook) return;
    const XLSX = await import("xlsx");
    const ws = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false, dateNF: "yyyy-mm-dd" });

    const startRow = aiMapping?.start_row || 2;
    const imported: PreviewRow[] = [];
    const skipped: { row: number; value: any; reason: string }[] = [];
    let prevDate: Date | null = null;

    for (let i = startRow - 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.every((c: any) => c == null || c === "")) continue;

      const dateVal = r[dateCol];
      const md = await parseMonthDate(dateVal, i, prevDate);
      if (!md) {
        if (dateVal != null && String(dateVal).trim() !== "") {
          skipped.push({ row: i + 1, value: dateVal, reason: "Date non reconnue" });
        }
        continue;
      }
      prevDate = md;

      const payload: Record<string, any> = { user_id: userId, month_date: monthKey(md) };

      for (const [metric, colIdx] of Object.entries(mapping)) {
        if (colIdx == null) continue;
        const val = r[colIdx];
        if (["objective", "content_published"].includes(metric)) {
          payload[metric] = txt(val);
        } else {
          payload[metric] = safeNum(val);
        }
      }

      imported.push({ monthDate: monthKey(md!), payload });
    }

    // Fix year sequence gaps
    imported.sort((a, b) => a.monthDate.localeCompare(b.monthDate));
    const corrs: string[] = [];
    for (let i = 1; i < imported.length; i++) {
      const prevD = new Date(imported[i - 1].monthDate);
      const currD = new Date(imported[i].monthDate);
      const monthDiff = (currD.getFullYear() - prevD.getFullYear()) * 12 + (currD.getMonth() - prevD.getMonth());
      if (monthDiff > 6) {
        const expectedMonth = (prevD.getMonth() + 1) % 12;
        const expectedYear = prevD.getMonth() + 1 > 11 ? prevD.getFullYear() + 1 : prevD.getFullYear();
        const oldKey = imported[i].monthDate;
        const newKey = monthKey(new Date(expectedYear, expectedMonth, 1));
        imported[i].monthDate = newKey;
        imported[i].payload.month_date = newKey;
        corrs.push(`${monthLabel(oldKey)} → ${monthLabel(newKey)}`);
      }
    }
    if (corrs.length > 0) imported.sort((a, b) => a.monthDate.localeCompare(b.monthDate));

    // Remove duplicates (keep last)
    const deduped = new Map<string, PreviewRow>();
    for (const row of imported) deduped.set(row.monthDate, row);
    const final = Array.from(deduped.values()).sort((a, b) => a.monthDate.localeCompare(b.monthDate));

    setPreviewRows(final);
    setCorrections(corrs);
    setSkippedRows(skipped);
    setStep("preview");
  };

  const handleConfirmImport = async () => {
    setStep("importing");
    try {
      let count = 0;
      for (const row of previewRows) {
        const { error } = await supabase.from("monthly_stats" as any).upsert(row.payload, { onConflict: "user_id,month_date" });
        if (!error) count++;
      }

      // Save mapping for reuse
      await supabase.from("import_mappings" as any).upsert({
        user_id: userId,
        file_name: fileName,
        sheet_name: selectedSheet,
        column_mapping: editedMapping,
        date_column: editedDateCol,
        date_format: aiMapping?.date_format || "auto",
        start_row: aiMapping?.start_row || 2,
        headers: allHeaders,
      } as any, { onConflict: "user_id,sheet_name" as any });

      setImportedCount(count);
      setStep("done");
      onImportComplete();
    } catch (err: any) {
      toast({ title: "Erreur lors de l'import", description: err.message, variant: "destructive" });
      setStep("preview");
    }
  };

  const mappedMetrics = Object.entries(editedMapping).filter(([, v]) => v != null);
  const unmappedMetrics = Object.entries(editedMapping).filter(([, v]) => v == null);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetState(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {step === "upload" && "📥 Importer mes stats"}
            {step === "analyzing" && "🔍 Analyse en cours..."}
            {step === "validate" && "📊 Vérification du mapping"}
            {step === "correcting" && "✏️ Corriger le mapping"}
            {step === "preview" && "✅ Aperçu avant import"}
            {step === "importing" && "⏳ Import en cours..."}
            {step === "done" && "🎉 Import terminé !"}
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "L'outil détecte automatiquement tes colonnes. Pas besoin d'un format spécifique."}
            {step === "analyzing" && "L'IA analyse la structure de ton fichier..."}
            {step === "validate" && "Vérifie que c'est correct avant d'importer."}
            {step === "correcting" && "Pour chaque métrique, choisis la bonne colonne."}
          </DialogDescription>
        </DialogHeader>

        {/* STEP: UPLOAD */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-semibold text-sm">Glisse ton fichier ici ou clique pour choisir</p>
              <p className="text-xs text-muted-foreground mt-1">
                📊 Excel (.xlsx) · 📄 CSV (.csv)
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileSelect}
            />
            <p className="text-xs text-muted-foreground text-center">
              💡 L'outil détecte automatiquement tes colonnes. Pas besoin d'un format spécifique.
            </p>
          </div>
        )}

        {/* STEP: ANALYZING */}
        {step === "analyzing" && (
          <div className="flex flex-col items-center py-8 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyse de « {fileName} »...</p>
            <p className="text-xs text-muted-foreground">L'IA lit les en-têtes et identifie les colonnes.</p>
          </div>
        )}

        {/* STEP: VALIDATE */}
        {step === "validate" && aiMapping && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
              <span>Feuille : <strong>"{selectedSheet}"</strong></span>
              {aiMapping.confidence === "high" && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Confiance haute</span>}
              {aiMapping.confidence === "medium" && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Confiance moyenne</span>}
              {aiMapping.confidence === "low" && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Confiance faible</span>}
            </div>

            <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
              {/* Date column */}
              <div className="flex items-center justify-between px-3 py-2 text-sm bg-muted/30">
                <span>📅 <strong>{allHeaders[editedDateCol] || `Colonne ${editedDateCol}`}</strong></span>
                <span className="flex items-center gap-1 text-green-600"><Check className="w-3 h-3" /> Date</span>
              </div>

              {/* Mapped metrics */}
              {mappedMetrics.map(([metric, colIdx]) => {
                const meta = METRIC_LABELS[metric];
                if (!meta) return null;
                return (
                  <div key={metric} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-muted-foreground">
                      Col. {String.fromCharCode(65 + (colIdx as number))} · {allHeaders[colIdx as number] || "?"}
                    </span>
                    <span className="flex items-center gap-1 text-green-600">
                      <Check className="w-3 h-3" /> {meta.emoji} {meta.label}
                    </span>
                  </div>
                );
              })}

              {/* Skipped columns */}
              {(aiMapping.skip_columns || []).map(colIdx => (
                <div key={`skip-${colIdx}`} className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground">
                  <span>Col. {String.fromCharCode(65 + colIdx)} · {allHeaders[colIdx] || "?"}</span>
                  <span className="text-xs">⏭️ Ignoré (calculé)</span>
                </div>
              ))}

              {/* Unmapped */}
              {unmappedMetrics.length > 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Non trouvé : {unmappedMetrics.map(([m]) => METRIC_LABELS[m]?.label || m).join(", ")}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={() => runImport(editedMapping, editedDateCol, selectedSheet)} className="flex-1">
                ✅ C'est bon, importer
              </Button>
              <Button variant="outline" onClick={() => setStep("correcting")}>
                ✏️ Corriger
              </Button>
            </div>
          </div>
        )}

        {/* STEP: CORRECTING */}
        {step === "correcting" && (
          <div className="space-y-4">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">📅 Colonne Date</label>
                <Select value={String(editedDateCol)} onValueChange={v => setEditedDateCol(parseInt(v))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allHeaders.map((h, i) => (
                      <SelectItem key={i} value={String(i)}>Col. {String.fromCharCode(65 + i)} · {h || "(vide)"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {Object.entries(METRIC_LABELS).map(([metric, meta]) => (
                <div key={metric} className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{meta.emoji} {meta.label}</label>
                  <Select
                    value={editedMapping[metric] != null ? String(editedMapping[metric]) : "none"}
                    onValueChange={v => setEditedMapping(prev => ({ ...prev, [metric]: v === "none" ? null : parseInt(v) }))}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucune colonne</SelectItem>
                      {allHeaders.map((h, i) => (
                        <SelectItem key={i} value={String(i)}>Col. {String.fromCharCode(65 + i)} · {h || "(vide)"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => runImport(editedMapping, editedDateCol, selectedSheet)} className="flex-1">
                ✅ Valider et importer
              </Button>
              <Button variant="outline" onClick={() => setStep("validate")}>Retour</Button>
            </div>
          </div>
        )}

        {/* STEP: PREVIEW */}
        {step === "preview" && (
          <div className="space-y-4">
            {corrections.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
                <p className="font-semibold text-yellow-800">⚠️ {corrections.length} correction(s) automatique(s) :</p>
                {corrections.map((c, i) => <p key={i} className="text-yellow-700 text-xs mt-1">· {c}</p>)}
              </div>
            )}

            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-2 text-left font-semibold">Mois</th>
                    <th className="px-3 py-2 text-right font-semibold">Abonné·es</th>
                    <th className="px-3 py-2 text-right font-semibold">Portée</th>
                    <th className="px-3 py-2 text-right font-semibold">CA</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {previewRows.slice(0, 3).map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">{monthLabel(row.monthDate)}</td>
                      <td className="px-3 py-1.5 text-right">{row.payload.followers != null ? row.payload.followers.toLocaleString("fr-FR") : "–"}</td>
                      <td className="px-3 py-1.5 text-right">{row.payload.reach != null ? row.payload.reach.toLocaleString("fr-FR") : "–"}</td>
                      <td className="px-3 py-1.5 text-right">{row.payload.revenue != null ? `${row.payload.revenue.toLocaleString("fr-FR")}€` : "–"}</td>
                    </tr>
                  ))}
                  {previewRows.length > 6 && (
                    <tr><td colSpan={4} className="px-3 py-1 text-center text-muted-foreground">...</td></tr>
                  )}
                  {previewRows.slice(-3).map((row, i) => (
                    <tr key={`end-${i}`}>
                      <td className="px-3 py-1.5">{monthLabel(row.monthDate)}</td>
                      <td className="px-3 py-1.5 text-right">{row.payload.followers != null ? row.payload.followers.toLocaleString("fr-FR") : "–"}</td>
                      <td className="px-3 py-1.5 text-right">{row.payload.reach != null ? row.payload.reach.toLocaleString("fr-FR") : "–"}</td>
                      <td className="px-3 py-1.5 text-right">{row.payload.revenue != null ? `${row.payload.revenue.toLocaleString("fr-FR")}€` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-sm text-center text-muted-foreground">
              {previewRows.length} mois · {previewRows.length > 0 ? `${monthLabel(previewRows[0].monthDate)} → ${monthLabel(previewRows[previewRows.length - 1].monthDate)}` : ""}
            </p>

            {skippedRows.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {skippedRows.length} ligne(s) ignorée(s) : {skippedRows.map(s => `L${s.row}`).join(", ")}
              </p>
            )}

            <div className="flex gap-2">
              <Button onClick={handleConfirmImport} className="flex-1">✅ Importer</Button>
              <Button variant="outline" onClick={() => setStep("validate")}>❌ Annuler</Button>
            </div>
          </div>
        )}

        {/* STEP: IMPORTING */}
        {step === "importing" && (
          <div className="flex flex-col items-center py-8 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Import en cours...</p>
          </div>
        )}

        {/* STEP: DONE */}
        {step === "done" && (
          <div className="space-y-4 text-center py-4">
            <div className="text-4xl">🎉</div>
            <p className="font-semibold">{importedCount} mois importés</p>
            {previewRows.length > 0 && (
              <p className="text-sm text-muted-foreground">
                De {monthLabel(previewRows[0].monthDate)} à {monthLabel(previewRows[previewRows.length - 1].monthDate)}
              </p>
            )}
            {corrections.length > 0 && (
              <p className="text-xs text-muted-foreground">⚠️ {corrections.length} correction(s) d'année automatique(s)</p>
            )}
            <div className="flex gap-2 justify-center">
              <Button onClick={() => { resetState(); onOpenChange(false); }}>📊 Voir mes stats</Button>
              <Button variant="outline" onClick={resetState}>🔄 Réimporter</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
