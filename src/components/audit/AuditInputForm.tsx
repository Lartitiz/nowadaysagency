import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { Button } from "@/components/ui/button";
import { ImagePlus, Loader2, Sparkles, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { UX_UPLOAD_LIMITS, uxSizeError } from "@/lib/upload-limits";
import { memoriseRetour } from "@/lib/retour-apres-detour";

// Écran d'audit « deux portes » : soit le compte Instagram est connecté et TOUT est
// récupéré automatiquement (bio, abonnés, vraies stats, top/flop posts), soit on
// audite depuis le @ public. Les captures d'écran restent possibles mais facultatives
// (repliées) : elles servent uniquement à l'analyse visuelle du feed.
export interface AuditFormData {
  mode: "connected" | "handle";
  username: string;
  profileScreenshots: File[];
}

interface AuditInputFormProps {
  initialUsername?: string;
  onSubmit: (data: AuditFormData) => void;
  loading: boolean;
  isRedo?: boolean;
  // null = statut de connexion pas encore connu (social-status en cours)
  instagramConnected: boolean | null;
}

export default function AuditInputForm({ initialUsername, onSubmit, loading, isRedo, instagramConnected }: AuditInputFormProps) {
  const [username, setUsername] = useState(initialUsername || "");
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [showScreenshots, setShowScreenshots] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cleanHandle = username.trim().replace(/^@/, "");

  const addFiles = (fl: FileList | null) => {
    if (!fl) return;
    const all = Array.from(fl);
    const kept = all.filter((f) => f.size <= UX_UPLOAD_LIMITS.media);
    // Un fichier écarté sans message = échec silencieux : on prévient
    all.filter((f) => f.size > UX_UPLOAD_LIMITS.media).forEach((f) => toast.error(uxSizeError(f, UX_UPLOAD_LIMITS.media)!));
    setScreenshots((prev) => [...prev, ...kept].slice(0, 5));
  };

  return (
    <div className="space-y-4">
      {isRedo && (
        <div className="rounded-2xl border border-primary/30 bg-rose-pale p-4">
          <p className="text-sm text-foreground">
            🔄 On relance une analyse complète avec tes données à jour.
          </p>
        </div>
      )}

      {/* ── Porte 1 : compte connecté ── */}
      <div className="rounded-2xl border-2 border-primary/40 bg-card p-5">
        <span className="inline-block rounded-pill bg-rose-pale px-3 py-1 text-xs font-semibold text-primary">Recommandé</span>
        <h3 className="mt-3 text-base font-bold text-foreground">📊 Avec ton compte connecté</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Bio, abonnés, vraies statistiques et tes meilleurs/pires posts sont récupérés automatiquement. L'audit le plus précis, sans rien recopier.
        </p>
        {instagramConnected === null ? (
          <Button disabled className="mt-4 w-full rounded-pill gap-2 h-11">
            <Loader2 className="h-4 w-4 animate-spin" />
            Vérification de ta connexion...
          </Button>
        ) : instagramConnected ? (
          <Button onClick={() => onSubmit({ mode: "connected", username: cleanHandle, profileScreenshots: screenshots })} disabled={loading} className="mt-4 w-full rounded-pill gap-2 h-11">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Analyse en cours..." : "Lancer l'audit avec mes vraies stats"}
          </Button>
        ) : (
          <Button asChild className="mt-4 w-full rounded-pill gap-2 h-11">
            {/* Une fois connectée, on la ramène ici plutôt que de la laisser dans les paramètres. */}
            <Link to="/parametres/connexions" onClick={() => memoriseRetour()}>
              🔗 Connecter mon compte Instagram
            </Link>
          </Button>
        )}
      </div>

      {/* ── Porte 2 : juste le @ ── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-base font-bold text-foreground">✍️ Sans connexion</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          On récupère ce que ta page publique montre (nom, description). Audit plus léger, sans les statistiques.
        </p>
        <div className="mt-4 flex gap-2 max-sm:flex-col">
          <Input
            aria-label="Ton nom d'utilisateur Instagram"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="@toncompte"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && cleanHandle && !loading) {
                onSubmit({ mode: "handle", username: cleanHandle, profileScreenshots: screenshots });
              }
            }}
          />
          <Button
            variant="outline"
            onClick={() => onSubmit({ mode: "handle", username: cleanHandle, profileScreenshots: screenshots })}
            disabled={loading || (!cleanHandle && screenshots.length === 0)}
            className="rounded-pill gap-2 shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "🔍"}
            Lancer l'audit
          </Button>
        </div>
      </div>

      {/* ── Captures facultatives (repliées) ── */}
      <div>
        <button
          type="button"
          onClick={() => setShowScreenshots((s) => !s)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {showScreenshots ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          📸 Ajouter des captures d'écran (facultatif)
        </button>
        {showScreenshots && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Avec une capture de ton profil ou de ton feed, l'IA analyse aussi ton identité visuelle et l'ambiance de ton compte.
            </p>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add("border-primary", "bg-primary/5"); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove("border-primary", "bg-primary/5"); }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove("border-primary", "bg-primary/5"); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
              className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <ImagePlus className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">Glisse tes captures ici ou clique pour parcourir (5 max)</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            {screenshots.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {screenshots.map((f, i) => (
                  <div key={i} className="relative w-24 h-24 rounded-xl border border-border bg-muted/30 overflow-hidden group">
                    <img loading="lazy" src={URL.createObjectURL(f)} alt="Aperçu de la capture d'écran importée" className="w-full h-full object-cover" />
                    <button
                      aria-label="Retirer cette capture"
                      onClick={() => setScreenshots(screenshots.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
