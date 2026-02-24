import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Upload, FileText, Globe, Sparkles, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { supabase } from "@/integrations/supabase/client";
import { extractTextFromFile, isAcceptedFile, ACCEPTED_MIME_TYPES } from "@/lib/file-extractors";
import type { BrandingExtraction } from "@/lib/branding-import-types";

interface Props {
  onResult: (extraction: BrandingExtraction) => void;
}

export default function BrandingImportBlock({ onResult }: Props) {
  const [mode, setMode] = useState<'idle' | 'file' | 'text' | 'url'>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && isAcceptedFile(droppedFile)) {
      setFile(droppedFile);
      setMode('file');
    } else {
      toast.error("Format non supporté. Utilise un PDF, Word ou fichier texte.");
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && isAcceptedFile(f)) {
      setFile(f);
      setMode('file');
    } else if (f) {
      toast.error("Format non supporté. Utilise un PDF, Word ou fichier texte.");
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      let payload: { text?: string; url?: string } = {};

      if (mode === 'file' && file) {
        const extractedText = await extractTextFromFile(file);
        if (extractedText.trim().length < 50) {
          toast.error("Le fichier ne contient pas assez de texte.");
          setAnalyzing(false);
          return;
        }
        payload = { text: extractedText };
      } else if (mode === 'text') {
        if (text.trim().length < 50) {
          toast.error("Colle au moins quelques phrases pour qu'on puisse analyser.");
          setAnalyzing(false);
          return;
        }
        payload = { text: text.trim() };
      } else if (mode === 'url') {
        let cleanUrl = url.trim();
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
          cleanUrl = `https://${cleanUrl}`;
        }
        try {
          new URL(cleanUrl);
        } catch {
          toast.error("URL invalide. Vérifie le lien.");
          setAnalyzing(false);
          return;
        }
        payload = { url: cleanUrl };
      } else {
        toast.error("Choisis un fichier, colle du texte ou entre une URL.");
        setAnalyzing(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('analyze-branding-import', {
        body: payload,
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.extraction) throw new Error("Réponse inattendue");

      onResult(data.extraction as BrandingExtraction);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast.error(friendlyError(e));
    } finally {
      setAnalyzing(false);
    }
  };

  const hasInput = (mode === 'file' && file) || (mode === 'text' && text.trim().length > 0) || (mode === 'url' && url.trim().length > 0);

  if (analyzing) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-8 mb-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
        <p className="font-display font-bold text-foreground text-base mb-1">
          ✨ On analyse ton document…
        </p>
        <p className="text-sm text-muted-foreground">
          Ça peut prendre quelques secondes.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 mb-8">
      <h3 className="font-display font-bold text-foreground text-base mb-1">
        📄 Tu as déjà un document stratégique ?
      </h3>
      <p className="text-sm text-muted-foreground mb-5">
        Importe-le et on remplit tout pour toi.
      </p>

      {/* File drop zone */}
      <div
        className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors mb-4
          ${dragOver ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{file.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); setMode('idle'); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              <span className="max-md:hidden">📎 Glisse ton fichier ici ou clique pour uploader</span>
              <span className="md:hidden">📎 Clique pour choisir un fichier</span>
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Formats acceptés : PDF, Word (.docx), texte (.txt)
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MIME_TYPES}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Separator */}
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground font-medium">OU</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Text paste */}
      <div className="mb-4">
        <p className="text-sm font-medium text-foreground mb-2">📋 Colle ton texte directement</p>
        <Textarea
          placeholder="Colle ici ton brief, tes notes, ton plan de com'..."
          value={text}
          onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) setMode('text'); }}
          className="min-h-[100px]"
        />
      </div>

      {/* Separator */}
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground font-medium">OU</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* URL input */}
      <div className="mb-5">
        <p className="text-sm font-medium text-foreground mb-2">🌐 Entre l'URL de ton site web</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="https://monsite.com"
              value={url}
              onChange={(e) => { setUrl(e.target.value); if (e.target.value.trim()) setMode('url'); }}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Analyze button */}
      <Button
        onClick={handleAnalyze}
        disabled={!hasInput}
        className="w-full gap-2"
        size="lg"
      >
        <Sparkles className="h-4 w-4" />
        Analyser et pré-remplir mon branding
      </Button>
    </div>
  );
}
