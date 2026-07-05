import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, ChevronDown } from "lucide-react";
import { InputIndicator, isValidUrl, addHttpsIfNeeded } from "./OnboardingShared";
import type { Answers, UploadedFile } from "@/hooks/use-onboarding";

/* ── Étape 4 : la promesse est explicite (« ton espace arrive déjà rempli »)
   et le chemin sans site (capture Instagram) est un vrai plan A-bis, plus un
   champ optionnel noyé. LinkedIn passe en repli : utile mais jamais bloquant. ── */

export default function OnboardingPhase2Import({ answers, set, files, uploading, onUpload, onRemove, onNext, onLeave, isDemoMode
}: {answers: Answers;set: <K extends keyof Answers>(k: K, v: Answers[K]) => void;files: UploadedFile[];uploading: boolean;onUpload: (files: FileList | null) => void;onRemove: (id: string) => void;onNext: () => void;onLeave?: () => void;isDemoMode?: boolean;}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [linkedinOpen, setLinkedinOpen] = useState(() => !!answers.linkedin_summary);
  const hasAnyLink = !!(answers.website || answers.linkedin_summary);
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
          2 minutes qui font 80 % du travail
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Donne-moi un lien : j'en tire tes couleurs, ton ton, ton histoire, tes offres.
          Ton espace arrivera déjà rempli.
        </p>
      </div>

      <div className="space-y-3">
        {/* Website — le chemin le plus riche, mis en avant */}
        <div className="rounded-2xl border-2 border-primary/25 bg-card p-4">
          <label className="text-sm font-semibold text-foreground mb-2 block">🌐 Ton site web</label>
          <div className="relative">
            <input
              type="text"
              value={answers.website}
              onChange={(e) => set("website", e.target.value)}
              onBlur={() => {if (answers.website) set("website", addHttpsIfNeeded(answers.website));}}
              placeholder="https://tonsite.fr"
              aria-label="URL de ton site web"
              className="w-full text-base p-3 pr-10 border-2 border-border rounded-xl focus:border-primary outline-none bg-background transition-colors text-foreground placeholder:text-muted-foreground/50" />

            <InputIndicator status={webStatus} />
          </div>
        </div>

        {/* Instagram — le plan A-bis assumé, pas une option noyée */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">📸 Pas de site ? Ton Instagram suffit.</p>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            Une capture d'écran de ton profil (bio + grille) et j'en lis ton univers.
          </p>

          {!isDemoMode && files.length < 3 &&
          <div
            onClick={() => inputRef.current?.click()}
            onDragEnter={(e) => {e.preventDefault();e.stopPropagation();}}
            onDragOver={(e) => {e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect = "copy";}}
            onDrop={(e) => {e.preventDefault();e.stopPropagation();if (e.dataTransfer.files?.length) onUpload(e.dataTransfer.files);}}
            className="border-2 border-dashed border-primary/30 rounded-xl p-4 text-center cursor-pointer hover:border-primary/60 hover:bg-secondary/30 transition-colors">

              <Upload className="h-5 w-5 mx-auto text-bordeaux mb-1.5" />
              <p className="text-sm font-medium text-bordeaux">Ajouter une capture de mon profil</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Clique ou glisse ici · PNG, JPG, WebP · Max 3</p>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {files.map((f) =>
            <div key={f.id} className="relative group rounded-xl border border-border overflow-hidden bg-card aspect-square">
                  {isImageFile(f.name) && f.url ?
              <img loading="lazy"
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
                  <p className="absolute bottom-0 left-0 right-0 bg-background/70 text-2xs text-foreground truncate px-1.5 py-0.5">{f.name}</p>
                </div>
            )}
            </div>
          }
        </div>

        {/* LinkedIn — replié : utile, jamais bloquant */}
        <div>
          <button
            type="button"
            onClick={() => setLinkedinOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
            aria-expanded={linkedinOpen}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${linkedinOpen ? "rotate-180" : ""}`} />
            💼 Ajouter mon à propos LinkedIn <span className="text-muted-foreground/60">(optionnel)</span>
          </button>

          {linkedinOpen &&
          <div className="mt-2">
              <p className="text-xs text-muted-foreground/70 mb-2 italic">Copie-colle le texte de la section "Infos" de ton profil LinkedIn. Le scraping automatique ne fonctionne pas avec LinkedIn, alors c'est plus fiable comme ça.</p>
              <textarea
              value={answers.linkedin_summary}
              onChange={(e) => set("linkedin_summary", e.target.value)}
              placeholder="Ex : J'accompagne les entrepreneures à développer leur marque personnelle…"
              aria-label="Résumé LinkedIn"
              rows={4}
              className="w-full text-base p-3 border-2 border-border rounded-xl focus:border-primary outline-none bg-card transition-colors text-foreground placeholder:text-muted-foreground/50 resize-none" />

            </div>
          }
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button onClick={() => {onLeave?.();onNext();}} className="rounded-full px-8">
          {hasAnything ? "Continuer →" : "Passer cette étape →"}
        </Button>
        {!hasAnything &&
        <p className="text-xs text-muted-foreground/60 italic">Sans lien ni capture, ton espace démarrera vide et mon diagnostic sera moins précis</p>
        }
      </div>
    </div>);

}
