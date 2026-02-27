import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Globe, Instagram, Linkedin, Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

interface BrandingImportProps {
  onAnalyze: (data: { website?: string; instagram?: string; linkedin?: string; files: File[] }) => void;
  onSkip: () => void;
  loading?: boolean;
  initialWebsite?: string;
  initialInstagram?: string;
  initialLinkedin?: string;
  reanalyzeWarning?: boolean;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ".pdf,.docx,.doc,.txt,.md,.png,.jpg,.jpeg";

export default function BrandingImport({ onAnalyze, onSkip, loading = false, initialWebsite = "", initialInstagram = "", initialLinkedin = "", reanalyzeWarning = false }: BrandingImportProps) {
  const [website, setWebsite] = useState(initialWebsite);
  const [instagram, setInstagram] = useState(initialInstagram);
  const [linkedin, setLinkedin] = useState(initialLinkedin);
  const [files, setFiles] = useState<File[]>([]);
  const [docsOpen, setDocsOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasAnyInput = website.trim() || instagram.trim() || linkedin.trim() || files.length > 0;

  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const accepted: File[] = [];
    for (const file of Array.from(newFiles)) {
      if (files.length + accepted.length >= MAX_FILES) { toast.error(`Maximum ${MAX_FILES} fichiers`); break; }
      if (file.size > MAX_FILE_SIZE) { toast.error(`${file.name} dépasse 10 Mo`); continue; }
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["pdf", "docx", "doc", "txt", "md", "png", "jpg", "jpeg"].includes(ext || "")) { toast.error(`Format non supporté : .${ext}`); continue; }
      accepted.push(file);
    }
    if (accepted.length) setFiles((prev) => [...prev, ...accepted]);
  }, [files.length]);

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleSubmit = () => {
    if (!hasAnyInput) return;
    onAnalyze({ website: website.trim() || undefined, instagram: instagram.trim() || undefined, linkedin: linkedin.trim() || undefined, files });
  };

  const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };
  const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } } };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <motion.div className="w-full max-w-[560px]" variants={stagger} initial="hidden" animate="visible">
        {/* Header */}
        <motion.div variants={fadeUp} className="text-center mb-10">
          <h1 className="font-display text-[28px] sm:text-[34px] text-foreground leading-tight mb-3">
            {reanalyzeWarning ? "Réanalyser mes liens" : "Dis-moi où te trouver"}
          </h1>
          <p className="font-mono-ui text-[14px] text-muted-foreground leading-relaxed max-w-[480px] mx-auto">
            {reanalyzeWarning
              ? "Modifie tes liens si besoin, puis relance l'analyse. Les sections que tu as verrouillées ne seront pas touchées."
              : "Dépose tes liens et je m'occupe du reste. Je vais analyser ta présence en ligne et pré-remplir ton branding. Tu n'auras qu'à ajuster."}
          </p>
        </motion.div>

        {/* Reanalyze warning */}
        {reanalyzeWarning && (
          <motion.div variants={fadeUp} className="bg-amber-50 border border-amber-200 rounded-[16px] p-4 mb-4 text-[13px] text-amber-800">
            ⚠️ Attention : relancer l'analyse va proposer de nouvelles données pour les sections que tu n'as pas verrouillées. Les sections validées ne seront pas touchées.
          </motion.div>
        )}

        {/* Links card */}
        <motion.div variants={fadeUp} className="bg-card rounded-[20px] border border-border shadow-card p-6 sm:p-8 mb-4">
          <motion.div variants={stagger} className="space-y-4">
            <motion.div variants={fadeUp}>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
                <Globe className="h-5 w-5 text-primary" /> Ton site web
              </label>
              <Input type="url" placeholder="https://monsite.fr" value={website} onChange={(e) => setWebsite(e.target.value)} disabled={loading} />
              <p className="text-[11px] text-muted-foreground mt-1">Optionnel</p>
            </motion.div>
            <motion.div variants={fadeUp}>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
                <Instagram className="h-5 w-5 text-primary" /> Ton Instagram
              </label>
              <Input type="text" placeholder="@moncompte ou URL" value={instagram} onChange={(e) => setInstagram(e.target.value)} disabled={loading} />
              <p className="text-[11px] text-muted-foreground mt-1">Optionnel</p>
            </motion.div>
            <motion.div variants={fadeUp}>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
                <Linkedin className="h-5 w-5 text-primary" /> Ton LinkedIn
              </label>
              <Input type="url" placeholder="URL de ton profil ou ta page" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} disabled={loading} />
              <p className="text-[11px] text-muted-foreground mt-1">Optionnel</p>
            </motion.div>
          </motion.div>
          <p className="text-[13px] text-muted-foreground text-center mt-5 italic">Même un seul lien suffit pour commencer !</p>
        </motion.div>

        {/* Document upload */}
        <motion.div variants={fadeUp} className="mb-6">
          <Collapsible open={docsOpen} onOpenChange={setDocsOpen}>
            <CollapsibleTrigger className="w-full text-left">
              <div className="rounded-[20px] border border-dashed border-border bg-card/60 hover:bg-card transition-colors p-4 cursor-pointer">
                <p className="text-[13px] text-muted-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Tu as aussi des documents ? (plaquette, business plan, présentation...)
                </p>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div
                className={`rounded-[16px] border-2 border-dashed transition-colors p-6 text-center ${dragOver ? "border-primary bg-primary/5" : "border-border bg-card/40"}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-1">
                  Glisse tes fichiers ici ou{" "}
                  <button type="button" className="text-primary underline underline-offset-2" onClick={() => fileInputRef.current?.click()}>parcourir</button>
                </p>
                <p className="text-[11px] text-muted-foreground">PDF, Word, texte ou images • Max 5 fichiers, 10 Mo chacun</p>
                <input ref={fileInputRef} type="file" className="hidden" accept={ACCEPTED_EXTENSIONS} multiple onChange={(e) => e.target.files && handleFiles(e.target.files)} />
              </div>
              {files.length > 0 && (
                <div className="mt-3 space-y-2">
                  {files.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-card rounded-lg border border-border px-3 py-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1 text-foreground">{file.name}</span>
                      <span className="text-[11px] text-muted-foreground shrink-0">{(file.size / 1024 / 1024).toFixed(1)} Mo</span>
                      <button type="button" onClick={() => removeFile(idx)} className="text-muted-foreground hover:text-destructive transition-colors"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </motion.div>

        {/* CTA */}
        <motion.div variants={fadeUp} className="text-center space-y-4">
          <Button
            onClick={handleSubmit}
            disabled={!hasAnyInput || loading}
            className="w-full sm:w-auto bg-primary hover:bg-bordeaux text-primary-foreground rounded-[12px] px-10 py-6 text-base font-semibold shadow-cta hover:shadow-strong hover:scale-[1.02] transition-all duration-200"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Analyse en cours...
              </span>
            ) : reanalyzeWarning ? "Réanalyser ✨" : "Analyse mon projet ✨"}
          </Button>
          <button onClick={onSkip} className="block mx-auto font-mono-ui text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            {reanalyzeWarning ? "← Retour au branding" : "Je préfère remplir manuellement →"}
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
