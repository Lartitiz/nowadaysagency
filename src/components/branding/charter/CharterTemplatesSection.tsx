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
    if (!files) return;

    // Always use the authenticated user's ID for storage path (matches RLS policy)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Vous devez être connectée pour uploader des fichiers");
      return;
    }
    const authUserId = user.id;

    if (data.uploaded_templates.length + files.length > 20) {
      toast.error("Maximum 20 templates");
      return;
    }
    setTemplatesUploading(true);
    try {
      const newTemplates = [...data.uploaded_templates];
      for (const file of Array.from(files)) {
        // Sanitize filename to avoid storage path issues
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${authUserId}/templates/${Date.now()}-${safeName}`;
        const { error } = await supabase.storage.from("brand-assets").upload(path, file, {
          cacheControl: '3600',
          upsert: false,
        });
        if (error) {
          console.error("Upload error:", error.message, error);
          throw error;
        }
        const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);
        newTemplates.push({ url: urlData.publicUrl, name: file.name });
      }
      onDataChange({ uploaded_templates: newTemplates });
      toast.success("Templates uploadés !");
    } catch (err: any) {
      console.error("Upload failed:", err);
      toast.error(err?.message || "Erreur lors de l'upload");
    } finally {
      setTemplatesUploading(false);
    }
  };

  const removeTemplate = (idx: number) => {
    onDataChange({ uploaded_templates: data.uploaded_templates.filter((_: any, i: number) => i !== idx) });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-base font-bold text-foreground mb-1">📐 Analyse tes visuels existants</h2>
      <p className="text-sm text-muted-foreground mb-4">Uploade tes visuels actuels (posts Instagram, stories, flyers, cartes de visite…) et on analyse automatiquement ta charte : couleurs, style, typographies. Ça pré-remplit tout pour toi.</p>

      {data.uploaded_templates.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-4">
          {data.uploaded_templates.map((t: { url: string; name: string }, idx: number) => {
            const isPdf = t.name?.toLowerCase().endsWith('.pdf') || t.url?.toLowerCase().includes('.pdf');
            return (
              <div key={idx} className="relative group">
                {isPdf ? (
                  <div className="w-full aspect-square rounded-xl border border-border bg-muted/40 flex flex-col items-center justify-center gap-1">
                    <svg className="h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <span className="text-[9px] text-muted-foreground font-medium">PDF</span>
                  </div>
                ) : (
                  <img
                    src={t.url}
                    alt={t.name}
                    className="w-full aspect-square object-cover rounded-xl border border-border"
                  />
                )}
                <button
                  onClick={() => removeTemplate(idx)}
                  className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
                <p className="text-[10px] text-muted-foreground mt-1 truncate">{t.name}</p>
              </div>
            );
          })}
        </div>
      )}

      {data.uploaded_templates.length < 20 && (
        <label className="flex flex-col items-center gap-2 cursor-pointer rounded-xl border-2 border-dashed border-border hover:border-primary/40 transition-colors p-6">
          <Upload className="h-6 w-6 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {templatesUploading ? "Upload en cours..." : "Ajouter des visuels à analyser (PNG, JPG, PDF)"}
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
        <div className="mt-3 space-y-1.5">
          <Button
            variant="default"
            size="sm"
            className="gap-1.5 text-xs w-full"
            onClick={onAuditTemplates}
            disabled={auditing}
          >
            {auditing ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyse en cours...</>
            ) : (
              <>✨ Analyser et pré-remplir ma charte</>
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center">L'IA détecte tes couleurs, ton style et te propose une charte cohérente</p>
        </div>
      )}
    </section>
  );
}
