import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronDown } from "lucide-react";
import { InputIndicator, isValidUrl, addHttpsIfNeeded } from "./OnboardingShared";
import type { Answers, UploadedFile } from "@/hooks/use-onboarding";
import { toast } from "sonner";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useAuth } from "@/contexts/AuthContext";
import { useSocialConnections } from "@/hooks/use-social-connections";
import { startSocialConnect } from "@/lib/social-connect";
import CharterReferenceLinks from "@/components/branding/charter/CharterReferenceLinks";

/* ── Étape 4 : la promesse est explicite (« ton espace arrive déjà rempli »)
   et le chemin sans site (capture Instagram) est un vrai plan A-bis, plus un
   champ optionnel noyé. LinkedIn passe en repli : utile mais jamais bloquant. ── */

export default function OnboardingPhase2Import({ answers, set, files, uploading, onUpload, onRemove, onNext, onLeave, isDemoMode
}: {answers: Answers;set: <K extends keyof Answers>(k: K, v: Answers[K]) => void;files: UploadedFile[];uploading: boolean;onUpload: (files: FileList | null) => void;onRemove: (id: string) => void;onNext: () => void;onLeave?: (url: string) => void;isDemoMode?: boolean;}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [linkedinOpen, setLinkedinOpen] = useState(() => !!answers.linkedin_summary);
  // Ouvert d'office si quelque chose y est déjà rempli (retour en arrière,
  // brouillon restauré) : on ne cache jamais une saisie de l'utilisatrice.
  const [moreOpen, setMoreOpen] = useState(() =>
    !!answers.linkedin_summary || !!answers.visual_reference_links?.length,
  );
  const workspaceId = useWorkspaceId();
  const { user } = useAuth();
  const { isConnected, accountNames } = useSocialConnections();
  const igConnected = isConnected("instagram");
  const liPublishingConnected = isConnected("linkedin");
  const liAnalyticsConnected = isConnected("linkedin_analytics");
  const [connecting, setConnecting] = useState(false);
  // Plus de champ @ : le compte connecté le donne au diagnostic et au choix des canaux.
  useEffect(() => {
    const handle = accountNames.instagram?.trim();
    if (igConnected && handle && !answers.instagram) set("instagram", `@${handle.replace(/^@/, "")}`);
  }, [igConnected, accountNames.instagram]); // eslint-disable-line react-hooks/exhaustive-deps

  const connectInstagram = async () => {
    // Sauvegarde immédiate (la persistance normale est différée) avant de quitter la page.
    try { localStorage.setItem("lac_onboarding_answers", JSON.stringify(answers)); } catch { /* ignore */ }
    setConnecting(true);
    const res = await startSocialConnect(
      "instagram",
      workspaceId && workspaceId !== user?.id ? workspaceId : undefined,
      { depuis: "/onboarding", quoi: "ton démarrage" },
    );
    if (res.error) {
      setConnecting(false);
      toast.error("Impossible d'ouvrir la connexion Instagram", { description: "Ajoute plutôt une capture de ton profil, tu pourras connecter ton compte plus tard." });
    }
  };
  const connectLinkedIn = async () => {
    try { localStorage.setItem("lac_onboarding_answers", JSON.stringify(answers)); } catch { /* ignore */ }
    setConnecting(true);
    const res = await startSocialConnect(
      "linkedin",
      workspaceId && workspaceId !== user?.id ? workspaceId : undefined,
      { depuis: "/onboarding", quoi: "ton démarrage" },
    );
    if (res.error) {
      setConnecting(false);
      toast.error("Impossible d'ouvrir la connexion LinkedIn", { description: "Tu pourras connecter ton compte plus tard, depuis Paramètres." });
    }
  };
  const connectLinkedInAnalytics = async () => {
    try { localStorage.setItem("lac_onboarding_answers", JSON.stringify(answers)); } catch { /* ignore */ }
    setConnecting(true);
    const res = await startSocialConnect(
      "linkedin_analytics",
      workspaceId && workspaceId !== user?.id ? workspaceId : undefined,
      { depuis: "/onboarding", quoi: "ton démarrage" },
    );
    if (res.error) {
      setConnecting(false);
      toast.error("Connexion LinkedIn Analytics indisponible", { description: "Continue avec ton texte À propos ou une capture." });
    }
  };
  const hasAnyLink = !!(answers.website || answers.instagram || answers.linkedin_summary);
  const hasAnything = hasAnyLink || files.length > 0 || !!answers.visual_reference_links?.length || igConnected || liPublishingConnected || liAnalyticsConnected;

  const webStatus: "valid" | "warn" | "none" = !answers.website ? "none" :
  isValidUrl(addHttpsIfNeeded(answers.website)) ? "valid" : "warn";

  const continueFromImport = () => {
    if (uploading) return;
    if (webStatus === "warn") {
      toast.error("L'adresse de ton site semble invalide", {
        description: "Corrige-la ou vide le champ pour continuer sans site.",
      });
      return;
    }
    const website = addHttpsIfNeeded(answers.website);
    if (website !== answers.website) set("website", website);
    onLeave?.(website);
    onNext();
  };

  const isImageFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return ['png', 'jpg', 'jpeg', 'webp'].includes(ext);
  };

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Tu as un site, un Instagram ou un LinkedIn&nbsp;?
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          J'y repère ce qui m'aide à préparer ta fiche de marque. Tu vérifieras tout avant.
        </p>
      </div>

      {/* Toujours monté : le bouton « captures » du bloc « Tes comptes » l'ouvre. */}
      {!isDemoMode && (
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          onChange={(e) => { onUpload(e.target.files); e.target.value = ""; }}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1} />
      )}

      <div className="space-y-3">
        {/* Site et comptes visibles sans défiler ; le texte LinkedIn et les
            exemples restent dans « Plus d'options ». */}
        <div className="rounded-2xl border-2 border-primary/25 bg-card p-4 space-y-3">
          <div>
            <label htmlFor="onb-site" className="text-sm font-semibold text-foreground mb-1.5 block">🌐 Ton site web</label>
            <div className="relative">
              <input
                id="onb-site"
                type="text"
                inputMode="url"
                value={answers.website}
                onChange={(e) => set("website", e.target.value)}
                onBlur={() => {if (answers.website) set("website", addHttpsIfNeeded(answers.website));}}
                placeholder="https://tonsite.fr"
                aria-label="URL de ton site web"
                aria-invalid={webStatus === "warn"}
                className="w-full text-base p-3 pr-10 border-2 border-border rounded-xl focus:border-primary outline-none bg-background transition-colors text-foreground placeholder:text-muted-foreground/50" />

              <InputIndicator status={webStatus} />
            </div>
            {webStatus === "warn" && <p className="text-xs text-destructive mt-2">Vérifie cette adresse ou efface-la pour passer sans site.</p>}
          </div>
        </div>

        {/* Comptes : on CONNECTE au lieu de taper un @ (retour d'une cliente en
            rendez-vous, 19/11/2026 : le @ seul ne me laisse rien lire). LinkedIn
            au même niveau qu'Instagram. Sans compte Pro, ou pour que je lise un
            profil LinkedIn, les captures restent juste en dessous. */}
        <div className="rounded-2xl border-2 border-primary/25 bg-card p-4 space-y-3" data-testid="onb-comptes">
          <p className="text-sm font-semibold text-foreground">Tes comptes</p>
          {isDemoMode ? (
            <p className="text-xs text-muted-foreground">La connexion des comptes n'est pas disponible en démo.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <AccountRow
                emoji="📱" name="Instagram" connected={igConnected}
                account={accountNames.instagram ? `@${accountNames.instagram}` : undefined}
                hint="Compte Pro ou Créateur"
                busy={connecting} onConnect={connectInstagram} />
              <AccountRow
                emoji="💼" name="LinkedIn" connected={liPublishingConnected}
                account={accountNames.linkedin || undefined}
                hint="Pour publier depuis l'app"
                busy={connecting} onConnect={connectLinkedIn} />
            </div>
          )}
          {!isDemoMode && (
            <div className="rounded-xl bg-secondary/40 p-3 space-y-2" data-testid="insta-captures-hint">
              <p className="text-xs text-muted-foreground">
                {files.length > 0
                  ? `📸 ${files.length} capture${files.length > 1 ? "s" : ""} ajoutée${files.length > 1 ? "s" : ""} : je lirai ton profil avec.`
                  : "Pas de compte Pro, ou tu veux que je lise ton profil LinkedIn ? Ajoute 1 à 3 captures de ton profil : c'est ce qui me montre ce qui est vraiment visible."}
              </p>
              {files.length < 3 && (
                <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={uploading} onClick={() => inputRef.current?.click()}>
                  {files.length > 0 ? "Ajouter une capture" : "📸 Ajouter des captures"}
                </Button>
              )}
              {uploading && <p className="text-sm text-muted-foreground animate-pulse">Import en cours...</p>}
              {files.length > 0 &&
              <div className="grid grid-cols-3 gap-2">
                  {files.map((f) =>
                <div key={f.id} className="relative group rounded-xl border border-border overflow-hidden bg-card aspect-square">
                      {isImageFile(f.name) && f.previewUrl ?
                  <img loading="lazy"
                    src={f.previewUrl}
                    alt={f.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {(e.target as HTMLImageElement).style.display = 'none';}} /> :
                  <div className="w-full h-full flex items-center justify-center">
                          <span className="text-2xl">📱</span>
                        </div>
                  }
                      <button
                    onClick={() => onRemove(f.id)}
                    type="button"
                    aria-label={`Retirer ${f.name}`}
                    className="absolute top-1 right-1 bg-background/80 rounded-full p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                )}
                </div>
              }
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline underline-offset-4 py-1"
          aria-expanded={moreOpen}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
          Plus d'options <span className="text-xs font-normal text-muted-foreground">(texte LinkedIn, exemples)</span>
        </button>

        {moreOpen && <div className="space-y-3">
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
              <p className="text-xs text-muted-foreground/70 mb-2 italic">Copie-colle le texte de la section "Infos" de ton profil LinkedIn. La lecture automatique ne fonctionne pas avec LinkedIn, alors c'est plus fiable comme ça.</p>
              {!isDemoMode && <div className="mb-3 rounded-xl bg-secondary/40 p-3 text-xs text-muted-foreground">
                {liAnalyticsConnected
                  ? "✅ LinkedIn Analytics connecté : les chiffres disponibles pourront compléter le diagnostic. Le texte du profil reste à fournir ici ou par capture."
                  : liPublishingConnected
                    ? "Ton compte est connecté pour publier. Cette connexion ne donne pas accès au texte de ton profil ni aux statistiques."
                    : "La lecture du profil et des posts LinkedIn n'est pas incluse dans la connexion de publication."}
                {!liAnalyticsConnected && <Button type="button" size="sm" variant="outline" className="mt-2 block rounded-full" disabled={connecting} onClick={connectLinkedInAnalytics}>Connecter LinkedIn Analytics</Button>}
              </div>}
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

        {!isDemoMode && <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Des exemples de ton univers ?</h2>
          <p className="mt-1 mb-3 text-xs text-muted-foreground">Facultatif : ajoute plusieurs sites, créations ou vidéos que tu aimes, ou que tu veux éviter. Tu pourras aussi compléter cette fiche plus tard dans Mon identité.</p>
          <CharterReferenceLinks links={answers.visual_reference_links || []} onChange={links => set("visual_reference_links", links)} />
        </div>}
        </div>}
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button onClick={continueFromImport} disabled={uploading} className="rounded-full px-8">
          {uploading ? "Ajout en cours…" : hasAnything ? "Ajouter mes éléments et continuer →" : "Passer cette étape →"}
        </Button>
        {!hasAnything &&
        <p className="text-xs text-muted-foreground/60 italic">Sans lien ni capture, ton espace démarrera vide et mon diagnostic sera moins précis</p>
        }
      </div>
    </div>);

}

/** Une ligne de compte : « Connecter » tant que ce n'est pas fait, puis ✅ et le nom. */
function AccountRow({ emoji, name, connected, account, hint, busy, onConnect }: {
  emoji: string; name: string; connected: boolean; account?: string; hint: string; busy: boolean; onConnect: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{emoji} {name}</p>
        <p className="text-xs text-muted-foreground truncate">{connected ? `✅ Connecté${account ? ` (${account})` : ""}` : hint}</p>
      </div>
      {!connected && (
        <Button type="button" size="sm" variant="outline" className="rounded-full shrink-0" disabled={busy} onClick={onConnect}>
          {busy ? "Ouverture…" : "Connecter"}
        </Button>
      )}
    </div>
  );
}
