/**
 * BrandPhotosPicker — « Tes photos » juste après l'onboarding.
 *
 * Au moment où l'utilisatrice découvre sa marque (fin de relecture de fiche,
 * /welcome), on va chercher TOUT SEUL les photos déjà publiées :
 *  - sur son site (profiles.website_url, saisi pendant l'onboarding) ;
 *  - sur Instagram SI le compte est connecté (API officielle, jamais de
 *    scraping — le simple @ de l'onboarding ne suffit pas).
 * Elle coche celles qui lui ressemblent → elles partent dans la bibliothèque
 * par le circuit existant (useUploadLibraryPhotos : compression, user_photos,
 * description IA en arrière-plan, sans crédit consommé).
 *
 * Réutilise l'edge site-photos-scan et les helpers de SitePhotoImportDialog
 * (NE PAS dupliquer le parsing). Rien trouvé / pas de site → la carte ne
 * s'affiche pas : jamais d'écran vide au moment du « waouh ».
 */

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Images } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useSocialConnections } from "@/hooks/use-social-connections";
import { useUploadLibraryPhotos } from "@/hooks/use-user-photos";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { posthog } from "@/lib/posthog";
import {
  base64ToFile,
  fileNameFromUrl,
  type SiteImageCandidate,
} from "@/components/photos/SitePhotoImportDialog";

/** En dessous de 200 px réels, ce n'est pas une photo exploitable. */
const MIN_REAL_WIDTH = 200;
/** Même plafond que la bibliothèque (MAX_BATCH de PhotosPage). */
const MAX_SELECTABLE = 20;
/** Aperçu replié : assez pour choisir, sans noyer la page. */
const PREVIEW_COUNT = 12;
const FETCH_CONCURRENCY = 3;

type Status = "loading" | "ready" | "hidden" | "importing" | "done";

interface BrandPhotosPickerProps {
  /** Où la carte est affichée (analytics). */
  placement: "welcome" | "brand_review";
  className?: string;
}

/** Même garde que le dialogue : le champ profil peut contenir du texte libre. */
function looksLikeUrl(value: string): boolean {
  const v = value.trim();
  return !!v && !/\s/.test(v) && v.includes(".");
}

/**
 * Le champ Instagram du profil accepte aussi bien « @lamaiastra » qu'une URL
 * complète. On en extrait le pseudo nu pour pouvoir le comparer au compte
 * réellement connecté en OAuth.
 */
