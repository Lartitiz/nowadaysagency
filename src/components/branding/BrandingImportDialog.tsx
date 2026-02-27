import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { extractTextFromFile, ACCEPTED_MIME_TYPES } from "@/lib/file-extractors";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { toast } from "sonner";
import { Upload, Loader2, FileText } from "lucide-react";

interface FieldDef {
  key: string;
  label: string;
}

interface BrandingImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionTitle: string;
  sectionTable: string;
  fields: FieldDef[];
  existingData: Record<string, any>;
  filterColumn: string;
  filterValue: string;
  onImportDone: (updatedData: Record<string, any>) => void;
}

type Step = "input" | "loading" | "review";

export default function BrandingImportDialog({
  open,
  onOpenChange,
  sectionTitle,
  sectionTable,
  fields,
  existingData,
  filterColumn,
  filterValue,
  onImportDone,
}: BrandingImportDialogProps) {
  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<Record<string, string | null>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const workspaceId = useWorkspaceId();

  const reset = () => {
    setStep("input");
    setText("");
    setFileName(null);
    setExtracted({});
    setChecked({});
    setEditedValues({});
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await extractTextFromFile(file);
      setText(content);
      setFileName(file.name);
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la lecture du fichier");
    }
  };

  const handleAnalyze = async () => {
    if (!text.trim()) {
      toast.error("Colle du texte ou importe un fichier d'abord.");
      return;
    }

    setStep("loading");

    try {
      const { data, error } = await supabase.functions.invoke("import-branding-data", {
        body: {
          section: sectionTable,
          text: text.trim(),
          fields: fields.map((f) => ({ key: f.key, label: f.label })),
          workspace_id: workspaceId,
        },
      });

      if (error) throw new Error(error.message || "Erreur lors de l'analyse");
      if (data?.error) throw new Error(data.error);

      const result = data.extracted as Record<string, string | null>;
      setExtracted(result);

      // Pre-check and pre-fill only non-null values
      const initialChecked: Record<string, boolean> = {};
      const initialEdited: Record<string, string> = {};
      for (const f of fields) {
        if (result[f.key] && result[f.key] !== null) {
          initialChecked[f.key] = true;
          initialEdited[f.key] = result[f.key]!;
        }
      }
      setChecked(initialChecked);
      setEditedValues(initialEdited);
      setStep("review");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'analyse");
      setStep("input");
    }
  };

  const handleValidate = async () => {
    const updates: Record<string, string> = {};
    for (const [key, isChecked] of Object.entries(checked)) {
      if (isChecked && editedValues[key]) {
        updates[key] = editedValues[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      toast.error("Aucun champ sélectionné.");
      return;
    }

    try {
      const { error } = await (supabase.from(sectionTable as any) as any)
        .update(updates)
        .eq(filterColumn, filterValue);

      if (error) throw error;

      toast.success(`${Object.keys(updates).length} champ(s) importé(s) avec succès !`);
      onImportDone({ ...existingData, ...updates });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erreur lors de la sauvegarde : " + (err.message || ""));
    }
  };

  const filledFields = fields.filter((f) => extracted[f.key] && extracted[f.key] !== null);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {step === "review" ? "Vérifier l'import" : `Importer dans ${sectionTitle}`}
          </DialogTitle>
        </DialogHeader>

        {/* INPUT STEP */}
        {step === "input" && (
          <div className="space-y-4">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Colle ici tes données : un brief, un document, des notes... L'IA les répartira automatiquement dans les bons champs."
              className="min-h-[200px] text-sm"
            />

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                Ou importer un fichier
              </Button>
              {fileName && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <FileText className="h-3 w-3" /> {fileName}
                </span>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_MIME_TYPES}
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            <Button className="w-full" onClick={handleAnalyze} disabled={!text.trim()}>
              Analyser et remplir
            </Button>
          </div>
        )}

        {/* LOADING STEP */}
        {step === "loading" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">L'IA analyse ton document…</p>
          </div>
        )}

        {/* REVIEW STEP */}
        {step === "review" && (
          <div className="space-y-4">
            {filledFields.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">Aucune donnée pertinente détectée dans le texte.</p>
                <Button variant="outline" className="mt-4" onClick={() => setStep("input")}>
                  ← Réessayer
                </Button>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {filledFields.length} champ(s) détecté(s). Décoche ceux que tu ne veux pas importer.
                </p>

                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                  {filledFields.map((f) => (
                    <div
                      key={f.key}
                      className="rounded-xl border border-border p-4 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={checked[f.key] || false}
                          onCheckedChange={(v) =>
                            setChecked((prev) => ({ ...prev, [f.key]: !!v }))
                          }
                        />
                        <label className="text-xs font-semibold text-foreground uppercase tracking-wide">
                          {f.label}
                        </label>
                      </div>
                      <Textarea
                        value={editedValues[f.key] || ""}
                        onChange={(e) =>
                          setEditedValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                        }
                        className="text-[13px] min-h-[60px]"
                        disabled={!checked[f.key]}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep("input")}>
                    ← Retour
                  </Button>
                  <Button className="flex-1" onClick={handleValidate}>
                    Valider l'import
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
