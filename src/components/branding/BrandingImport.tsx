import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Globe, Instagram, Linkedin, Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { UX_UPLOAD_LIMITS, uxSizeError } from "@/lib/upload-limits";

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
const MAX_FILE_SIZE = UX_UPLOAD_LIMITS.media;
// Keep in sync with file-extractors.ts — images aren't supported (no OCR),
// so don't offer them here or they'd be silently dropped after analysis.
const ACCEPTED_EXTENSIONS = ".pdf,.docx,.doc,.txt,.md";

// Instagram et LinkedIn étaient proposés ici jusqu'en mars 2026 (retirés sans
// explication, alors que analyze-brand les lit toujours). Remis le 15/10/2026
// (chantier F) : ces deux sites bloquent parfois la lecture, d'où la phrase
// qui conseille le site ou un document, et la relecture qui signale l'échec.
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
      if (file.size > MAX_FILE_SIZE) { toast.error(uxSizeError(file, MAX_FILE_SIZE)!); continue; }
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["pdf", "docx", "doc", "txt", "md"].includes(ext || "")) { toast.error(`Format non supporté : .${ext}`); continue; }
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
    <div className="flex justify-center px-0 py-2 sm:px-4 sm:py-6">
      {/* initial={false} : pas d'anim d'entrée à opacity 0 — sous la charge de
          re-renders du live, l'anim restait figée à opacity ~0 → formulaire
          invisible (« écran blanc »). On rend directement à l'état visible. */}
      <motion.div className="w-full max-w-[560px]" variants={stagger} initial={false} animate="visible">
        {/* Header */}
        <motion.div variants={fadeUp} className="text-center mb-6">
          <h1 className="font-display text-2xl sm:text-3xl text-foreground leading-tight mb-2">
            {reanalyzeWarning ? "Actualiser mon identité depuis mes liens" : "Remplir mon identité à partir de mes liens"}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-[480px] mx-auto">
            {reanalyzeWarning
              ? "Modifie tes liens si besoin, puis relance la lecture. Les rubriques que tu as validées ne seront pas touchées."
              : "Je lis ce que tu as déjà publié et je remplis ta fiche. Tu relis et tu corriges ensuite. Un seul lien suffit."}
          </p>
        </motion.div>

        {/* Liens : site, Instagram, LinkedIn */}
        <motion.div variants={fadeUp} className="mb-3 space-y-2.5">
          {([
            { id: "import-website", label: "Mon site", icon: Globe, type: "url", placeholder: "https://monsite.com", value: website, set: setWebsite },
            { id: "import-instagram", label: "Mon compte Instagram", icon: Instagram, type: "text", placeholder: "@moncompte", value: instagram, set: setInstagram },
            { id: "import-linkedin", label: "Mon profil LinkedIn", icon: Linkedin, type: "url", placeholder: "https://linkedin.com/in/monprofil", value: linkedin, set: setLinkedin },
          ] as const).map(({ id, label, icon: Icon, type, placeholder, value, set }) => (
            <div key={id} className="relative">
              <label htmlFor={id} className="sr-only">{label}</label>
              <Icon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <Input
                id={id}
                type={type}
                placeholder={placeholder}
                aria-label={label}
                value={value}
                onChange={(e) => set(e.target.value)}
                className="pl-10 h-11 rounded-[14px] bg-card border-border text-foreground placeholder:text-muted-foreground/60"
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Instagram et LinkedIn bloquent parfois la lecture : ton site ou un document donnent le meilleur résultat.</p>
        </motion.div>



        {/* Document upload */}
        <motion.div variants={fadeUp} className="mb-5">
          <Collapsible open={docsOpen} onOpenChange={setDocsOpen}>
            <CollapsibleTrigger className="w-full text-left">
              <div className="rounded-[20px] border border-dashed border-border bg-card/60 hover:bg-card transition-colors px-4 py-3 cursor-pointer">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary shrink-0" /> Ajouter des documents (plaquette, présentation…)
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
                <p className="text-2xs text-muted-foreground">PDF, Word ou texte • Max 5 fichiers, 10 Mo chacun</p>
                <input ref={fileInputRef} type="file" className="hidden" accept={ACCEPTED_EXTENSIONS} multiple onChange={(e) => e.target.files && handleFiles(e.target.files)} />
              </div>
              {files.length > 0 && (
                <div className="mt-3 space-y-2">
                  {files.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-card rounded-lg border border-border px-3 py-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1 text-foreground">{file.name}</span>
                      <span className="text-2xs text-muted-foreground shrink-0">{(file.size / 1024 / 1024).toFixed(1)} Mo</span>
                      <button type="button" onClick={() => removeFile(idx)} className="text-muted-foreground hover:text-destructive transition-colors"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </motion.div>

        {/* CTA */}
        <motion.div variants={fadeUp} className="text-center space-y-3">
          <Button
            onClick={handleSubmit}
            disabled={!hasAnyInput || loading}
            className="w-full sm:w-auto bg-primary hover:bg-bordeaux text-primary-foreground rounded-[12px] px-10 py-5 text-base font-semibold shadow-cta hover:shadow-strong hover:scale-[1.02] transition-all duration-200"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Spinner className="h-4 w-4 text-primary-foreground" />
                Lecture en cours…
              </span>
            ) : reanalyzeWarning ? "Actualiser mon identité" : "Remplir mon identité"}
          </Button>
          <button type="button" onClick={onSkip} className="block mx-auto text-sm text-muted-foreground hover:text-foreground transition-colors">
            {reanalyzeWarning ? "← Retour à mon identité" : "← Je préfère remplir moi-même"}
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