function normalizeInstagramHandle(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const fromUrl = raw.match(/instagram\.com\/([^/?#\s]+)/i)?.[1] ?? raw;
  const handle = fromUrl.replace(/^@/, "").split(/[/?#]/)[0].trim().toLowerCase();
  return handle || null;
}

export function BrandPhotosPicker({ placement, className }: BrandPhotosPickerProps) {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const workspaceId = useWorkspaceId();
  const { connected, accountNames, loading: connectionsLoading } = useSocialConnections();
  const instagramConnected = !!connected.instagram;
  const connectedInstagramHandle = normalizeInstagramHandle(accountNames.instagram);
  const { mutate: uploadLibrary } = useUploadLibraryPhotos();

  const [status, setStatus] = useState<Status>("loading");
  const [candidates, setCandidates] = useState<SiteImageCandidate[]>([]);
  const [hiddenUrls, setHiddenUrls] = useState<Set<string>>(new Set());
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [hasSite, setHasSite] = useState(false);
  // Le compte Instagram connecté correspond-il bien à la marque du profil ?
  const [instagramUsed, setInstagramUsed] = useState(false);
  // Un seul scan par montage (StrictMode monte deux fois en dev).
  const scanStarted = useRef(false);

  useEffect(() => {
    if (isDemoMode || !user?.id) {
      setStatus("hidden");
      return;
    }
    // On attend de savoir si Instagram est connecté avant de lancer.
    if (connectionsLoading) return;
    if (scanStarted.current) return;
    scanStarted.current = true;

    void (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("website_url, instagram_url, instagram_username")
        .eq("user_id", user.id)
        .maybeSingle();
      const websiteUrl = (profile?.website_url ?? "").trim();
      const siteOk = looksLikeUrl(websiteUrl);
      setHasSite(siteOk);

      // Le compte connecté en OAuth peut appartenir à une autre marque que
      // celle décrite dans le profil (réinitialisation d'onboarding, test).
      // Dans ce cas on ignore Instagram : on ne mélange pas deux marques.
      const profileHandle =
        normalizeInstagramHandle(profile?.instagram_username) ??
        normalizeInstagramHandle(profile?.instagram_url);
      const instagramMatchesBrand =
        instagramConnected &&
        (!profileHandle || !connectedInstagramHandle || profileHandle === connectedInstagramHandle);
      setInstagramUsed(instagramMatchesBrand);

      const scans: Promise<SiteImageCandidate[]>[] = [];
      if (instagramMatchesBrand) {
        scans.push(
          invokeWithTimeout(
            "site-photos-scan",
            {
              body: {
                mode: "instagram",
                workspace_id: workspaceId !== user.id ? workspaceId : undefined,
              },
            },
            45_000,
          ).then(({ data }) => (data?.images as SiteImageCandidate[]) ?? []),
        );
      }
      if (siteOk) {
        scans.push(
          invokeWithTimeout(
            "site-photos-scan",
            { body: { mode: "scan", websiteUrl } },
            45_000,
          ).then(({ data }) => (data?.images as SiteImageCandidate[]) ?? []),
        );
      }
      if (scans.length === 0) {
        setStatus("hidden");
        return;
      }

      const results = await Promise.allSettled(scans);
      const seen = new Set<string>();
      const merged: SiteImageCandidate[] = [];
      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        for (const c of r.value) {
          if (!c?.url || seen.has(c.url)) continue;
          seen.add(c.url);
          merged.push(c);
        }
      }
      setCandidates(merged);
      setStatus(merged.length > 0 ? "ready" : "hidden");
      if (merged.length > 0) {
        posthog.capture("brand_photos_picker_shown", {
          placement,
          count: merged.length,
          instagram: instagramMatchesBrand,
        });
      }
    })().catch((e) => {
      console.error("[BrandPhotosPicker] scan failed:", e);
      setStatus("hidden");
    });
  }, [
    isDemoMode,
    user?.id,
    workspaceId,
    connectionsLoading,
    instagramConnected,
    connectedInstagramHandle,
    placement,
  ]);

  const visible = candidates.filter((c) => !hiddenUrls.has(c.url));

  // Toutes les images ont été écartées au chargement (mortes / trop petites) :
  // la carte se retire plutôt que d'afficher une grille vide.
  useEffect(() => {
    if (status === "ready" && candidates.length > 0 && visible.length === 0) setStatus("hidden");
  }, [status, candidates.length, visible.length]);

  if (status === "hidden") return null;

  const shown = expanded ? visible : visible.slice(0, PREVIEW_COUNT);
  const atMax = selectedUrls.length >= MAX_SELECTABLE;

  const hide = (u: string) => {
    setHiddenUrls((cur) => new Set(cur).add(u));
    setSelectedUrls((cur) => cur.filter((x) => x !== u));
  };

  const toggle = (u: string) => {
    setSelectedUrls((cur) => {
      if (cur.includes(u)) return cur.filter((x) => x !== u);
      if (cur.length >= MAX_SELECTABLE) return cur;
      return [...cur, u];
    });
  };

  async function handleImport() {
    if (selectedUrls.length === 0) return;
    setStatus("importing");
    try {
      const byUrl = new Map(candidates.map((c) => [c.url, c]));
      const queue = [...selectedUrls];
      const files: File[] = [];
      let failed = 0;
      const worker = async () => {
        while (queue.length > 0) {
          const imageUrl = queue.shift()!;
          const { data, error } = await invokeWithTimeout(
            "site-photos-scan",
            { body: { mode: "fetch", imageUrl } },
            45_000,
          );
          if (error || data?.error || !data?.base64) {
            failed++;
            continue;
          }
          const contentType: string = data.contentType || "image/jpeg";
          files.push(
            base64ToFile(
              data.base64,
              contentType,
              fileNameFromUrl(imageUrl, contentType, byUrl.get(imageUrl)?.name),
            ),
          );
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(FETCH_CONCURRENCY, selectedUrls.length) }, worker),
      );

      if (files.length === 0) {
        toast.error("Aucune photo n'a pu être récupérée. Réessaie.");
        setStatus("ready");
        return;
      }
      const { uploaded, failed: uploadFailed } = await uploadLibrary(files);
      const totalFailed = failed + uploadFailed;
      if (totalFailed > 0) {
        toast.warning(`${totalFailed} photo${totalFailed > 1 ? "s" : ""} n'a pas pu être ajoutée.`);
      }
      if (uploaded === 0) {
        setStatus("ready");
        return;
      }
      posthog.capture("brand_photos_imported", { placement, count: uploaded });
      setImportedCount(uploaded);
      setStatus("done");
    } catch (e) {
      console.error("[BrandPhotosPicker] import failed:", e);
      toast.error(e instanceof Error ? e.message : "L'ajout de tes photos a échoué. Réessaie.");
      setStatus("ready");
    }
  }

  const sourceLabel = instagramUsed
    ? hasSite
      ? "sur ton site et ton Instagram"
      : "sur ton Instagram"
    : "sur ton site";

  return (
    <div className={cn("rounded-2xl bg-card border border-border p-5 space-y-4 text-left", className)}>
      <div className="flex items-start gap-3">
        <Images className="h-5 w-5 text-primary shrink-0 mt-0.5" strokeWidth={1.75} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Tes photos</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {status === "loading"
              ? "Je cherche les photos déjà publiées sur ton site…"
              : status === "done"
                ? `${importedCount} photo${importedCount > 1 ? "s ajoutées" : " ajoutée"} à ta bibliothèque. Je les décris en arrière-plan : tu les retrouves dans Mes photos, prêtes pour tes contenus.`
                : `Je les ai trouvées ${sourceLabel}. Choisis celles qui te ressemblent : elles serviront à tes contenus.`}
          </p>
        </div>
      </div>

      {status === "loading" && (
        <div className="grid grid-cols-4 gap-2" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {(status === "ready" || status === "importing") && (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {shown.map((c) => {
              const selected = selectedUrls.includes(c.url);
              const disabled = status === "importing" || (atMax && !selected);
              return (
                <button
                  key={c.url}
                  type="button"
                  onClick={() => toggle(c.url)}
                  disabled={disabled}
                  aria-pressed={selected}
                  title={c.alt ?? undefined}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-lg border bg-secondary transition",
                    selected ? "ring-2 ring-primary border-primary" : "border-border hover:border-primary/40",
                    disabled && !selected && "opacity-40 cursor-not-allowed",
                  )}
                >
                  <img
                    src={c.url}
                    alt={c.alt ?? ""}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={() => hide(c.url)}
                    onLoad={(e) => {
                      if (e.currentTarget.naturalWidth < MIN_REAL_WIDTH) hide(c.url);
                    }}
                  />
                  {selected && (
                    <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {visible.length > PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full text-xs font-medium text-primary hover:underline"
            >
              {expanded ? "Voir moins ↑" : `Voir les ${visible.length - PREVIEW_COUNT} autres photos ↓`}
            </button>
          )}

          <p className="text-2xs text-muted-foreground">
            Choisis uniquement des images qui t'appartiennent (pas de photos de banque d'images sous licence).
            {!instagramConnected &&
              " Tes photos Instagram ? Connecte ton compte depuis Paramètres › Connexions pour les importer aussi."}
          </p>

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {selectedUrls.length} / {MAX_SELECTABLE} sélectionnée{selectedUrls.length > 1 ? "s" : ""}
            </span>
            <Button
              size="sm"
              className="rounded-pill"
              onClick={handleImport}
              disabled={selectedUrls.length === 0 || status === "importing"}
            >
              {status === "importing" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Ajout en cours…
                </>
              ) : selectedUrls.length === 0 ? (
                "Choisis tes photos"
              ) : (
                `Ajouter ${selectedUrls.length} photo${selectedUrls.length > 1 ? "s" : ""} à ma bibliothèque`
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
