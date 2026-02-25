import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FileText, Globe, Sparkles, Loader2, X, Instagram, Linkedin, LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { supabase } from "@/integrations/supabase/client";
import { extractTextFromFile, isAcceptedFile, ACCEPTED_MIME_TYPES } from "@/lib/file-extractors";
import type { BrandingExtraction } from "@/lib/branding-import-types";

const MAX_FILES = 10;
const MAX_CHARS = 100_000;

interface SocialLink {
  type: string;
  url: string;
  checked: boolean;
}

interface PrefillLinks {
  website?: string;
  instagram?: string;
  linkedin?: string;
  extra?: { type: string; url: string }[];
}

interface Props {
  onResult: (extraction: BrandingExtraction) => void;
  prefillLinks?: PrefillLinks;
}

const SOCIAL_ICON: Record<string, typeof Globe> = {
  instagram: Instagram,
  linkedin: Linkedin,
  website: Globe,
};

function getSocialIcon(type: string) {
  const Icon = SOCIAL_ICON[type.toLowerCase()] || LinkIcon;
  return <Icon className="h-3.5 w-3.5 shrink-0" />;
}

function truncateUrl(url: string, max = 30) {
  const clean = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

export default function BrandingImportBlock({ onResult, prefillLinks }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize from prefillLinks
  useEffect(() => {
    if (!prefillLinks) return;
    if (prefillLinks.website) setUrl(prefillLinks.website);

    const links: SocialLink[] = [];
    if (prefillLinks.instagram) links.push({ type: "instagram", url: prefillLinks.instagram, checked: true });
    if (prefillLinks.linkedin) links.push({ type: "linkedin", url: prefillLinks.linkedin, checked: true });
    if (prefillLinks.extra) {
      prefillLinks.extra.forEach((l) => links.push({ type: l.type.toLowerCase(), url: l.url, checked: true }));
    }
    if (links.length > 0) setSocialLinks(links);
  }, [prefillLinks]);

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => {
      const accepted = newFiles.filter(isAcceptedFile);
      if (accepted.length === 0 && newFiles.length > 0) {
        toast.error("Format non supporté. Utilise un PDF, Word ou fichier texte.");
        return prev;
      }
      const combined = [...prev, ...accepted];
      if (combined.length > MAX_FILES) {
        toast.error("10 fichiers maximum.");
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleSocialLink = (index: number) => {
    setSocialLinks((prev) => prev.map((l, i) => (i === index ? { ...l, checked: !l.checked } : l)));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const parts: string[] = [];

      // Extract text from all files
      if (files.length > 0) {
        for (const file of files) {
          const extractedText = await extractTextFromFile(file);
          if (extractedText.trim().length > 0) parts.push(extractedText.trim());
        }
      }

      // Add pasted text
      if (text.trim().length > 0) parts.push(text.trim());

      let combinedText = parts.join("\n\n--- DOCUMENT SUIVANT ---\n\n");

      if (combinedText.length > MAX_CHARS) {
        combinedText = combinedText.slice(0, MAX_CHARS);
        toast.info("Documents tronqués pour respecter la limite.");
      }

      // Build URL
      let cleanUrl: string | undefined;
      if (url.trim().length > 0) {
        cleanUrl = url.trim();
        if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) cleanUrl = `https://${cleanUrl}`;
        try { new URL(cleanUrl); } catch { toast.error("URL invalide."); setAnalyzing(false); return; }
      }

      // Build social links payload
      const checkedSocial = socialLinks.filter((l) => l.checked && l.url.trim());

      if (combinedText.length === 0 && !cleanUrl && checkedSocial.length === 0) {
        toast.error("Ajoute au moins un fichier, du texte, une URL ou des liens sociaux.");
        setAnalyzing(false);
        return;
      }

      if (combinedText.length > 0 && combinedText.length < 50 && !cleanUrl && checkedSocial.length === 0) {
        toast.error("Pas assez de contenu pour analyser. Ajoute plus de texte.");
        setAnalyzing(false);
        return;
      }

      const payload: { text?: string; url?: string; social_links?: { type: string; url: string }[] } = {};
      if (combinedText.length > 0) payload.text = combinedText;
      if (cleanUrl) payload.url = cleanUrl;
      if (checkedSocial.length > 0) payload.social_links = checkedSocial.map((l) => ({ type: l.type, url: l.url }));

      const { data, error } = await supabase.functions.invoke("analyze-branding-import", { body: payload });

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

  const hasInput = files.length > 0 || text.trim().length > 0 || url.trim().length > 0 || socialLinks.some((l) => l.checked && l.url.trim());

  const sourceCount = [files.length > 0, text.trim().length > 0, url.trim().length > 0].filter(Boolean).length;
  const analyzeLabel = files.length > 0
    ? `Analyser ${files.length} document${files.length > 1 ? "s" : ""}${sourceCount > 1 ? " + autres sources" : ""} et pré-remplir mon branding`
    : "Analyser et pré-remplir mon branding";

  if (analyzing) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-8 mb-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
        <p className="font-display font-bold text-foreground text-base mb-1">✨ On analyse tes documents…</p>
        <p className="text-sm text-muted-foreground">Ça peut prendre quelques secondes.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 mb-8">
      <h3 className="font-display font-bold text-foreground text-base mb-1">📄 Tu as déjà un document stratégique ?</h3>
      <p className="text-sm text-muted-foreground mb-5">Importe-le et on remplit tout pour toi.</p>

      {/* File drop zone */}
      <div
        className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors mb-4
          ${dragOver ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        {files.length > 0 ? (
          <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap gap-2 justify-center">
              {files.map((f, i) => (
                <Badge key={`${f.name}-${i}`} variant="secondary" className="gap-1.5 py-1 px-2.5 text-xs">
                  <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate max-w-[150px]">{f.name.length > 25 ? f.name.slice(0, 22) + "…" : f.name}</span>
                  <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-foreground ml-0.5"><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{files.length}/{MAX_FILES} fichiers</p>
            {files.length < MAX_FILES && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1" /> Ajouter d'autres fichiers
              </Button>
            )}
          </div>
        ) : (
          <>
            <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              <span className="max-md:hidden">📎 Glisse tes fichiers ici ou clique pour uploader (jusqu'à 10)</span>
              <span className="md:hidden">📎 Clique pour choisir des fichiers</span>
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">PDF, Word (.docx), texte (.txt) — jusqu'à 10 fichiers</p>
          </>
        )}
        <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_MIME_TYPES} onChange={handleFileSelect} className="hidden" />
      </div>

      {/* Social links section */}
      {socialLinks.length > 0 && (
        <div className="mb-4 rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">🔗 Liens à analyser</p>
          <div className="space-y-2">
            {socialLinks.map((link, i) => (
              <label key={i} className="flex items-center gap-3 cursor-pointer group">
                <Checkbox
                  checked={link.checked}
                  onCheckedChange={() => toggleSocialLink(i)}
                />
                <div className="flex items-center gap-2 min-w-0">
                  {getSocialIcon(link.type)}
                  <span className="text-xs font-medium text-foreground capitalize">{link.type}</span>
                  <span className="text-xs text-muted-foreground truncate">{truncateUrl(link.url)}</span>
                </div>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Les profils publics seront analysés pour enrichir le branding.</p>
        </div>
      )}

      {/* Separator */}
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground font-medium">ET / OU</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Text paste */}
      <div className="mb-4">
        <p className="text-sm font-medium text-foreground mb-2">📋 Colle ton texte directement</p>
        <Textarea
          placeholder="Colle ici ton brief, tes notes, ton plan de com'..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[100px]"
        />
      </div>

      {/* Separator */}
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground font-medium">ET / OU</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* URL input */}
      <div className="mb-5">
        <p className="text-sm font-medium text-foreground mb-2">🌐 Entre l'URL de ton site web</p>
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="https://monsite.com" value={url} onChange={(e) => setUrl(e.target.value)} className="pl-9" />
        </div>
      </div>

      {/* Analyze button */}
      <Button onClick={handleAnalyze} disabled={!hasInput} className="w-full gap-2" size="lg">
        <Sparkles className="h-4 w-4" />
        {analyzeLabel}
      </Button>
    </div>
  );
}
