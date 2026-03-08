import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X } from "lucide-react";
import { InputIndicator, isValidUrl, addHttpsIfNeeded } from "./OnboardingShared";
import type { Answers, UploadedFile } from "@/hooks/use-onboarding";

export default function OnboardingPhase2Import({ answers, set, files, uploading, onUpload, onRemove, onNext, onLeave, isDemoMode









}: {answers: Answers;set: <K extends keyof Answers>(k: K, v: Answers[K]) => void;files: UploadedFile[];uploading: boolean;onUpload: (files: FileList | null) => void;onRemove: (id: string) => void;onNext: () => void;onLeave?: () => void;isDemoMode?: boolean;}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasAnyLink = !!(answers.website || answers.linkedin);
  const hasAnything = hasAnyLink || files.length > 0;

  const webStatus: "valid" | "warn" | "none" = !answers.website ? "none" :
  isValidUrl(answers.website) ? "valid" : "warn";

  const isImageFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return ['png', 'jpg', 'jpeg', 'webp'].includes(ext);
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Montre-moi ce que tu fais déjà
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Plus tu me donnes d'infos, plus mon diagnostic sera précis.
        </p>
      </div>

      <div className="space-y-4">
        {/* Website */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">🌐 Ton site web</label>
          <div className="relative">
            <input
              type="text"
              value={answers.website}
              onChange={(e) => set("website", e.target.value)}
              onBlur={() => {if (answers.website) set("website", addHttpsIfNeeded(answers.website));}}
              placeholder="https://tonsite.fr"
              aria-label="URL de ton site web"
              className="w-full text-base p-3 pr-10 border-2 border-border rounded-xl focus:border-primary outline-none bg-card transition-colors text-foreground placeholder:text-muted-foreground/50" />
            
            <InputIndicator status={webStatus} />
          </div>
        </div>

        {/* LinkedIn Summary */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">💼 Ton à propos ou ton résumé LinkedIn </label>
          <p className="text-xs text-muted-foreground/70 mb-2 italic">Copie-colle le texte de la section "Infos" de ton profil LinkedIn. Le scraping automatique ne fonctionne pas avec LinkedIn, alors c'est plus fiable comme ça.</p>
          <textarea
            value={answers.linkedin_summary}
            onChange={(e) => set("linkedin_summary", e.target.value)}
            placeholder="Ex : J'accompagne les entrepreneures à développer leur marque personnelle…"
            aria-label="Résumé LinkedIn"
            rows={4}
            className="w-full text-base p-3 border-2 border-border rounded-xl focus:border-primary outline-none bg-card transition-colors text-foreground placeholder:text-muted-foreground/50 resize-none" />
          
        </div>


        {/* Instagram screenshot upload */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">📸 Capture d'écran de ton profil Instagram</label>
          <p className="text-xs text-muted-foreground/70 mb-2 italic">
            Optionnel mais recommandé : fais une capture d'écran de ton profil Instagram (la page avec ta bio, tes abonnés et ta grille). Ça permet une analyse plus complète.
          </p>

          {!isDemoMode && files.length < 3 &&
          <div
            onClick={() => inputRef.current?.click()}
            onDragEnter={(e) => {e.preventDefault();e.stopPropagation();}}
            onDragOver={(e) => {e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect = "copy";}}
            onDrop={(e) => {e.preventDefault();e.stopPropagation();if (e.dataTransfer.files?.length) onUpload(e.dataTransfer.files);}}
            className="border-2 border-dashed border-border rounded-xl p-5 text-center cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition-colors">
            
              <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-xs font-medium text-foreground">📸 Glisse ta capture d'écran ici</p>
              <p className="text-xs text-muted-foreground/70 mt-1">PNG, JPG, WebP · Max 3 fichiers</p>
              <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              onChange={(e) => onUpload(e.target.files)}
              className="hidden" />
            
            </div>
          }

          {uploading &&
          <p className="text-sm text-muted-foreground text-center animate-pulse mt-2">Upload en cours...</p>
          }

          {files.length > 0 &&
          <div className="grid grid-cols-3 gap-2 mt-2">
              {files.map((f) =>
            <div key={f.id} className="relative group rounded-xl border border-border overflow-hidden bg-card aspect-square">
                  {isImageFile(f.name) && f.url ?
              <img
                src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/onboarding-uploads/${f.url}`}
                alt={f.name}
                className="w-full h-full object-cover"
                onError={(e) => {(e.target as HTMLImageElement).style.display = 'none';}} /> :


              <div className="w-full h-full flex items-center justify-center">
                      <span className="text-2xl">📱</span>
                    </div>
              }
                  <button
                onClick={() => onRemove(f.id)}
                className="absolute top-1 right-1 bg-background/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <p className="absolute bottom-0 left-0 right-0 bg-background/70 text-[10px] text-foreground truncate px-1.5 py-0.5">{f.name}</p>
                </div>
            )}
            </div>
          }
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button onClick={() => {onLeave?.();onNext();}} className="rounded-full px-8">
          {hasAnything ? "Suivant →" : "Passer →"}
        </Button>
        {!hasAnything &&
        <p className="text-xs text-muted-foreground/60 italic">Sans liens ni captures, mon diagnostic sera moins précis</p>
        }
      </div>
    </div>);

}