import { Button } from "@/components/ui/button";
import { Upload, X, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CharterData {
  uploaded_templates: { url: string; name: string }[];
  [key: string]: any;
}

interface CharterTemplatesSectionProps {
  data: CharterData;
  onDataChange: (updates: Partial<CharterData>) => void;
  userId: string;
  templatesUploading: boolean;
  setTemplatesUploading: React.Dispatch<React.SetStateAction<boolean>>;
  onAuditTemplates: () => void;
  auditing: boolean;
}

export default function CharterTemplatesSection({
  data,
  onDataChange,
  userId,
  templatesUploading,
  setTemplatesUploading,
  onAuditTemplates,
  auditing,
}: CharterTemplatesSectionProps) {
  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !userId) return;
    if (data.uploaded_templates.length + files.length > 10) {
      toast.error("Maximum 10 templates");
      return;
    }
    setTemplatesUploading(true);
    try {
      const newTemplates = [...data.uploaded_templates];
      for (const file of Array.from(files)) {
        const path = `${userId}/templates/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from("brand-assets").upload(path, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);
        newTemplates.push({ url: urlData.publicUrl, name: file.name });
      }
      onDataChange({ uploaded_templates: newTemplates });
      toast.success("Templates uploadés !");
    } catch (err: any) {
      toast.error("Erreur lors de l'upload");
      console.error(err);
    } finally {
      setTemplatesUploading(false);
    }
  };

  const removeTemplate = (idx: number) => {
    onDataChange({ uploaded_templates: data.uploaded_templates.filter((_: any, i: number) => i !== idx) });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-base font-bold text-foreground mb-4">📐 Mes templates existants</h2>

      {data.uploaded_templates.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-4">
          {data.uploaded_templates.map((t: { url: string; name: string }, idx: number) => (
            <div key={idx} className="relative group">
              <img
                src={t.url}
                alt={t.name}
                className="w-full aspect-square object-cover rounded-xl border border-border"
              />
              <button
                onClick={() => removeTemplate(idx)}
                className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
              <p className="text-[10px] text-muted-foreground mt-1 truncate">{t.name}</p>
            </div>
          ))}
        </div>
      )}

      {data.uploaded_templates.length < 10 && (
        <label className="flex flex-col items-center gap-2 cursor-pointer rounded-xl border-2 border-dashed border-border hover:border-primary/40 transition-colors p-6">
          <Upload className="h-6 w-6 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {templatesUploading ? "Upload en cours..." : "Uploader des templates (PNG, JPG, PDF)"}
          </span>
          <input
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={handleTemplateUpload}
            disabled={templatesUploading}
          />
        </label>
      )}

      {data.uploaded_templates.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 gap-1.5 text-xs w-full"
          onClick={onAuditTemplates}
          disabled={auditing}
        >
          {auditing ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyse en cours...</>
          ) : (
            <><Search className="h-3.5 w-3.5" /> 🔍 Auditer mes templates</>
          )}
        </Button>
      )}
    </section>
  );
}
